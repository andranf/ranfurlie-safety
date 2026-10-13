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

## Knowledge checks

Any document can carry a knowledge check: add rows to the sheet's **Questions** tab (Code, No., Question, Options A–D, Answer letter, Why). Staff answer every question correctly before they can sign — a wrong answer shows the explanation and the question comes back round at the end. The Register's *Knowledge check* column records how many they got right first time. OHS-32 Bullying, Harassment & Discrimination ships with 12 questions.

## Shed keys

Weekend spare key register: https://andranf.github.io/ranfurlie-safety/keys.html

- **Wall poster:** `docs/keys/key-poster.pdf` (A4) — **KEY OUT** QR opens `keys.html?out`, **KEY BACK** QR opens `keys.html?in`. QR images: `docs/keys/qr-out.png`, `qr-in.png`. Rebuild with `python3 tools/key_poster.py`.
- **Taking a key:** pick name (remembered on the phone), OHS-34 Handle Keys must be signed and current (button takes them to sign it and back), pick the key, tick the terms and the lost-key responsibility (loss or late return may result in disciplinary action), sign with a finger. Logged in the **Key Log** tab with time, due-back time, SOP status, terms agreed and signature.
- **Returning:** pick the key (anyone can return a key for someone else) and confirm it is back in its spot. After the due time it is logged as *Returned late*.
- **Due back:** 10am on the next Tuesday after the key is taken. The 10-minute sync job posts any key still out to Slack from 10am Tuesday, tagging the holder plus Andrew, Ben and Neil, then again at 10am each weekday until it is back. A "✅ back" post follows when it is returned.
- **Lost or missing key:** reported from the return page; Slack alert goes straight away and the key shows as MISSING until it is returned.
- **Keys tab:** one row per key (name must match the key tag). Status / With / Since / Due back fill in automatically. Settings: `KEY_SWP_CODE`, `KEY_SWP_REQUIRED`, `KEY_DUE_DAY`, `KEY_DUE_TIME`, `KEY_REPEAT_DAILY`, `KEY_ALERT_CC`, `KEY_SLACK_WEBHOOK_URL` (blank = same channel as the safety reminders).

## Updating the backend

Copy `backend/Code.gs` into the sheet's Apps Script editor, save, then **Deploy > Manage deployments > Edit > New version** so the web app URL stays the same.

## Source documents

`library/` holds the source .docx for each training module written here (`documents.json` has their settings, `questions.json` their knowledge checks). `library/drafts/` are modules that need site details (assembly points, kit locations, wardens etc.) filled in before they go into the Drive Library. The live copy of every document is the one in Drive.

## Guests

Put `Guest` in a person's Groups on the Staff tab to give them access for review only: they get just the documents whose *Applies to* includes `Guest`, and they're never tagged in Slack.

