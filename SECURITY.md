# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Don't open a public issue or pull request for a vulnerability.

Include what you found, how to reproduce it, and what an attacker could do with it. You should get a reply within a week. This is a hobby project, so there is no bug bounty, but fixes are credited in the release notes unless you'd rather not be named.

## Supported versions

Only the latest code on the default branch is supported. Self-hosted copies should update to it to get fixes.

## Scope

In scope: the API, the web app, the admin page, and the Docker setup in this repository.

Out of scope: copies run by other people (report those to their operator), denial of service that needs a large botnet, and findings that depend on a misconfigured `TRUSTED_PROXY_IPS` or a weak or leaked `ADMIN_PASSWORD`.

The design rules the code is expected to keep are in [docs/security.md](docs/security.md).
