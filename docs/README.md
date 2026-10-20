# Documentation

Running a copy:

- [Self-hosting](self-hosting.md): install with Docker Compose, put it behind a proxy, and update it.
- [Site settings](site-settings.md): every key in `config/site.json`.
- [Operations](operations.md): backups, rollback, secret rotation, abuse limits, retention and the admin page.

Working on the code:

- [Architecture](architecture.md): how the workspaces divide the domain and how a request travels.
- [Testing](testing.md): where tests live, the coverage gates, and what to smoke-test by hand.
- [Security](security.md): invariants that must hold and the regression tests that guard them.
- [Feedback](feedback.md): eligibility, moderation, sorting and reactions in the feedback feed.
- [Room issues API](issues-api.md): the HTTP contract for the per-room backlog.
- [Moonlit Garden](garden-design.md): how the default theme is drawn and where its artwork came from.
