# לוח קולות קוראים

A public board of art and photography open calls, refreshed every morning.
Static page + two Vercel serverless functions. Sign-in is Google only; each
person's "saved" / "submitted" marks are a small JSON file in Vercel Blob.

## Files
- `index.html`, `app.js` — the page (filters, sign-in, marks)
- `data/calls.json` — the list of open calls; the daily scan commits changes here and Vercel redeploys
- `api/config.js` — hands the page the Google client ID
- `api/marks.js` — reads/writes marks; verifies the Google ID token on every call
- `lib/auth.js` — Google ID token verification (+ optional allow list)

## Environment variables (Vercel → Project → Settings → Environment Variables)
| name | value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud (Web application) |
| `BLOB_READ_WRITE_TOKEN` | added automatically when you connect a Blob store |
| `ALLOWED_EMAILS` | optional, comma-separated; when set only these accounts can mark |

## `data/calls.json` record
`id, title, org, url, deadline (YYYY-MM-DD|null), region (il|abroad|online), place,
type (exhibition|residency|grant|prize|festival|publication|other), fee (free|paid|unknown),
feeNote, desc, tags[], verified, status (open|recurring), lastDeadline, addedAt`
