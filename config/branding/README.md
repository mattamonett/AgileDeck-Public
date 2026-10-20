# Branding

Put your own files here to replace the built-in ones, then rebuild the web
image (`docker compose up -d --build`). Files are baked into the image at build
time so the offline cache stays consistent; changing them needs a rebuild, not
just a restart. Only these names are accepted, and any other file stops the build:

| File | Used for |
|------|----------|
| `favicon.png` | The logo on the home page and in rooms |
| `favicon.ico`, `favicon-48x48.png` | Browser tab icons |
| `icon-192.png`, `icon-512.png` | Installed app icons |
| `apple-touch-icon.png` | iOS home screen icon (180×180) |
| `og-image.png` | Link previews in chat apps and social sites (1200×630) |
| `manifest.webmanifest` | Installed app name, colours and icons |
| `robots.txt` | Search engine rules |

To keep a private copy out of search engines, add a `robots.txt` containing:

```
User-agent: *
Disallow: /
```

Copy a built-in file from `web/public/` as a starting point. Keep image sizes
the same as the originals.
