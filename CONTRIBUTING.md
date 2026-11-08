# Contributing to PayPal Agentic Music Marketplace (exito.cyou)

Thank you for your interest in contributing to **PayPal Agentic Music Marketplace**! We are building an open-core ecosystem that empowers independent musicians and audio creators to monetize directly with fans via **PayPal Orders v2**, **PayPal Payouts**, **PayPal Identity**, and **Conversational AI Agents**.

## How to Contribute

1. **Fork the repository** and create your feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Test your changes locally**:
   - Backend: `cd backend && uvicorn main:app --reload --port 8000`
   - Frontend: `npm run dev`
3. **Commit with clear, descriptive messages** following Conventional Commits (`feat:`, `fix:`, `docs:`).
4. **Open a Pull Request** describing the motivation and verification steps.

## Priority Areas for Community Contributions
- Additional **Agentic Commerce connectors** (Discord, Instagram DM, WebRTC Voice).
- Enhanced **Spotify-style analytics visualizations** inside `/artist-studio`.
- Multi-currency display and regional tax receipt templates for PayPal purchases.
