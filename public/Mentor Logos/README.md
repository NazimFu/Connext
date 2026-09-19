# Homepage institution/company logos

The primary way to manage these is Firebase Storage — the homepage
(`/api/mentor-logos`) reads live from there, no redeploy needed. This
folder is the **fallback**: it's only used if Storage has no logos in it
(e.g. nothing's been uploaded yet). It's unrelated to mentor profiles.

## Primary: Firebase Storage (no redeploy)

In the [Firebase Console](https://console.firebase.google.com) → Storage,
upload/delete image files under the `mentor-logos/` prefix in this
project's bucket. Changes are live as soon as you save — the homepage
fetches Storage at request time.

## Fallback: dropping a file directly here

- **Add one:** drop an image file here (`.png`, `.jpg`, `.jpeg`, `.webp`,
  `.svg`, or `.gif`).
- **Remove one:** delete the file.
- **Rename one:** rename the file — the display name shown on hover is
  always the filename with the extension stripped off, e.g.
  `Harvard Law School.png` shows as "Harvard Law School".

Unlike Storage, this requires a commit + redeploy to take effect (these are
static files baked into the build), and only ever applies if Storage is
empty. If both this folder and Storage are empty, the homepage falls back
further to showing institution name pills (e.g. "UTM").
