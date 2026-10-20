# Site settings

Everything about what the site offers is set in one file, `config/site.json`. Every key is optional; anything you leave out keeps its default. Start from the example, which lists every key with its default value:

```sh
cp config/site.example.json config/site.json
# edit config/site.json, then restart the API
docker compose restart api
```

The API reads the file once at startup. If the file is not valid JSON or a value is out of range, the API refuses to start and its log names each bad setting (`docker compose logs api`), so a typo never silently falls back to a default. The server enforces every setting; hiding a button in the browser is only the visible half.

## Site details: `site`

| Key | Default | Meaning |
|-----|---------|---------|
| `name` | `"Agile Deck"` | Shown in the app, the browser tab and the built-in terms. |
| `contactEmail` | `"admin@example.com"` | Named in the terms and privacy notice as the way to reach you. **Change this.** |
| `governingLaw` | `"the state or country where the site owner lives"` | Completes "These terms are governed by the laws of …". For example `"the State of New York, USA"` or `"England and Wales"`. **Change this.** |
| `networkProviders` | `[]` | Companies that carry visitor traffic before it reaches your server, such as a CDN or tunnel provider. Each is named in the privacy notice. |

## Room content: `content`

| Key | Default | Meaning |
|-----|---------|---------|
| `moods` | `["friendly", "playful", "spicy"]` | Room moods people can choose. Friendly hides crude, violent and political throwables and keeps nudges to a chime; Spicy allows everything, including a bleeped nudge line. With one mood listed, the mood picker is hidden. |
| `defaultMood` | `"playful"` | The mood new rooms start with. Must be one of `moods`. Rooms using a mood you have since removed show this one until you allow it again. |
| `throwables` | `true` | `false` turns off throwing and barrages completely: the server refuses them, and the throwable picker, throw targets and throw statistics disappear. Nudges still work. |
| `blockedThrowables` | `[]` | Emoji to remove from the site, for example `["💩", "💊"]`. The server refuses them, pickers hide them, and anyone who had one selected is switched to an allowed one. This is on top of the Friendly mood's own filter. |
| `seasonalThrowables` | `true` | `false` never offers the limited Halloween (October), Thanksgiving (November) and Christmas (December) throwables. |
| `themes` | all four: `"default"` (Moonlit Garden), `"space"`, `"retro"` (Retro CRT), `"vegas"` | Board themes people can choose. With one listed, the picker is hidden. |
| `defaultTheme` | `"default"` | The theme new rooms start with. Must be one of `themes`. Rooms on a removed theme show this one. |

For a workplace copy without the edgier content, a good start is:

```json
{
  "content": {
    "moods": ["friendly"],
    "defaultMood": "friendly",
    "themes": ["default", "space", "retro"]
  }
}
```

## Features: `features`

| Key | Default | Meaning |
|-----|---------|---------|
| `feedback` | `true` | `false` removes the public feedback page and its button in rooms. Existing feedback stays in the database and can still be reviewed on the admin page. Turn this off if you don't want to moderate posts. |
| `issues` | `true` | `false` turns off the per-room issue backlog, including import and export. Rooms keep their stored issues, which come back if you turn it on again. |
| `usageStats` | `true` | `false` stops recording app-wide usage counts. Counts already stored are deleted after `limits.usageRetentionDays`. |

Turned-off features answer 404 on the server, and the privacy notice stops mentioning them.

## Limits: `limits`

| Key | Default | Meaning |
|-----|---------|---------|
| `maxUsersPerRoom` | 25 (2 to 100) | Approved people in one room. Larger rooms mean bigger broadcasts on every vote. |
| `maxRooms` | 1,000 | Rooms stored at once. New rooms are refused at the cap until cleanup removes inactive ones. |
| `inactiveRoomDays` | 90 | Rooms nobody has used for this many days are deleted at midnight, along with agreement records no longer linked to a room or feedback. |
| `usageRetentionDays` | 400 | How long app-wide usage counts are kept. |
| `daily` | see [operations](operations.md#application-abuse-limits) | Per-day caps per browser, per network and site-wide on creating rooms, new visitors, join requests, issue imports, and feedback posts, votes and replies. |

The privacy notice quotes these retention periods, so it stays accurate when you change them. Before raising a daily cap, read the trade-offs in [operations](operations.md#application-abuse-limits): network caps are shared by everyone behind one address, and site-wide caps are the backstop against abuse spread across many networks.

## Terms and privacy notice: `legal`

As the operator of a copy, you are responsible for its terms of use and privacy notice; the project's authors are not a party to them. The app ships with a built-in site use agreement and privacy notice that fill in your `site` details and follow your settings: retention periods come from `limits`, and the notice leaves out feedback, issues, usage counts or agreement records when those are off. The provided text is a starting point, not legal advice.

| Key | Default | Meaning |
|-----|---------|---------|
| `requireAgreement` | `true` | Visitors tick a box accepting the terms before they create or join a room or post feedback, and each acceptance is stored with the exact text. With `false` there is no checkbox and nothing is stored; the terms and privacy pages stay linked and using the site counts as accepting them. New-visitor limits still apply. A private intranet copy might turn this off. |
| `termsFile` | `null` | A `.md` or `.txt` file in the `config` folder that replaces the built-in terms. |
| `privacyFile` | `null` | The same for the privacy notice. |
| `updated` | `null` | Free text shown as the "Last updated" date on both pages, for example `"1 May 2027"`. Set it when you change your text. |

Your own text files are plain text. A line starting with `## ` starts a section with that heading, blank lines separate paragraphs, and line breaks inside a paragraph are kept. Nothing else is formatted: Markdown and HTML show exactly as typed. `{{siteName}}`, `{{contactEmail}}` and `{{governingLaw}}` are replaced with your settings. The API won't start if a file is missing, empty, over 100 KB, or uses any other `{{placeholder}}`. See `config/terms.example.md`.

The agreement version is derived from the agreement text itself, so whenever the text changes (your file, or a setting it mentions such as `site.name` or `contactEmail`), visitors are asked to accept the new version. There is no version number to bump by hand.

## Password protection: `access`

| Key | Default | Meaning |
|-----|---------|---------|
| `passwordProtects` | `"nothing"` | `"room-creation"` asks for the password before someone creates a room; anyone with a room link can still join. `"everything"` asks for it before anything except the terms and privacy pages, which suits a team-only copy. |

The password itself is the `SITE_PASSWORD` environment variable (in `.env`), at least 8 characters. It never goes in `site.json` and is never sent to browsers. The API won't start if protection is on and `SITE_PASSWORD` is missing or too short. A correct entry is remembered in that browser for 30 days; changing `SITE_PASSWORD` and restarting signs everyone out. Guessing is limited to 10 attempts per 15 minutes and 30 per day per network, and 1,000 per day across the site. Someone using many networks could use up the site-wide allowance and block new sign-ins until the next UTC day; people already signed in are unaffected.

This is a shared password, not user accounts. For anything sensitive, also keep the site off the public internet (a VPN, or `WEB_BIND=127.0.0.1` behind your own authenticating proxy).
