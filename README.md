# AnametaIoT HRMS — Walk-in Drive Console

A single-admin walk-in drive management system: pre-list upload → QR/WhatsApp/Email
invites → front-desk check-in → on-spot walk-in registration → multi-level
proctored online tests → cut-off & selection → results QR.

Stack: **Python/Flask + MySQL** backend, **React (Vite)** frontend.

---

## 1. Project layout

```
walkin-drive/
├── backend/            Flask API, MySQL models, QR/Excel/messaging utilities
│   ├── app/
│   │   ├── models/models.py       All DB tables
│   │   ├── routes/                auth, events, candidates, qr_messaging, frontdesk, tests
│   │   └── utils/                 qr_utils, messaging (Twilio/SMTP), excel_utils, message_templates
│   ├── config.py
│   ├── run.py
│   └── requirements.txt
└── frontend/            React admin console + public candidate-facing pages
    └── src/
        ├── pages/                 Dashboard, Candidates, FrontDesk, TestLevels, LiveMonitor, Results
        └── pages/public/          WalkinRegister, Assessment, PublicResults (no login required)
```

## 2. Backend setup

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in MySQL + Twilio + SMTP credentials
```

Create the MySQL database:

```sql
CREATE DATABASE walkin_drive CHARACTER SET utf8mb4;
```

### Where's the actual database?

There's no bundled `.db` file — this is a real MySQL app, so the schema lives as
**Python model definitions** in `app/models/models.py`, and gets turned into actual
tables one of three ways:

**Option A — plain SQL file, no Python/Flask needed at all (`schema.sql`):**
A ready-to-import MySQL DDL file is included at `backend/schema.sql`, generated
directly from the models (9 tables: events, candidates, message_logs, settings,
test_levels, questions, candidate_test_sessions, candidate_answers,
candidate_level_results). Import it with any MySQL client:

```bash
mysql -u <user> -p walkin_drive < schema.sql
```

or paste its contents into phpMyAdmin / MySQL Workbench / TablePlus — whatever
you use to manage the DB. This has been tested against a real MySQL/MariaDB
instance and imports cleanly.

**Option B — plain Python script, no `flask` CLI needed (`init_db.py`):**
```bash
cd backend
python init_db.py
```
This calls `db.create_all()` directly — no `FLASK_APP` env var, no `flask` command
on your PATH required, just `python`. It reads the same `.env` / `DATABASE_URL` as
the app itself, and is safe to re-run (it only creates tables that don't exist yet,
never drops data).

**Option C — Flask CLI (if you do have `flask` installed):**
```bash
export $(cat .env | xargs)
flask --app run.py init-db
```

All three produce the identical schema — pick whichever fits your environment.
Then start the app:

```bash
python run.py                # dev server on :5000
```

Admin login is a **single hardcoded operator account** (as requested — no multi-role
system): set `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`.

### Dry-run mode (no Twilio/SMTP credentials yet)
If `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` or `SMTP_USER`/`SMTP_PASSWORD` are blank,
the system automatically runs in **DRY_RUN** mode: every WhatsApp/email "send" is
logged to `message_logs` with status `simulated` instead of actually going out, so
you can demo and test the entire flow (progress bars, invites, results) before wiring
up live credentials. Set `DRY_RUN=false` once credentials are in place to force live
sending, or `DRY_RUN=true` to force simulation even with credentials present.

**Twilio WhatsApp media note:** Twilio requires a *publicly reachable* URL for QR
images sent via WhatsApp (`media_url`). In production, point `PUBLIC_BASE_URL` at
your deployed domain so `/static/qrcodes/...` is publicly resolvable, or swap in S3/
Cloud Storage URLs in `app/utils/messaging.py`.

## 3. Frontend setup

```bash
cd frontend
npm install
npm run dev        # :5173, proxies /api and /static to :5000
```

For production: `npm run build`, serve `dist/` behind your web server (or from
Flask's static folder), and point `PUBLIC_BASE_URL` in the backend `.env` at that
public domain — it's embedded into every QR code and message link.

## 4. End-to-end flow implemented

1. **Events (multi-event, event-wise)** — every drive is a separate Event; the
   sidebar's event switcher scopes the entire console (candidates, tests, results)
   to whichever drive is active. A dedicated **Events** page lists all drives as
   cards with live mini-stats, lets you edit venue/date/status, and create new ones
   without losing data from earlier drives.
2. **Settings** — Twilio (WhatsApp) and SMTP (Email) credentials are configured
   *in the portal*, not just `.env`. A single toggle turns WhatsApp on/off
   app-wide; secrets are masked on read and only overwritten when you actually
   type a new value. Every "send" action reads live from these settings.
3. **Dashboard** — event-scoped funnel: registration/QR/check-in/welcome progress
   bars plus a per-round assessment funnel (sessions, completions, flags, passes).
4. **Candidates & QR** — download the candidate Excel template, upload your filled
   list, generate a unique QR + Candidate ID per person, and send invites with a
   live progress bar. WhatsApp is optional and greyed out automatically if not
   enabled/configured in Settings — Email always remains available as a fallback.
   The on-spot registration **standee QR** is generated automatically per drive.
5. **Front Desk** — camera-based QR scanner (or manual Candidate ID entry) builds a
   reviewable scanned batch; **Mark Present** checks in the batch and fires a
   welcome message (WhatsApp optional, Email fallback) in one action.
6. **Walk-in self-registration** (`/walkin-register/:token`, public) — candidates not
   on the pre-list scan the standee, fill their details, and get an instant
   downloadable QR + Candidate ID, unifying with the pre-list pool from here on.
7. **Test Levels** — create Level 1/2/3 rounds (aptitude/technical/other), download
   the question Excel template, upload questions, then **Start Round** to broadcast
   the assessment link + Candidate ID. A dedicated **entry QR** is also generated
   for display/printing at the venue, so candidates without WhatsApp/email (or who
   just prefer scanning) can reach the same assessment by QR + manual ID entry.
8. **Assessment page** (`/assessment/:levelId`, public) — candidate enters their
   Candidate ID, gets a timed MCQ test guarded by a **signed per-session token**
   (issued once at start, required on every subsequent call — a session id alone
   can no longer be guessed/replayed to view or tamper with someone else's
   attempt). Tab-switch/blur is detected client-side and reported to the server;
   the session is immediately **flagged and locked** (visible in red on the
   admin's **Live Monitor**), and only an admin **Reset** unlocks it.
9. **Live Monitor** (`/tests/:levelId/live`) — auto-refreshing dashboard of every
   candidate's session status, tab-violation count, and a one-click reset.
10. **Results & Selection** — apply a cut-off score, auto-mark pass/fail, then
    **Select & Notify** to broadcast either a "next round" invite or, if marked
    final, a congratulations + results-link message. A **Results QR** is generated
    per round for display at the venue.

## 5. WhatsApp is always optional

WhatsApp is never required to complete any stage of the drive:

- The **Settings** page has a single `whatsapp_enabled` toggle plus the Twilio
  fields it needs (Account SID, Auth Token, WhatsApp sender number).
- Every send action across the portal (QR invite, welcome, test invite, result)
  shows a WhatsApp checkbox and an Email checkbox. If WhatsApp isn't turned on
  *and* fully configured, that checkbox renders **greyed out and disabled** with a
  link back to Settings — Email remains fully usable on its own.
- The backend enforces the same rule server-side (`sanitize_channels()` in
  `app/utils/settings_utils.py`), so even a direct API call can't force a WhatsApp
  send while it's off — it's silently dropped and logged as `skipped` in
  `message_logs`, never blocking the rest of the request.
- Every candidate-facing round also gets a scannable **entry QR** in addition to
  WhatsApp/email links, so the flow works end-to-end on Email-only or even
  QR/ID-only (no messaging channel at all) setups.

## 6. Signed per-session token (test-taking security)

Each `CandidateTestSession` now carries a random `session_token` generated at
creation. The candidate's browser receives it once, at `/tests/public/levels/<id>/start`,
and must present it (header `X-Session-Token` or body/query `session_token`) on
every subsequent call — status polling, heartbeat, tab-violation reporting,
answering, and submitting. Requests with a missing or incorrect token are
rejected with `403`. This prevents a session id (which is just an incrementing
integer) from being guessed or replayed to view or interfere with another
candidate's attempt.

## 7. Things worth adding that weren't explicitly spelled out

These were added because they materially strengthen the system; flagged here so you
can review/prioritize:

- **Duplicate protection** on candidate upload (same phone number within an event is
  skipped, not double-booked) and on walk-in registration (re-scanning your own
  standee just returns your existing record instead of creating a duplicate).
- **Audit trail** — every WhatsApp/email send (including simulated ones) is logged
  in `message_logs` with timestamp and error detail, for compliance/debugging.
- **DRY_RUN simulation mode** so the whole funnel can be demoed before Twilio/SMTP
  credentials exist.
- **Configurable tab-violation threshold** (`MAX_TAB_VIOLATIONS_BEFORE_FLAG`) rather
  than an instant hard flag on the very first blur — some admins may want to allow
  one accidental switch.
- **Resend to pending/failed only** — re-running "Generate QR & Send" doesn't re-spam
  candidates who already received their invite; it only targets pending/failed rows
  (you can still force a full resend by passing explicit `candidate_ids`).
- **Retained scoring math** with per-question negative marking, not just pass/fail.
- **Results QR is per-round**, not just final — useful since many drives publish
  shortlists after every round, not only at the very end.

## 8. Suggested next hardening steps (not built, flagged for your call)

- **Rate limiting** on public endpoints (`/walkin-register`, `/assessment/*/start`)
  to prevent spam registrations or brute-forcing Candidate IDs.
- **WhatsApp template approval**: Twilio's WhatsApp Business API requires
  pre-approved message templates for the *first* outbound message in a 24h window
  with a user; the free-form bodies in `message_templates.py` will need to be
  registered as approved templates with Twilio/Meta before going live.
- **Background job queue** (Celery/RQ) instead of raw Python threads for QR/message
  sending at large scale (the current threading approach is fine for a few hundred
  candidates per drive but won't scale to very large campus batches cleanly).
- **Secrets at rest**: Twilio/SMTP credentials entered in Settings are stored in
  plaintext in the `settings` table (masked only on API read/render). For a
  production deployment, consider encrypting these columns or moving secrets to a
  vault and keeping only a "configured: true/false" flag in the database.
