# App config installer

`POST /deploy` checks out an app's tag, then runs
`sudo /usr/local/sbin/install-app-config <app>` before restarting it. The
installer copies the systemd unit and nginx site the app's repo ships under
`ops/` into `/etc`, so config changes ride along with releases.

It runs as root, and anyone who can push a release tag controls what it reads,
so it only installs what can't grant more than the app's own user already has.
(On the current box `ubuntu` has passwordless sudo, so this guards against
mistakes rather than enforcing a boundary until that is narrowed.)

- Destinations, the allowed `EnvironmentFile`, and the nginx `sites-enabled`
  link are fixed in `install_app_config.py`, not named by the repo.
- Units must run as the app user, with one plain `ExecStart` and an allowlist of
  keys (no `+`/`!` prefixes, extra `Exec*`, capabilities or other users).
- Sites may only define `server`, `map` and `upstream` blocks, and may not make
  nginx's root master process open, create or load files outside
  `/var/log/nginx` and `/etc/letsencrypt` (logs, `include`, `*_path`, modules).
- Sources are read without following symlinks, and are checked with
  `systemd-analyze verify` and `nginx -t`. A failed `nginx -t` restores the
  previous site. Previous files are kept in `/var/backups/app-config/<app>/`.
- Nothing reloads unless a file actually changed.

Secrets never live in the repo: units load them from a root-owned
`EnvironmentFile` (for emoji-sheep-tag, `/etc/emojist/env`, mode 0600).

## Setup on the box

One time, before the first deploy that installs config:

```sh
curl -fsSL https://bun.sh/install | bash   # as ubuntu; the unit runs ~/.bun/bin/bun
sudo install -o root -g root -m 0755 ops/install_app_config.py /usr/local/sbin/install-app-config
sudo visudo -cf ops/sudoers && sudo install -o root -g root -m 0440 ops/sudoers /etc/sudoers.d/w3xio-deploy
sudo install -d -m 0755 /etc/emojist
sudo install -m 0600 /dev/null /etc/emojist/env   # then fill it in from the old unit
```

Then delete the `est.w3x.io` server block from
`/etc/nginx/sites-enabled/w3xio.conf`. The installer refuses to add a site whose
`server_name` another enabled config still serves.

Reinstall the script after changing it here; the deploy never updates it.

## Tests

```sh
python3 -I ops/test_install_app_config.py
```
