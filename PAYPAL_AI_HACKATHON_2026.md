# PayPal AI Hackathon 2026 — Submission Notes

Project: **Éxito.cyou — Autonomous Agentic Music Marketplace with PayPal**

- Deadline: **Nov 12, 2026, 12:00 pm PT (3:00 pm GMT-5 / 20:00 UTC)**
- Submission page: https://paypalaihackathon.devpost.com/
- Repository: https://github.com/jonnathanypg/paypal-agentic-music-marketplace
- Demo (sandbox, no real money): https://exito.cyou/?sandbox=1

## Canonical documents

| Document | Purpose |
|---|---|
| [`README.md`](./README.md) | Product overview, architecture and setup |
| [`TESTING.md`](./TESTING.md) | Judge access, sandbox demo accounts, troubleshooting |
| [`DEVPOST_SUBMISSION.md`](./DEVPOST_SUBMISSION.md) | Ready-to-paste Devpost fields and description |
| [`DEMO_VIDEO_SCRIPT.md`](./DEMO_VIDEO_SCRIPT.md) | English demo video script (<3 minutes) |

## What is implemented (accurate)

- PayPal **Orders v2** create + capture, with captured amount/currency validation.
- PayPal **Payouts v1** for artist withdrawals and the 85/15 split ledger.
- PayPal **JavaScript SDK** checkout buttons (PayPal and card funding sources).
- Request-level **sandbox mode** (`?sandbox=1` / `sandbox_mode: true`) that uses
  `https://api-m.sandbox.paypal.com` and dedicated sandbox app credentials.
- AI concierge with intent routing + LLM generation, catalog recommendations and
  a checkout action; OpenAI `gpt-5-nano`, Google Gemini `2.5-flash`,
  LangChain/LangGraph, local Faster-Whisper and Kokoro TTS.
- Artist Studio with catalog, albums, lyrics, covers, analytics and payout modes.
- 700+ original tracks and 30+ albums in the hosted demo.

## Verified end-to-end (2026-11-11)

Hosted sandbox demo, using the app's PayPal SDK popup flow (not a hand-built
`checkoutnow` URL):

| Step | Evidence |
|---|---|
| Create order | `56H75135LP133603P`, `mode: sandbox` |
| Capture + purchase | purchase `17`, transaction `2BV594211J593044C` |
| Amount validation | $0.99 USD matched the catalog price |
| 85/15 split | gross $0.99 / platform fee $0.15 / artist net $0.84 credited to `billionaire-records-demo` |
| Download | licensed MP3 served (3.1 MB, ID3-tagged) |
| Payouts v1 | sandbox batch `W9B28U85FAL9U`, status `completed` |

Direct demo-track URL:
https://exito.cyou/channel/billionaire-records-demo?buy=2&sandbox=1

## Claims to avoid

- Do **not** claim PayPal “Identity OAuth”; the app links a PayPal email/merchant
  id and validates API credentials.
- Do **not** claim webhooks; webhook-driven settlement is listed as future work.
- Do **not** claim “SDK v6”; the app uses the standard PayPal JS SDK.
- Never publish invented sandbox credentials. The hosted demo uses a real
  PayPal Sandbox Personal account provisioned in the Developer Dashboard and
  documented in `TESTING.md`.
