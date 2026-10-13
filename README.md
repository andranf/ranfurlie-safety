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

## TurfDog pre-starts and machine SWPs

An hourly Claude scheduled task (6:05am to 2:05pm, every day) opens TurfDog in Chrome on the shed PC, loads `tools/turfdog-prestart.js` into the page and reads:

- today's **whiteboard**, shifts 1 to 3: who is on which task with which machine
- the **pre-check log** (Staff > Safety > Safety Checklists > Pre-Check): today's pre-starts, and which reported a fault (Issues only)

and posts both to the web app (`action: prestart`, with the `PRESTART_KEY` from Settings). The backend:

- logs every pre-start in the **Pre-starts** tab and every person/machine booking in **Machine Bookings** (Pre-start Done / Not done / Not due yet / Not needed, and that machine's SWP status for that person)
- links machines to SWPs on the **Machines** tab (seeded with TurfDog's equipment list; new machines are added the first day they're booked, with the SWP left for you to fill in)
- builds the Slack posts. The task posts them in #safe-work-procedures: the first time each day someone is on a machine with no pre-start, they're tagged in one post (plus anyone booked on a machine whose SWP they haven't signed). Each hour after that, anyone still outstanding is tagged again in that post's thread, with Neil and Ben cc'd from the second reminder. When everyone's done the thread gets "All pre-starts done".
- DMs Andrew straight away when a pre-start reports a fault, and once after 1:30pm with the day's summary (never done, done on a different machine to the board, checklist that doesn't match the machine, booked machines with no SWP linked, names not on the Staff tab).

Settings: `PRESTART_SHIFT_FROM` (when each shift's machines are chased), `PRESTART_ESCALATE_AFTER`, `PRESTART_CC`, `PRESTART_SKIP_TASKS` (e.g. Workshop), `PRESTART_MATCH` (`type`: a pre-start on another machine of the same Type counts; `exact`: only the booked machine), `PRESTART_SWP`, `PRESTART_SUMMARY_AFTER`. TurfDog names are matched to the Staff tab (Josh = Joshua, Michael Kruse = Michael K); use the Staff tab's *TurfDog name* column for anyone who doesn't match.

## Updating the backend

Copy `backend/Code.gs` into the sheet's Apps Script editor, save, then **Deploy > Manage deployments > Edit > New version** so the web app URL stays the same.

## Source documents

`library/` holds the source .docx for each training module written here (`documents.json` has their settings, `questions.json` their knowledge checks). `library/drafts/` are modules that need site details (assembly points, kit locations, wardens etc.) filled in before they go into the Drive Library. The live copy of every document is the one in Drive.

## Guests

Put `Guest` in a person's Groups on the Staff tab to give them access for review only: they get just the documents whose *Applies to* includes `Guest`, and they're never tagged in Slack.

## Monthly H&S inspections

Staff walk-around checklist and register: https://andranf.github.io/ranfurlie-safety/inspection.html
Dashboard: https://andranf.github.io/ranfurlie-safety/inspection-dashboard.html

- **Areas:** Maintenance compound (live). Clubhouse is listed as coming soon — add its checklist to `docs/inspect-checklists.js` and remove `comingSoon`.
- **Doing one:** scan the wall poster (`docs/inspection/inspection-poster.pdf`, QR `qr-compound.png`, rebuild with `python3 tools/inspection_poster.py`), pick the area and your name (remembered on the phone, same as the SWP page). Every line is Yes / No / N/A. **No** needs a description, up to 3 photos and a priority; ticking *Fixed on the spot* closes it straight away. **N/A** needs a reason (quick-pick or typed). Equipment cards (AEDs, first aid kits, extinguishers) have *All OK* and whole-item *N/A*. Expiry and service dates that have passed become defects automatically. The RCD test is quarterly, so it defaults to N/A outside Jan/Apr/Jul/Oct. Answers save on the phone as you go; with no signal at submit it is kept on the phone and sent next time the page opens.
- **Sign-off:** declaration + finger signature. Recorded: start time, every answer's time, submit time, minutes taken, device, signature (private Signatures folder), score = Yes ÷ (Yes + No).
- **Register (sheet tabs):** *Inspections* (one row each, plus Superintendent review), *Inspection Defects* (Open until closed out; a line that fails again while still open updates the same row — Times seen / Last seen / Latest note), *Inspection Answers* (every answer).
- **Dashboard:** last inspection and next due, score trend, pass rate by section, repeat failures, expiries & service dates, defect register with close-out (name, what was done, signature), inspection history (full record, print, *Review & sign*), N/A register, CSV export. Flags inspections done in under 15 minutes.
- **Slack:** summary when an inspection is submitted (High defects tag `INSP_ALERT_CC`); 7am weekday reminder when an area is due (31 days after the last one), then weekly until it's done. Settings: `INSP_EVERY_DAYS`, `INSP_REMIND`, `INSP_ALERT_CC`, `INSP_SLACK_WEBHOOK_URL` (blank = same channel as the safety reminders).
- **Changing the checklist:** edit `docs/inspect-checklists.js` and bump `version`. Manual runs: `setupInspections`, `previewInspectionReminder`.
