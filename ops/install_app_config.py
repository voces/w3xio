#!/usr/bin/python3 -I
"""Install an app's systemd unit and nginx site from its checkout.

Runs as root through sudo, so it must be installed root-owned outside any
checkout (see ops/README.md). It reads config files the app's repo ships, checks
them against rules that keep them from granting more than the app's own user
already has, and installs them to destinations fixed here, never named by the
repo. A unit or site that fails `systemd-analyze verify` or `nginx -t` leaves
the previous files in place.

    sudo /usr/local/sbin/install-app-config <app>
"""

from __future__ import annotations

import os
import re
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from typing import Callable, Sequence

MAX_BYTES = 64 * 1024
BACKUP_DIR = "/var/backups/app-config"


@dataclass(frozen=True)
class ConfigFile:
    source: str
    dest: str
    kind: str


@dataclass(frozen=True)
class App:
    checkout: str
    user: str
    files: Sequence[ConfigFile]
    environment_files: Sequence[str] = ()
    # Other configs nginx loads, checked so a site can't shadow their servers.
    nginx_dirs: Sequence[str] = ("/etc/nginx/sites-enabled", "/etc/nginx/conf.d")


APPS: dict[str, App] = {
    "emoji-sheep-tag": App(
        checkout="/home/ubuntu/emoji-sheep-tag",
        user="ubuntu",
        files=(
            ConfigFile(
                "ops/emojist.service",
                "/etc/systemd/system/emojist.service",
                "systemd",
            ),
            ConfigFile(
                "ops/nginx/est.w3x.io.conf",
                "/etc/nginx/sites-enabled/est.w3x.io.conf",
                "nginx",
            ),
        ),
        environment_files=("/etc/emojist/env",),
    ),
}


# --- systemd -----------------------------------------------------------------

SYSTEMD_KEYS: dict[str, set[str]] = {
    "Unit": {
        "Description",
        "Documentation",
        "After",
        "Wants",
        "Requires",
        "StartLimitIntervalSec",
        "StartLimitBurst",
    },
    "Service": {
        "Type",
        "NotifyAccess",
        "User",
        "Group",
        "WorkingDirectory",
        "ExecStart",
        "Environment",
        "EnvironmentFile",
        "StateDirectory",
        "Restart",
        "RestartSec",
        "WatchdogSec",
        "TimeoutStartSec",
        "TimeoutStopSec",
        "KillMode",
        "KillSignal",
        "LimitNOFILE",
        "NoNewPrivileges",
        "PrivateTmp",
        "CPUQuota",
        "CPUQuotaPeriodSec",
        "CPUWeight",
        "IOWeight",
    },
    "Install": {"WantedBy"},
}

TARGET = re.compile(r"^[A-Za-z0-9@._-]+\.target$")
STATE_DIRECTORY = re.compile(r"^[A-Za-z0-9._-]+$")


def validate_systemd(text: str, app: App) -> list[str]:
    """Errors that would let this unit run anything beyond `app.user`."""
    errors: list[str] = []
    section: str | None = None
    seen: dict[str, list[str]] = {}

    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        if line.endswith("\\"):
            errors.append(f"line {number}: line continuations are not allowed")
            continue
        if line.startswith("["):
            section = line[1:-1] if line.endswith("]") else line
            if section not in SYSTEMD_KEYS:
                errors.append(f"line {number}: section [{section}] is not allowed")
            continue
        if "=" not in line:
            errors.append(f"line {number}: expected Key=value")
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        if section not in SYSTEMD_KEYS:
            errors.append(f"line {number}: {key} is outside an allowed section")
            continue
        if key not in SYSTEMD_KEYS[section]:
            errors.append(f"line {number}: {key} is not allowed in [{section}]")
            continue
        seen.setdefault(key, []).append(value)

        if key in ("After", "Wants", "Requires", "WantedBy"):
            bad = [unit for unit in value.split() if not TARGET.match(unit)]
            if bad:
                errors.append(f"line {number}: {key} may only name targets")
        elif key == "ExecStart" and not value.startswith("/"):
            errors.append(
                f"line {number}: ExecStart must be an absolute path with no prefix"
            )
        elif key == "WorkingDirectory" and not within(value, app.checkout):
            errors.append(f"line {number}: WorkingDirectory must be in the checkout")
        elif key == "EnvironmentFile" and (
            (value[1:] if value.startswith("-") else value) not in app.environment_files
        ):
            errors.append(f"line {number}: EnvironmentFile {value} is not allowed")
        elif key == "StateDirectory" and not all(
            STATE_DIRECTORY.match(name) for name in value.split()
        ):
            errors.append(f"line {number}: StateDirectory must be plain names")

    for key in ("User", "Group"):
        if seen.get(key) != [app.user]:
            errors.append(f"{key} must be set once, to {app.user}")
    if len(seen.get("ExecStart", [])) != 1:
        errors.append("ExecStart must be set once")
    return errors


# --- nginx -------------------------------------------------------------------

NGINX_TOP_LEVEL = {"server", "map", "upstream", "limit_req_zone", "limit_conn_zone"}
NGINX_FORBIDDEN = {
    "daemon",
    "env",
    "load_module",
    "master_process",
    "pid",
    "ssl_engine",
    "user",
    "working_directory",
}
NGINX_FORBIDDEN_PREFIXES = ("js_", "lua", "perl", "worker_")
NGINX_INCLUDES = {
    "/etc/letsencrypt/options-ssl-nginx.conf",
    "/etc/nginx/mime.types",
    "/etc/nginx/proxy_params",
}
NGINX_LOGS = ("access_log", "error_log")
NGINX_SSL_FILES = {
    "ssl_certificate",
    "ssl_certificate_key",
    "ssl_client_certificate",
    "ssl_crl",
    "ssl_dhparam",
    "ssl_password_file",
    "ssl_session_ticket_key",
    "ssl_stapling_file",
    "ssl_trusted_certificate",
}
NGINX_SSL_DIRS = ("/etc/letsencrypt", "/etc/ssl")


@dataclass
class Directive:
    name: str
    args: list[str]
    line: int
    depth: int
    children: list[Directive] = field(default_factory=list)


def tokenize_nginx(text: str) -> list[tuple[str, int]]:
    tokens: list[tuple[str, int]] = []
    i, line, n = 0, 1, len(text)
    while i < n:
        c = text[i]
        if c == "\n":
            line += 1
            i += 1
        elif c.isspace():
            i += 1
        elif c == "#":
            while i < n and text[i] != "\n":
                i += 1
        elif c in "{};":
            tokens.append((c, line))
            i += 1
        elif c in "\"'":
            start, i = line, i + 1
            value = []
            while i < n and text[i] != c:
                if text[i] == "\\" and i + 1 < n:
                    i += 1
                if text[i] == "\n":
                    line += 1
                value.append(text[i])
                i += 1
            if i >= n:
                raise ValueError(f"line {start}: unterminated quote")
            tokens.append(("".join(value), start))
            i += 1
        else:
            start = i
            while i < n and not text[i].isspace() and text[i] not in "{};\"'":
                i += 1
            tokens.append((text[start:i], line))
    return tokens


def parse_nginx(text: str) -> list[Directive]:
    tokens = tokenize_nginx(text)
    root: list[Directive] = []
    stack: list[list[Directive]] = [root]
    words: list[tuple[str, int]] = []
    for token, line in tokens:
        if token == ";":
            if not words:
                raise ValueError(f"line {line}: empty directive")
            stack[-1].append(
                Directive(words[0][0], [w for w, _ in words[1:]], words[0][1],
                          len(stack) - 1)
            )
            words = []
        elif token == "{":
            if not words:
                raise ValueError(f"line {line}: block without a name")
            block = Directive(words[0][0], [w for w, _ in words[1:]], words[0][1],
                              len(stack) - 1)
            stack[-1].append(block)
            stack.append(block.children)
            words = []
        elif token == "}":
            if words or len(stack) == 1:
                raise ValueError(f"line {line}: unexpected }}")
            stack.pop()
        else:
            words.append((token, line))
    if words or len(stack) != 1:
        raise ValueError("unterminated directive or block")
    return root


def within(path: str, directory: str) -> bool:
    return (
        path.startswith("/")
        and ".." not in path.split("/")
        and (path == directory or path.startswith(directory.rstrip("/") + "/"))
    )


def walk(directives: list[Directive]):
    for directive in directives:
        yield directive
        yield from walk(directive.children)


def validate_nginx(text: str) -> list[str]:
    """Errors for directives that would make nginx's root master process open,
    create or load files outside the expected places."""
    try:
        directives = parse_nginx(text)
    except ValueError as error:
        return [str(error)]

    errors: list[str] = []
    for directive in walk(directives):
        name, args, where = directive.name, directive.args, f"line {directive.line}"
        if directive.depth == 0 and name not in NGINX_TOP_LEVEL:
            errors.append(f"{where}: {name} is not allowed at the top level")
        if name in NGINX_FORBIDDEN or name.startswith(NGINX_FORBIDDEN_PREFIXES):
            errors.append(f"{where}: {name} is not allowed")
        elif name.endswith("_path"):
            errors.append(f"{where}: {name} is not allowed")
        elif name == "include" and (len(args) != 1 or args[0] not in NGINX_INCLUDES):
            errors.append(f"{where}: include of {' '.join(args)} is not allowed")
        elif name in NGINX_LOGS and args and not (
            args[0] in ("off", "stderr")
            or args[0].startswith("syslog:")
            or within(args[0], "/var/log/nginx")
        ):
            errors.append(f"{where}: {name} must write under /var/log/nginx")
        elif name in NGINX_SSL_FILES and not (
            len(args) == 1 and any(within(args[0], d) for d in NGINX_SSL_DIRS)
        ):
            errors.append(f"{where}: {name} must name a file under /etc/letsencrypt")
    return errors


def server_names(text: str) -> set[str]:
    try:
        directives = parse_nginx(text)
    except ValueError:
        return set()
    return {
        name
        for d in walk(directives)
        if d.name == "server_name"
        for name in d.args
        if name not in ("_", '""')
    }


def nginx_conflicts(text: str, dest: str, dirs: Sequence[str]) -> list[str]:
    """Server names this site shares with other enabled configs, which nginx
    would only warn about while serving whichever loaded first."""
    names = server_names(text)
    conflicts = []
    for directory in dirs:
        try:
            entries = sorted(os.listdir(directory))
        except FileNotFoundError:
            continue
        for entry in entries:
            path = os.path.join(directory, entry)
            if os.path.realpath(path) == os.path.realpath(dest):
                continue
            if not os.path.isfile(path):
                continue
            with open(path, encoding="utf-8", errors="replace") as handle:
                shared = names & server_names(handle.read())
            if shared:
                conflicts.append(f"{path} also serves {', '.join(sorted(shared))}")
    return conflicts


VALIDATORS: dict[str, Callable[[str, App], list[str]]] = {
    "systemd": validate_systemd,
    "nginx": lambda text, _app: validate_nginx(text),
}


# --- installing --------------------------------------------------------------

Runner = Callable[[Sequence[str]], subprocess.CompletedProcess]


def run_command(cmd: Sequence[str]) -> subprocess.CompletedProcess:
    return subprocess.run(list(cmd), capture_output=True, text=True)


class InstallError(Exception):
    pass


def read_source(path: str) -> str:
    """Reads a regular file without following a symlink at its last component,
    so a checkout can't point root at a file it couldn't read itself."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError as error:
        raise InstallError(f"{path}: cannot open ({error.strerror})") from None
    with os.fdopen(fd, "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise InstallError(f"{path}: not a regular file")
        if info.st_size > MAX_BYTES:
            raise InstallError(f"{path}: larger than {MAX_BYTES} bytes")
        try:
            return handle.read().decode("utf-8")
        except UnicodeDecodeError:
            raise InstallError(f"{path}: not UTF-8") from None


def read_existing(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except FileNotFoundError:
        return None


def write_atomic(path: str, text: str) -> None:
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".install-app-config-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def verify_unit(text: str, dest: str, run: Runner) -> None:
    with tempfile.TemporaryDirectory() as staging:
        staged = os.path.join(staging, os.path.basename(dest))
        with open(staged, "w", encoding="utf-8") as handle:
            handle.write(text)
        result = run(["systemd-analyze", "verify", staged])
        if result.returncode != 0:
            raise InstallError(
                f"systemd-analyze verify rejected {os.path.basename(dest)}:\n"
                f"{result.stderr.strip()}"
            )


def install(
    name: str,
    apps: dict[str, App] = APPS,
    run: Runner = run_command,
    root: str = "/",
    log: Callable[[str], None] = print,
) -> list[str]:
    """Installs `name`'s config files and returns the destinations that changed.
    `root` relocates every destination, for tests."""
    app = apps.get(name)
    if app is None:
        raise InstallError(f"unknown app {name!r}")

    def at_root(path: str) -> str:
        return os.path.join(root, path.lstrip("/"))

    sources = {
        f.dest: read_source(os.path.join(app.checkout, f.source)) for f in app.files
    }
    problems = [
        f"{f.source}: {error}"
        for f in app.files
        for error in VALIDATORS[f.kind](sources[f.dest], app)
    ]
    if problems:
        raise InstallError("config rejected:\n  " + "\n  ".join(problems))

    changed = [
        f for f in app.files if read_existing(at_root(f.dest)) != sources[f.dest]
    ]
    if not changed:
        log(f"{name}: config unchanged")
        return []

    kinds = {f.kind for f in changed}
    conflicts = [
        conflict
        for f in changed
        if f.kind == "nginx"
        for conflict in nginx_conflicts(
            sources[f.dest], at_root(f.dest), [at_root(d) for d in app.nginx_dirs]
        )
    ]
    if conflicts:
        raise InstallError(
            "remove these servers by hand first:\n  " + "\n  ".join(conflicts)
        )

    for f in changed:
        if f.kind == "systemd":
            verify_unit(sources[f.dest], f.dest, run)

    backups: dict[str, str | None] = {}
    for f in changed:
        dest = at_root(f.dest)
        previous = read_existing(dest)
        backups[dest] = previous
        if previous is not None:
            backup = at_root(os.path.join(BACKUP_DIR, name, os.path.basename(f.dest)))
            write_atomic(backup, previous)
        write_atomic(dest, sources[f.dest])
        log(f"{name}: installed {f.dest}")

    def restore() -> None:
        for dest, previous in backups.items():
            if previous is None:
                os.unlink(dest)
            else:
                write_atomic(dest, previous)

    if "nginx" in kinds:
        result = run(["nginx", "-t"])
        if result.returncode != 0:
            restore()
            raise InstallError(
                f"nginx -t failed; previous config restored:\n{result.stderr.strip()}"
            )

    if "systemd" in kinds:
        result = run(["systemctl", "daemon-reload"])
        if result.returncode != 0:
            raise InstallError(f"daemon-reload failed:\n{result.stderr.strip()}")
    if "nginx" in kinds:
        result = run(["systemctl", "reload", "nginx"])
        if result.returncode != 0:
            raise InstallError(f"nginx reload failed:\n{result.stderr.strip()}")

    return [f.dest for f in changed]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} <app>", file=sys.stderr)
        return 2
    if os.geteuid() != 0:
        print("must run as root", file=sys.stderr)
        return 2
    try:
        install(argv[1])
    except InstallError as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
