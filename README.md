# Stack

An honest, unbiased read on which vitamins and supplements actually make sense for **you** — no influencers, no upsell. Just the evidence, for your body.

A personal tool, not a business. It never sells supplements; any buy links (later) are chosen on merit, never commission.

## How it works

1. **About you** — a short, answerable questionnaire.
2. **What's worth taking** — a shortlist derived from your profile alone (before it knows what you already take).
3. **Your current stack** — swipe to keep or bin what you take today.
4. **Your plan** — keep / drop / add, with the "how to actually take it" for anything worth adding.

Every recommendation links to an authoritative source (NHS, Examine, the underlying trials).

## Architecture

- **Rules engine first.** The core recommendations live in a pure, unit-tested TypeScript module (`src/engine/`) — deterministic and transparent, no black box. Run `npm test` to see it.
- **The seam.** A Claude-powered layer is planned for the messy edges only — parsing a blood-test photo, and free-text ("an influencer said X — should I?"). Not yet built.

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # engine unit tests
npm run typecheck  # types
npm run build      # production build → dist/
```

Deploys automatically to GitHub Pages on push to `main` (see `.github/workflows/deploy.yml`).

---

*Not medical advice — general wellness information. Consult your GP or pharmacist.*
