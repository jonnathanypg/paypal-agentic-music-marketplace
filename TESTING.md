# Testing & Judge Access — PayPal Agentic Music Marketplace

This document is the single source of truth for judges and maintainers to run
the project safely **without charging real money**.

---

## 1. Hosted demo (recommended)

| Item | Value |
|---|---|
| Sandbox demo URL | **https://exito.cyou/?sandbox=1** |
| Normal production URL | https://exito.cyou |
| Artist Studio | https://exito.cyou/artist-studio |
| Login | https://exito.cyou/login |

When the URL contains `?sandbox=1`, the frontend:

1. Shows a yellow **PAYPAL SANDBOX DEMO MODE — no real money is charged** banner.
2. Loads the PayPal JS SDK with `NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID`.
3. Sends `sandbox_mode: true` to the backend, so **Orders v2, captures and
   Payouts v1 use the PayPal Sandbox REST API** (`api-m.sandbox.paypal.com`).

The mode is persisted in `localStorage`, so internal navigation keeps sandbox
mode until you click **Exit sandbox**.

---

## 2. Demo accounts (application level)

These accounts are pre-seeded in the hosted demo database.

| Role | Username | Password | Notes |
|---|---|---|---|
| Artist (full catalog view) | `demojudge` | `PayPalDemo2026!` | Opens the Artist Studio with 700+ tracks and 30+ albums. Payout mode is **manual** so no automatic transfer is triggered during judging. |
| Buyer / fan | `demobuyer` | `PayPalDemo2026!` | Optional: the checkout also supports guest checkout. |

Artist Studio: https://exito.cyou/artist-studio

> The demo artist payout destination is already configured to the **PayPal
> Sandbox Personal account** `sb-ogswn53856031@personal.example.com`, payout
> mode **manual**, platform fee **15%**. The profile includes two verified
> sandbox sales ($0.99 gross → $0.84 net each) and two completed sandbox
> payouts (latest `W9B28U85FAL9U`), so the full ledger is visible immediately.

---

## 3. PayPal Sandbox buyer account

The sandbox buyer is a real **PayPal Sandbox Personal** account provisioned in
the PayPal Developer Dashboard. These credentials only work on the PayPal
Sandbox; they cannot be used on paypal.com. Never invent credentials.

| Field | Value |
|---|---|
| Sandbox app | `EXITO CYOU` (Sandbox, merchant) |
| Sandbox business / seller | `sb-xexwk18231190@business.example.com` |
| Sandbox buyer email | `sb-ogswn53856031@personal.example.com` |
| Sandbox buyer password | `e"w5E6Z#` |
| Sandbox login URL | https://www.sandbox.paypal.com |

### Create the sandbox app and buyer (maintainers)

1. Sign in at **https://developer.paypal.com/** with a PayPal account.
2. Go to **Apps & Credentials** → select **Sandbox** → **Create App**.
   - Name: `exito-hackathon`
   - Type: **Merchant**
3. Copy the **Client ID** and **Secret** of that sandbox app.
4. Go to **Testing Tools → Sandbox Accounts → Create Account**:
   - Type: **Personal** (this is the buyer)
   - Country: your choice (e.g. United States)
   - Email/password: use a memorable value, e.g. `sb-buyer@exito.cyou`
5. Optional: create a second **Personal** account to receive sandbox Payouts
   (artist royalty destination).
6. Save these values in the deployment environment:

```env
# /root/MediaSuite/.env  (backend, never committed)
PAYPAL_SANDBOX_CLIENT_ID=...
PAYPAL_SANDBOX_CLIENT_SECRET=...
```

```env
# /root/MediaSuite/paypal-agentic-music-marketplace/.env.production
# (frontend, build time; .env* is gitignored)
NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID=...
```

7. Rebuild and restart only this project's apps:

```bash
cd /root/MediaSuite/paypal-agentic-music-marketplace
npm run build
pm2 restart ms-exito-frontend

# The API backend that serves exito.cyou:
pm2 restart ms-backend
```

8. Open **https://exito.cyou/?sandbox=1**, buy a track and log in with the
   sandbox buyer account. No real money is charged.

---

## 4. Judge flow (end to end, verified)

### Fast path (recommended)

1. Open the demo track directly:
   **https://exito.cyou/channel/billionaire-records-demo?buy=2&sandbox=1**
2. Confirm the yellow **PAYPAL SANDBOX DEMO MODE** banner is visible.
3. Enter any email (for example `judge@example.com`) and click **Pagar con
   PayPal**. The PayPal Sandbox login popup opens.
4. Log in with the sandbox buyer from section 3.
5. On the review screen click **Complete Purchase**. Current PayPal checkout
   shows this button directly; older screenshots may say *Continue to Review
   Order*.
6. PayPal returns to Éxito.cyou and the **¡Compra exitosa!** modal appears with
   the **Descargar archivo** button. By then the backend has already:
   - captured the Orders v2 order and validated the captured amount/currency;
   - recorded the purchase and the 85/15 split ledger
     ($0.99 gross → $0.15 platform fee → $0.84 artist net);
   - unlocked the licensed MP3 download.

### Verified evidence (2026-11-11)

| Step | Result |
|---|---|
| Sandbox create-order | order `56H75135LP133603P`, `mode: sandbox` |
| Capture + purchase | purchase `17`, transaction `2BV594211J593044C` |
| Split | `billionaire-records-demo`: $0.99 gross / $0.15 fee / $0.84 net |
| Download | licensed MP3 served (3.1 MB, ID3-tagged) |
| Sandbox payout | batch `W9B28U85FAL9U`, status `completed` |

> Sandbox purchases made from the `billionaire-records-demo` label channel
> credit the demo artist profile, so the 85/15 ledger is visible in the demo
> Artist Studio. Live sales keep each track's real creator attribution.

### Artist side

1. Open https://exito.cyou/login and log in as `demojudge` /
   `PayPalDemo2026!`.
2. Open https://exito.cyou/artist-studio.
3. The dashboard shows the demo profile, the sale in **sales_ledger**, the
   $0.99 / $0.15 / $0.84 split and the completed payout. Buy another track (or
   use the direct demo-track link above) to create a new balance and test
   **Withdraw** in sandbox mode.
4. The **Live PayPal Agentic Commerce Simulator** creates a sandbox order and
   returns the order id, gross amount, platform fee and artist net.

---

## 5. Local development

The hosted demo is the primary judge path. Local setup requires Python 3.11+,
Node.js 20+, Redis (for Celery) and a database.

```bash
git clone https://github.com/jonnathanypg/paypal-agentic-music-marketplace.git
cd paypal-agentic-music-marketplace
cp .env.example .env             # add your sandbox credentials
cp .env .env.production          # Next.js build-time variables

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# Seed the demo catalog + accounts (same terminal, idempotent)
python scripts/seed_demo.py

# Frontend (new terminal, repository root)
npm install
npm run dev
```

Notes:

- `backend/celery_app.py` is included so the e-commerce router imports cleanly.
- Tables are created automatically on backend startup. `backend/scripts/seed_demo.py`
  inserts the demo catalog (ids 1..6), the `demojudge` / `demobuyer` /
  `demoartist` accounts (`PayPalDemo2026!`) and the
  `billionaire-records-demo` artist profile. Without it, the UI falls back to
  mock tracks but `POST /api/ecommerce/paypal/create-order` returns
  `404 Recurso no encontrado` and PayPal never opens.
- The repository does not ship the production MySQL catalog or copyrighted
  audio masters; the seed script uses metadata only (and a 3-second generated
  tone when `ffmpeg` is available).
- Local sandbox checkout requires `PAYPAL_SANDBOX_CLIENT_ID` /
  `PAYPAL_SANDBOX_CLIENT_SECRET` on the backend and
  `NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID` at build time.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| “Sandbox mode requested, but PAYPAL_SANDBOX_CLIENT_ID / SECRET are not configured” | Add the sandbox credentials to the backend `.env` and restart `ms-backend`. |
| “Sandbox demo mode is enabled, but NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID is not configured” | Add the sandbox client id to `.env.production` and rebuild the frontend. |
| PayPal opens in live mode | The page was loaded without `?sandbox=1` and `localStorage` has no sandbox flag. Open the URL again or click the banner link. |
| Payout not created | The destination must be a Sandbox account with Payouts enabled. The hosted demo completed batches `GB32YVEHT8UWA` and `W9B28U85FAL9U`; inspect Artist Studio → payout history and the backend logs. The ledger still records the 85/15 split even if a payout is rejected. |
| Payment popup opens but the page does not advance | Use the app’s PayPal button (as in the fast path). Opening a PayPal `checkoutnow` URL directly can trigger anti-bot/CORS checks in the sandbox; the SDK popup flow is the supported path. |
