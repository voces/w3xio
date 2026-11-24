from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from install_app_config import (  # noqa: E402
    APPS,
    App,
    ConfigFile,
    InstallError,
    install,
    validate_nginx,
    validate_systemd,
)

UNIT = """\
[Unit]
Description=Test
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=app
Group=app
WorkingDirectory={checkout}
ExecStart=/usr/bin/bun server/index.ts
Environment=PORT=8000
EnvironmentFile=/etc/app/env
StateDirectory=app
Restart=always

[Install]
WantedBy=multi-user.target
"""

SITE = """\
map $http_upgrade $app_connection {
    default upgrade;
    '' close;
}

server {
    listen 443 ssl;
    server_name example.test;
    ssl_certificate /etc/letsencrypt/live/example.test/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.test/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    access_log /var/log/nginx/app.log;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Connection $app_connection;
    }
}
"""


def make_app(checkout: str) -> App:
    return App(
        checkout=checkout,
        user="app",
        files=(
            ConfigFile("ops/app.service", "/etc/systemd/system/app.service", "systemd"),
            ConfigFile("ops/site.conf", "/etc/nginx/sites-enabled/app.conf", "nginx"),
        ),
        environment_files=("/etc/app/env",),
    )


class SystemdTest(unittest.TestCase):
    app = make_app("/srv/app")

    def errors(self, old: str = "", new: str = "") -> list[str]:
        text = UNIT.format(checkout=self.app.checkout).replace(old, new)
        return validate_systemd(text, self.app)

    def test_accepts_plain_unit(self):
        self.assertEqual(self.errors(), [])

    def test_accepts_shipped_emojist_unit(self):
        path = "/home/verit/emoji-sheep-tag/ops/emojist.service"
        if not os.path.exists(path):
            self.skipTest("emoji-sheep-tag checkout not present")
        with open(path) as handle:
            text = handle.read()
        app = App(
            checkout="/home/ubuntu/emoji-sheep-tag",
            user="ubuntu",
            files=(),
            environment_files=("/etc/emojist/env",),
        )
        self.assertEqual(validate_systemd(text, app), [])

    def test_accepts_shipped_dw3xio_unit(self):
        path = os.path.join(os.path.dirname(__file__), "dw3xio.service")
        with open(path) as handle:
            self.assertEqual(validate_systemd(handle.read(), APPS["w3xio"]), [])

    def test_rejects_unsafe_units(self):
        for old, new in (
            ("User=app", "User=root"),
            ("User=app", "User=app\nUser=root"),
            ("User=app\n", ""),
            ("ExecStart=", "ExecStart=+"),
            ("ExecStart=", "ExecStartPre=/bin/true\nExecStart="),
            ("Restart=always", "AmbientCapabilities=CAP_SYS_ADMIN"),
            ("Restart=always", "PermissionsStartOnly=true"),
            ("EnvironmentFile=/etc/app/env", "EnvironmentFile=/root/x"),
            ("WorkingDirectory=/srv/app", "WorkingDirectory=/srv/app/../x"),
            ("WantedBy=multi-user.target", "WantedBy=ssh.service"),
            ("[Install]", "[Path]\nPathChanged=/etc\n[Install]"),
            ("Restart=always", "Restart=always \\\n  User=root"),
        ):
            with self.subTest(new):
                self.assertTrue(self.errors(old, new))


class NginxTest(unittest.TestCase):
    def test_accepts_plain_site(self):
        self.assertEqual(validate_nginx(SITE), [])

    def test_accepts_shipped_est_site(self):
        path = "/home/verit/emoji-sheep-tag/ops/nginx/est.w3x.io.conf"
        if not os.path.exists(path):
            self.skipTest("emoji-sheep-tag checkout not present")
        with open(path) as handle:
            self.assertEqual(validate_nginx(handle.read()), [])

    def test_rejects_root_file_access(self):
        for bad in (
            "access_log /etc/sudoers.d/x;",
            "error_log /var/log/nginx/../../../etc/x;",
            "include /etc/shadow;",
            "ssl_certificate_key /etc/shadow;",
            "proxy_cache_path /etc/x keys_zone=x:1m;",
            "client_body_temp_path /etc/x;",
            "js_import /tmp/x.js;",
        ):
            with self.subTest(bad):
                site = SITE.replace("    listen 443 ssl;", f"    {bad}\n    listen 443 ssl;")
                self.assertTrue(validate_nginx(site))

    def test_rejects_main_context_directives(self):
        self.assertTrue(validate_nginx("user root;\n" + SITE))
        self.assertTrue(validate_nginx("load_module /tmp/x.so;\n" + SITE))

    def test_comments_and_quotes_do_not_hide_directives(self):
        self.assertEqual(validate_nginx("# include /etc/shadow;\n" + SITE), [])
        self.assertTrue(validate_nginx('server { "include" /etc/shadow; }'))
        self.assertTrue(validate_nginx("server { listen 80; "))
        self.assertTrue(validate_nginx("server { return 200 'x; }"))


class Runner:
    def __init__(self, failing: set[str] = frozenset()):
        self.calls: list[list[str]] = []
        self.failing = failing

    def __call__(self, cmd):
        self.calls.append(list(cmd))
        code = 1 if " ".join(cmd[:2]) in self.failing else 0
        return subprocess.CompletedProcess(cmd, code, "", "boom" if code else "")

    def commands(self) -> list[str]:
        return [" ".join(cmd[:2]) for cmd in self.calls]


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = os.path.join(self.tmp.name, "root")
        checkout = os.path.join(self.tmp.name, "checkout")
        os.makedirs(os.path.join(checkout, "ops"))
        self.app = make_app(checkout)
        self.apps = {"app": self.app}
        self.write_source("ops/app.service", UNIT.format(checkout=checkout))
        self.write_source("ops/site.conf", SITE)
        self.site = self.at_root("/etc/nginx/sites-enabled/app.conf")

    def at_root(self, path: str) -> str:
        return os.path.join(self.root, path.lstrip("/"))

    def write_source(self, path: str, text: str):
        with open(os.path.join(self.app.checkout, path), "w") as handle:
            handle.write(text)

    def read(self, path: str) -> str:
        with open(self.at_root(path)) as handle:
            return handle.read()

    def install(self, runner: Runner) -> list[str]:
        return install("app", self.apps, runner, self.root, log=lambda _: None)

    def test_installs_then_reports_unchanged(self):
        runner = Runner()
        changed = self.install(runner)
        self.assertEqual(
            changed,
            ["/etc/systemd/system/app.service", "/etc/nginx/sites-enabled/app.conf"],
        )
        self.assertEqual(self.read("/etc/nginx/sites-enabled/app.conf"), SITE)
        self.assertEqual(
            runner.commands(),
            [
                "systemd-analyze verify",
                "nginx -t",
                "systemctl daemon-reload",
                "systemctl reload",
            ],
        )

        again = Runner()
        self.assertEqual(self.install(again), [])
        self.assertEqual(again.calls, [])

    def test_only_reloads_what_changed(self):
        self.install(Runner())
        self.write_source("ops/site.conf", SITE.replace("8000", "8001"))
        runner = Runner()
        self.assertEqual(self.install(runner), ["/etc/nginx/sites-enabled/app.conf"])
        self.assertEqual(runner.commands(), ["nginx -t", "systemctl reload"])

    def test_failed_nginx_test_restores_previous_site(self):
        self.install(Runner())
        self.write_source("ops/site.conf", SITE.replace("8000", "8001"))
        with self.assertRaises(InstallError):
            self.install(Runner(failing={"nginx -t"}))
        self.assertEqual(self.read("/etc/nginx/sites-enabled/app.conf"), SITE)
        backup = self.read("/var/backups/app-config/app/app.conf")
        self.assertEqual(backup, SITE)

    def test_failed_unit_verify_installs_nothing(self):
        with self.assertRaises(InstallError):
            self.install(Runner(failing={"systemd-analyze verify"}))
        self.assertFalse(os.path.exists(self.at_root("/etc/systemd/system/app.service")))
        self.assertFalse(os.path.exists(self.site))

    def test_rejected_config_installs_nothing(self):
        self.write_source("ops/site.conf", "user root;\n" + SITE)
        runner = Runner()
        with self.assertRaises(InstallError) as caught:
            self.install(runner)
        self.assertIn("user is not allowed", str(caught.exception))
        self.assertEqual(runner.calls, [])
        self.assertFalse(os.path.exists(self.site))

    def test_refuses_symlinked_source(self):
        source = os.path.join(self.app.checkout, "ops/site.conf")
        os.unlink(source)
        secret = os.path.join(self.tmp.name, "secret")
        with open(secret, "w") as handle:
            handle.write("hunter2")
        os.symlink(secret, source)
        with self.assertRaises(InstallError) as caught:
            self.install(Runner())
        self.assertNotIn("hunter2", str(caught.exception))

    def test_refuses_server_names_another_site_serves(self):
        shared = self.at_root("/etc/nginx/sites-enabled/shared.conf")
        os.makedirs(os.path.dirname(shared))
        with open(shared, "w") as handle:
            handle.write("server { server_name other.test example.test; }\n")
        with self.assertRaises(InstallError) as caught:
            self.install(Runner())
        self.assertIn("shared.conf also serves example.test", str(caught.exception))
        self.assertFalse(os.path.exists(self.site))

    def test_unknown_app(self):
        with self.assertRaises(InstallError):
            install("nope", self.apps, Runner(), self.root, log=lambda _: None)


if __name__ == "__main__":
    unittest.main()
