# Devpost submission — copy/paste kit

Hackathon: **PayPal AI Hackathon — Build what's next with PayPal and AI**
Deadline: **Nov 12, 2026, 12:00 pm PT (3:00 pm GMT-5 / 20:00 UTC)**
Submission page: https://paypalaihackathon.devpost.com/

---

## Project title

**Éxito.cyou — Autonomous Agentic Music Marketplace with PayPal**

## Tagline (one sentence)

An AI-driven agentic marketplace where autonomous agents curate, recommend and instantly license original music through PayPal Orders v2, while artists receive automated 85/15 split royalties via PayPal Payouts.

## Demo URL

https://exito.cyou/?sandbox=1

> The `?sandbox=1` flag is important: it switches the checkout to the PayPal
> Sandbox app, shows a “no real money” banner and makes the backend use
> `api-m.sandbox.paypal.com`.

## Repository

https://github.com/jonnathanypg/paypal-agentic-music-marketplace

## Video

`<YOUTUBE_URL>` — under 3:00, public or unlisted, English narration/subtitles.

---

## Prize tracks to select

- **Grand Prizes** (1st / 2nd / 3rd)
- **Best Use of PayPal + AI**
- **Best Use of Agentic Commerce**
- **Most Creative**
- **Most Impactful**
- **Best Demo Delivery**

Do **not** select AG Grid, APIMatic, Bryntum, Channel3 or Render unless the
project actually uses those tools.

---

## Project description (paste as Markdown)

### 💡 Inspiration

Music and audio production have entered an era of abundance thanks to AI, but the commercial layer around licensing, rights and creator settlement is still stuck in manual checkout flows and delayed payouts. We asked a different question: what happens when AI agents do not just recommend music, but actively participate in commerce?

**Éxito.cyou** is our answer: an autonomous marketplace where an AI concierge understands listener intent, curates a track, and generates a real PayPal order that the fan can approve in one click. Artists keep 85% of every sale, and the split ledger is settled through PayPal Payouts.

### 🎧 What it does

- **Agentic discovery and checkout.** Fans talk to an AI concierge (Saori) in natural language. The agent resolves catalog context, recommends tracks, and can open a PayPal checkout for the selected asset.
- **Real PayPal Orders v2 flow.** The backend creates and captures PayPal orders using the Orders v2 REST API. Captured amount and currency are validated against the catalog price before the purchase is recorded.
- **Artist Studio and 85/15 split.** Independent artists upload tracks, set prices, manage albums, lyrics and covers, and see a live ledger: 85% net to the artist, 15% platform fee.
- **PayPal Payouts.** Artists can withdraw their balance through PayPal Payouts v1 (instant, threshold, scheduled or manual), or convert earnings into AI production tokens.
- **Omnichannel agent.** The same artist concierge can be exposed through web, WhatsApp and Telegram, returning a PayPal order id and a direct checkout URL.
- **Sandbox demo mode.** A single `?sandbox=1` flag isolates the entire flow to the PayPal Sandbox app, so judges can test with sandbox buyer credentials without any real charge.

### 🛠️ How we built it

- **Frontend:** Next.js (App Router), React, TypeScript and Tailwind CSS.
- **Backend:** FastAPI + SQLAlchemy, serving the catalog, purchases, split ledger and Artist Studio APIs.
- **PayPal integration:** PayPal JavaScript SDK for the checkout buttons, PayPal REST Orders v2 for create/capture, and PayPal Payouts v1 for artist withdrawals. The sandbox and live apps are resolved per request; sandbox mode never touches the live app.
- **AI layer:** A conversational concierge that combines intent routing, catalog context and LLM generation. AI is also used for metadata classification, cover search queries and recommendation signals. We use OpenAI `gpt-5-nano` and Google Gemini `2.5-flash` through LangChain, plus local Faster-Whisper and Kokoro TTS for the voice experience.
- **Data:** MySQL catalog with 700+ original tracks, 30+ albums, purchase records, split ledger and artist payout transactions.

### 🧗 Challenges we ran into

- **Separating sandbox from live without forking the app.** We added a request-level `sandbox_mode` flag that resolves PayPal credentials and API base per request, so judges can test safely while production keeps its own app.
- **Deterministic entitlement after payment.** A track is only unlocked after PayPal returns `COMPLETED`, and the captured amount must match the catalog price. This closes the “pay $0.01 for an expensive track” hole.
- **Keeping audio playing while checkout opens.** The persistent player and the checkout modal share state without interrupting playback.

### 🏆 Accomplishments we are proud of

- A fully deployed, working marketplace at **https://exito.cyou**, not a mockup.
- A real PayPal create/capture flow plus an artist payout ledger with an 85/15 split.
- A sandbox-only demo path that judges can test end to end in under two minutes.
- 700+ original tracks and a complete Artist Studio with catalog, albums, lyrics, covers and analytics.

### 📚 What we learned

- PayPal’s Orders v2 + Payouts combination is a credible rail for agentic commerce: the agent can create the order and the human approves it, while settlement stays auditable.
- Sandbox isolation must be designed at the credential level, not only in the UI.
- Catalog metadata matters: the agent needs structured price, genre, mood and creator data to negotiate and recommend reliably.

### 🔮 What is next

- **Agent-to-agent licensing:** let buyer agents and artist agents negotiate bulk licenses and settle with PayPal Payouts.
- **Dynamic pricing:** bounded negotiation between agents with PayPal as the settlement rail.
- **Subscriptions and invoicing:** recurring creator plans and automated invoices for podcast studios.
- **Webhook-driven settlement:** move entitlement and payout triggers to verified PayPal webhooks for production hardening.

### 🧾 New or existing project?

The project existed before the hackathon and was **significantly extended during the submission period**: Artist Studio, PayPal Payouts split engine, omnichannel concierge, sandbox demo mode, amount validation and the public documentation were added/updated in November 2026. See the commit history on `main`.

---

## Built with (tags)

`paypal`, `paypal-rest-api`, `paypal-javascript-sdk`, `next.js`, `react`,
`typescript`, `fastapi`, `python`, `ai-agents`, `agentic-commerce`,
`langchain`, `openai`, `google-gemini`, `tailwind-css`, `node.js`,
`audio-streaming`, `mysql`

## Tools used (AI + PayPal)

| Tool | How it is used |
|---|---|
| OpenAI `gpt-5-nano` | Conversational responses, metadata classification and cover search query generation. |
| Google Gemini `2.5-flash` | Fallback LLM for conversational and recommendation flows. |
| LangChain / LangGraph | LLM orchestration and agent context resolution. |
| Faster-Whisper | Local speech-to-text for the voice concierge. |
| Kokoro-82M TTS | Local text-to-speech voice for Saori. |
| PayPal Orders v2 | Create and capture checkout orders, with amount/currency validation. |
| PayPal Payouts v1 | Artist royalty withdrawals and automated split settlement. |
| PayPal JavaScript SDK | Checkout buttons (PayPal and card funding sources). |

---

## Testing instructions (short version for the form)

1. Open **https://exito.cyou/channel/billionaire-records-demo?buy=2&sandbox=1**
   and confirm the yellow sandbox banner.
2. Enter any email (guest checkout works) and click **Pagar con PayPal**.
3. Log in to PayPal with the sandbox buyer credentials listed in `TESTING.md`.
4. Click **Complete Purchase**; the **¡Compra exitosa!** modal unlocks the
   licensed MP3 immediately after capture.
5. Artist view: log in as `demojudge` / `PayPalDemo2026!` and open
   https://exito.cyou/artist-studio to see the sale, the 85/15 split and the
   completed sandbox payout.

Verified on 2026-11-11: purchase `17`, transaction `2BV594211J593044C`,
split $0.99 → $0.15 fee → $0.84 net, sandbox payout batch `W9B28U85FAL9U`.
Full instructions, demo accounts and troubleshooting: `TESTING.md` in the repository.

---

## Final pre-submit checklist

- [ ] Repository is public and the **About** sidebar shows **MIT license**.
- [x] `README.md`, `TESTING.md` and this file are in English.
- [x] `?sandbox=1` uses the sandbox app (yellow banner visible).
- [x] Sandbox buyer credentials are real and listed in `TESTING.md`.
- [x] A full sandbox purchase works from an incognito window.
- [x] Artist Studio opens with the demo artist and shows the 85/15 ledger.
- [ ] Video is under 3:00, public/unlisted on YouTube, English narration or subtitles.
- [ ] Devpost fields, tags, tools and prize tracks are filled.
- [ ] Submitted before **Nov 12, 2026, 3:00 pm GMT-5** (aim for 10:00 am).
