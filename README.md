# Ranfurlie Safety

Read-and-sign page for Ranfurlie course maintenance safe work procedures (SWPs) and general OHS documents.

- **Staff page:** https://andranf.github.io/ranfurlie-safety/ (GitHub Pages from `/docs`)
- **Documents:** Google Drive `Ranfurlie Safety / Library` — one sub-folder per category. Drop a file in and it appears on the page within 10 minutes.
- **Register:** Google Sheet `Ranfurlie Safety Register` (private) — Matrix, Register (every signature), Staff, Documents, Reminders, Settings.
- **Backend:** `backend/Code.gs`, an Apps Script bound to the register sheet. Serves the page, records signatures (name picked once and remembered on the phone, or a personal link from Slack; drawn signature + minimum read time + declaration), syncs the Drive library every 10 minutes and tags staff in Slack at 7am when sign-offs are due.

## Renewal by risk

| Risk | Re-sign every | First sign-off due | Minimum read time |
|---|---|---|---|
| High | 6 months | 14 days | 90 s |
| Medium | 12 months | 42 days | 60 s |
| Low | 24 months | 90 days | 30 s |

All values live in the sheet's Settings tab. A document that is updated in Drive must be re-signed by everyone.

## Updating the backend

Copy `backend/Code.gs` into the sheet's Apps Script editor, save, then **Deploy > Manage deployments > Edit > New version** so the web app URL stays the same.
