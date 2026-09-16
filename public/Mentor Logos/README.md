# Homepage institution/company logos

The primary way to manage these is the Google Drive sync (see below) — it
updates live with no redeploy. This folder is the **fallback**: the
homepage (`/api/mentor-logos`) only reads from here if Firebase Storage has
no synced logos yet. It's unrelated to mentor profiles.

## Fallback: dropping a file directly here

- **Add one:** drop an image file here (`.png`, `.jpg`, `.jpeg`, `.webp`,
  `.svg`, or `.gif`).
- **Remove one:** delete the file.
- **Rename one:** rename the file — the display name shown on hover is
  always the filename with the extension stripped off, e.g.
  `Harvard Law School.png` shows as "Harvard Law School".

Unlike the Drive sync, this requires a commit + redeploy to take effect
(these are static files baked into the build), and only ever applies if
Storage is empty. If both this folder and Storage are empty, the homepage
falls back further to showing institution name pills (e.g. "UTM").

## Primary: syncing from Google Drive (no redeploy)

Manage logos by dropping files into a shared Drive folder, then run:

```
npm run sync:logos
```

This uploads the current contents of that Drive folder to Firebase Storage
(see `scripts/sync-mentor-logos.mjs`), uploading new/changed files and
removing ones no longer in Drive. The homepage reads Storage at request
time, so changes go live as soon as the script finishes — no commit, no
deploy.

This also runs automatically once a day via Vercel Cron (see the
`sync-mentor-logos` entry in `vercel.json`, which calls
`/api/cron/sync-mentor-logos`) — so a logo dropped into Drive shows up on
its own within a day even if nobody runs the script manually.
