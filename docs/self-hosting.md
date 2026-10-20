# Self-hosting Agile Deck

This guide covers running your own copy with Docker Compose. For day-to-day operations (logs, backups, upgrades, limits and retention), see [operations](operations.md).

## What runs

`docker compose up` starts two containers on a private `poker` network:

| Container | What it does | Reachable from |
|-----------|--------------|----------------|
| `web` | nginx serving the Angular app. It also proxies `/api/` and `/socket.io/` to the API, so browsers only ever talk to one address. | `WEB_BIND:WEB_PORT` on the host (default `127.0.0.1:8080`) |
| `api` | Node.js API with Socket.IO and Prisma. Data lives in SQLite on the `poker_data` volume. Migrations run when it starts. | Only the `web` container |

The API's own port is not published. Both containers run as non-root users with read-only filesystems and dropped capabilities.

## Quick start

```sh
cp .env.example .env
openssl rand -base64 48   # paste the output into COOKIE_SIGNING_SECRET in .env
docker compose up -d --build
docker compose ps
```

Open <http://localhost:8080>. The API refuses to start in production with a missing or weak cookie secret.

## Settings

Compose reads these from `.env` in the project folder.

| Variable | Default | Meaning |
|----------|---------|---------|
| `COOKIE_SIGNING_SECRET` | none (required) | Signs the visitor cookie. Use a long random value and keep it secret. Changing it starts every visitor with a new identity unless you use the rotation variable below. |
| `COOKIE_SIGNING_SECRET_PREVIOUS` | empty | During a rotation, the old secret. It is accepted only to verify existing cookies, which are then reissued with the new secret. Remove it after a few weeks. |
| `POKER_FRONTEND_URL` | `http://localhost:8080` | The exact address people use, with scheme and no trailing slash, for example `https://poker.example.com`. Separate several with commas. Requests and socket connections from any other origin are refused. |
| `WEB_BIND` | `127.0.0.1` | Host interface the web container listens on. Use `0.0.0.0` to accept connections from other machines directly. |
| `WEB_PORT` | `8080` | Host port for the web container. |
| `TRUSTED_PROXY_IPS` | `POKER_WEB_IP` (the web container) | Proxies allowed to report the visitor's address in `X-Forwarded-For`, as addresses or CIDR ranges, comma separated. See below. The API won't start if an entry is neither. Outside Compose the default is empty, which trusts no proxy. |
| `POKER_SUBNET` | `172.30.0.0/24` | The private Docker network. Change it, together with `POKER_WEB_IP`, if it clashes with another network on the host. The Docker gateway, which your own host proxy appears as, is the subnet's `.1` address. |
| `POKER_WEB_IP` | `172.30.0.10` | The web container's fixed address on that network. `TRUSTED_PROXY_IPS` defaults to it. |
| `COOKIE_SECURE` | automatic | Secure cookies are on when every `POKER_FRONTEND_URL` starts with `https://`. Set `true` or `false` to override; the API won't start with any other value. |
| `SITE_PASSWORD` | empty | The password visitors enter when `access.passwordProtects` in `config/site.json` is on. At least 8 characters. See [Password protection](site-settings.md#password-protection-access). |
| `ADMIN_PASSWORD` | empty | Turns on the [admin page](#the-admin-page) at `/admin`. At least 12 characters: a shorter value stops the API at startup rather than leaving the page off. Empty leaves the admin page off. |
| `ALLOW_MISSING_SOCKET_ORIGIN` | `false` | `true` allows socket connections without an `Origin` header. Leave it off unless a non-browser client needs it. The API won't start with a value other than `true` or `false`. |
| `LOG_LEVEL` | `info` | The least important API messages written: `error`, `warn`, `info` or `debug`. |
| `LOG_FORMAT` | `text` | `json` writes each API message as one JSON object (`time`, `level`, `message`) per line, for Loki, Datadog and other log collectors. |
| `POKER_VERSION` | `latest` | Image tag Compose builds and runs. Handy for keeping a previous build to roll back to. |
| `BUILD_TIME` | `Development` | Baked into both images when they are built. Shown as the version in the app's settings panel and returned by `/api/version`; browsers use it to notice a new release. |

These are the deployment settings. What the site offers (moods, throwables, features, limits, legal text) lives in `config/site.json`; see [site settings](site-settings.md). Logos and icons are replaced through [branding](#branding).

Compose also sets these for the API. You normally don't need to change them:

| Variable | Compose value | Meaning |
|----------|---------------|---------|
| `NODE_ENV` | `production` | Strict mode: the cookie secret is required, unsigned legacy cookies and requests from unlisted origins are refused, and HSTS is sent. Any other value also allows the local development origins `http://localhost:4300` and `http://127.0.0.1:4300`, so never use it on a public site. |
| `PORT` | `3000` | The API's port inside its container. `docker/nginx.conf` and the API healthcheck in `docker-compose.yml` also say 3000, so change all three together. |
| `DATABASE_URL` | `file:/app/api/data/poker.db` | The SQLite file, on the `poker_data` volume. |
| `SITE_CONFIG_DIR` | `/app/config` | The folder holding `site.json` and your legal text files: the project's `config` folder, mounted read-only. |

The API image also takes a `NODE_IMAGE` build argument (default `node:24-bookworm-slim`) for building on a different Node base image, for example `docker build --build-arg NODE_IMAGE=... -f docker/api.Dockerfile .`. Compose doesn't pass it, and the web image's base images are fixed in `docker/web.Dockerfile`.

## Visitor addresses and proxies

Rate limits and daily abuse budgets are counted per visitor cookie and per network address, so the API needs each visitor's real address. It reads `X-Forwarded-For` only when the connection comes from an address in `TRUSTED_PROXY_IPS`. It then reads the header from right to left, skips addresses that are themselves trusted proxies, and uses the first one that is not. Anything further left was written by the visitor and is ignored.

- **No proxy in front (the web port faces visitors).** Keep the default. The bundled nginx adds the visitor's address and the API trusts only nginx.
- **Your own reverse proxy on the same machine,** connecting to `127.0.0.1:8080`. nginx then sees the Docker gateway (`172.30.0.1`, or the `.1` address of your `POKER_SUBNET`) as the client. Add it: `TRUSTED_PROXY_IPS=172.30.0.10,172.30.0.1`. Your proxy must **replace** any incoming `X-Forwarded-For` with the visitor's address (or append to it only when it trusts the hop before it), and the web port must not be reachable by anything else, which is why `WEB_BIND` defaults to `127.0.0.1`.
- **A load balancer, CDN or tunnel on another machine.** Add its addresses or ranges as well, and make sure it sets `X-Forwarded-For`.

If every visitor shows up with the same address, they share one set of rate limits. If you trust too much, a visitor can pick their own address and dodge the limits.

### Example: Caddy with automatic HTTPS

With Caddy installed on the host and DNS for `poker.example.com` pointing at it:

```caddyfile
poker.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

Caddy replaces `X-Forwarded-For` from untrusted clients by default. Then in `.env`:

```sh
POKER_FRONTEND_URL=https://poker.example.com
TRUSTED_PROXY_IPS=172.30.0.10,172.30.0.1
```

### Example: nginx on the host

```nginx
server {
    listen 443 ssl;
    server_name poker.example.com;
    # ssl_certificate and ssl_certificate_key here
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
```

`$remote_addr` (not `$proxy_add_x_forwarded_for`) discards whatever the visitor sent.

## The admin page

The admin page lists feedback waiting for approval, published feedback and replies, rooms and their members, and anonymous usage counts. It is part of the site at `/admin` (for example `https://poker.example.com/admin`), so it works on hosts where you have no shell. It is off until you set `ADMIN_PASSWORD`:

```sh
openssl rand -base64 24   # paste the output into ADMIN_PASSWORD in .env
docker compose up -d
```

Open `/admin` and enter the password. You stay signed in on that browser for 12 hours or until you press **Sign out**. Changing `ADMIN_PASSWORD` and restarting signs every browser out. With `ADMIN_PASSWORD` empty, `/admin` only explains how to turn it on, and the admin API answers 404.

The admin page is reachable from anywhere the site is, so it is only as strong as `ADMIN_PASSWORD`: anyone who knows it can read private feedback and delete rooms and users. Use a long random value, not a word or a reused password, and keep it out of chat and tickets. Sign-in attempts are limited (5 per network per 15 minutes, 20 per network and 200 in total per day), which makes guessing a long random password impractical; they do not help if the password is short, reused or leaked. Someone hammering the sign-in can use up the day's 200 attempts and keep you out until midnight UTC; browsers already signed in are unaffected. Serve the site over HTTPS so the password and admin cookie are not sent in clear text. The site password does not protect the admin page; the admin password works even when `access.passwordProtects` is `everything`.

New feedback and replies from visitors stay private, shown to their author as waiting for review, until you approve or reject them here.

## Branding

To use your own logo, icons, link preview image, app manifest or `robots.txt`, put files with the built-in names in `config/branding/` and rebuild the web image:

```sh
cp my-logo.png config/branding/favicon.png
docker compose up -d --build web
```

The files are baked into the image so the app's offline cache stays consistent, so a change needs a rebuild, not just a restart. The accepted names are listed in `config/branding/README.md`; any other file stops the build, so a misspelled name is never silently ignored. `favicon.png` is also the logo on the home page and in rooms. To keep a private copy out of search engines, add a `robots.txt` with `Disallow: /`. The site name shown in the app comes from `site.name` in `config/site.json`; the installed app name comes from `manifest.webmanifest`.

## Site settings

What the site offers (moods, throwables, themes, features, limits, terms and an optional password) is set in `config/site.json`. Copy `config/site.example.json`, edit it and restart the API. Every key is described in [site settings](site-settings.md).

### Your terms and privacy notice

Whoever runs a copy is its operator, and the terms of use and privacy notice on that copy are the operator's responsibility. The project's authors are not a party to them. Before you open a copy to other people:

- Set `site.contactEmail` and `site.governingLaw`. The defaults are placeholders (`admin@example.com` and "the state or country where the site owner lives"), and the API logs a warning at startup while either is unchanged.
- Read the built-in agreement and privacy notice at `/terms` and `/privacy`. They describe what this software stores and follow your settings, but they are a template, not legal advice. Have them reviewed for where you operate, or replace them with your own files through `legal.termsFile` and `legal.privacyFile`.
- If you add anything that collects more data, such as analytics, a CDN or a log service, update the privacy notice (`site.networkProviders` covers traffic providers).

## Updating

```sh
git pull
docker compose up -d --build
```

The API applies database migrations when it starts. Back up first; see [operations](operations.md).

## Limits to be aware of

- One API process with SQLite. Room locks and some rate-limit counters are kept in memory, so you can't run several API containers behind a load balancer.
- Room size, room count, retention and daily caps are settings (see [site settings](site-settings.md#limits-limits)). Other limits are fixed, such as 10 pending join requests per room and 5,000 issues per room; [operations](operations.md#application-abuse-limits) lists them all.
