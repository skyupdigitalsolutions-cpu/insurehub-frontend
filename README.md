# Bimayantra API console

Web console that drives the real Bimayantra API, so each backend module can be verified as it is built
(Business Process Document v3.2). It is a test tool, not the product UI (screen designs are companion document CD-01).
It does not import anything from the backend; it only talks to it over HTTP.

## Run

The API must be running first on port 4000 with `SMS_PROVIDER=dev` and `DEV_TOOLS=true` (see the API's README).

```bash
npm install
npm run dev        # http://localhost:5173
```

Vite forwards `/v1` and `/health` to `http://localhost:4000` (same origin, so the API's HttpOnly session cookies work).
To point at a different API: `API_URL=http://localhost:4100 npm run dev`.

## Signing in

There are no passwords (v3.2). Log in with the mobile number of the seeded SkyUp Admin, or **Register as an advisor**
with any 10-digit Indian mobile. The OTP appears in the **SMS inbox** tab of the right-hand panel (dev only).
Sensitive actions (adding an assistant, SkyUp user changes) ask for an extra OTP in a dialog (CFG-83).

## What each screen covers

| Screen | Processes | Live checks |
|---|---|---|
| Access and sessions | P-01–P-04: OTP, sessions and devices, change mobile | registration, OTP rules, 3-session limit, refresh reuse, cookies, read-only after trial |
| Team and access | P-53 assistants (advisor), P-48 SkyUp users (admin) | step-up OTP, seat limit, assistant permissions, SUP-03, ADM-03 |
| Leads and pipelines | P-12–P-14 | field rules, duplicates, source rules, 4.3 moves, lost/follow-up/reopen, versions, idempotency, conversion |
| Customers, family, consent | P-15–P-17, P-19 | duplicates, field rules, PAN/Aadhaar with consent, assistant masking, mobile change, consent rules, family, deactivation |
| Test tools | NFR-13 | test clock, CFG overrides, SMS failure, reset limits |

Checks create throwaway advisor accounts (named "Console check …") with app-style tokens, so they never disturb your
own session. Each shows the expected message ID from the document and what the API actually returned.

## Build

```bash
npm run build      # typechecks, then writes static files to dist/
```

## Layout

```
src/
  api/       client.ts (cookies, refresh, idempotency keys, message-ID errors), auth, team, leads, customers, reference, dev, wire
  auth/      AuthProvider.tsx (session restore, idle warning AUTH-21), StepUp.tsx (extra OTP dialog)
  shell/     Rail.tsx, modules.ts (v3.2 module order)
  modules/   auth, team, leads, customers, dev, checks/fixtures.ts (throwaway users for live checks)
  ui/        Button, Notice, CheckList, form.tsx (Field, Warnings, Tabs, IST date formatting)
  wire/      WireLog.tsx (API traffic + SMS inbox)
```

Styling: Tailwind CSS v4 tokens in `src/styles.css` (`bg-ink`, `text-ok`, `border-rule`, …).
