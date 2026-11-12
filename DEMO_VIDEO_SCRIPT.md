# Demo video script — under 3 minutes

Target length: **2:40**. Hard limit: **3:00** (judges are not required to watch
beyond that). Record at 1080p, 60 fps, clean audio.

Language: **English narration** (or English subtitles burned in). Use only
original music from the Éxito.cyou catalog; do not use third-party tracks.

Record the flow in **sandbox mode**: open `https://exito.cyou/?sandbox=1` and
confirm the yellow **PAYPAL SANDBOX DEMO MODE** banner is visible in the first
shot.

---

## Shot list

| Time | Section | On screen | Narration (English) |
|---|---|---|---|
| 0:00–0:15 | Hook | Home page of `https://exito.cyou/?sandbox=1` with the sandbox banner visible. Slow scroll over the catalog. | “Music is abundant. Licensing it is not. Independent artists still wait weeks to get paid, and buying the right track is a manual, fragmented process.” |
| 0:15–0:30 | Solution | Zoom on the Éxito.cyou logo and the AI concierge. | “Éxito.cyou is an agentic music marketplace where AI recommends, sells and settles original music through PayPal.” |
| 0:30–1:05 | AI agent | Open the AI chat. Type: *“Recommend a focus track for a deep-work session and let me buy it.”* Show the recommendation and the checkout action. | “The concierge understands intent, resolves the catalog, recommends a track and prepares a real PayPal order.” |
| 1:05–1:20 | Artist Studio | Log in as `demojudge`. Open `/artist-studio`. Show the catalog, the 85/15 split wallet and the PayPal payout modes. | “Artists get a complete studio: catalog, albums, lyrics, analytics and an 85/15 split ledger with PayPal Payouts.” |
| 1:20–2:00 | PayPal checkout | Go back to the track. Click Buy. Enter a guest email. Click the PayPal button. The PayPal **Sandbox** login modal opens. Log in with the sandbox buyer account. Approve. Show the success screen and the unlocked track. | “This is the real PayPal Orders v2 flow: create, approve, capture, then verify the captured amount before unlocking the download. In sandbox mode, no real money moves.” |
| 2:00–2:20 | Agentic order | Open the Live PayPal Agentic Commerce Simulator in the Artist Studio. Ask for the best track and a checkout link. Show the returned PayPal order id, gross, platform fee and artist net. | “The same agent can generate an order in chat, returning the PayPal order id and the exact split: 85 percent to the artist, 15 percent to the platform.” |
| 2:20–2:40 | Architecture | Show the architecture diagram or the code: `ecommerce.py` create/capture, `artist_studio.py` Payouts, `paypal_runtime.py` sandbox resolver. | “Orders v2 for checkout, Payouts v1 for royalties, and a request-level sandbox resolver so judges can test safely while production stays live.” |
| 2:40–2:50 | Close | Logo + `https://exito.cyou`. | “Éxito.cyou: agentic commerce for music, built for the PayPal AI Hackathon 2026.” |

---

## Pre-record checklist

- [ ] Use an incognito window so no live session leaks into the video.
- [ ] Confirm the sandbox banner is visible.
- [ ] Confirm the sandbox buyer account works (log in once before recording).
- [ ] Reset the demo artist payout mode to **manual** (no automatic payout mid-recording).
- [ ] Close other tabs and notifications.
- [ ] Do not show real emails, secrets, API keys or live PayPal screens.
- [ ] Keep the final cut under 3:00; upload as Public or Unlisted.
