# Business & Growth — early-stage analysis

> **One-off strategy note** for the team to study — not a spec, not a feature
> plan, no code attached. A grounded first pass on how Session Vault could find
> users and make money. Numbers are illustrative **hypotheses to test**, not
> promises. _2026-06-11._

## 1. The honest shape of the opportunity

- **Demand is proven** — OneTab (~2M), Session Buddy (~1M), Tab Session Manager.
  We are not creating a market; we're entering a validated one.
- **The hard part is NOT building or converting — it's getting installs.**
  Conversion is a small % of a number you first have to *earn*. Most of the early
  effort is acquisition, not engineering.
- The **$12–13K MRR** figure (150K users × 2.2% × ~$5) is a **north star, not a
  year-1 expectation.** A realistic early path is hundreds → low thousands of
  users. Plan and celebrate accordingly.

## 2. Our wedge — why anyone switches

Established competitors have loud, specific pains in their reviews: **lost tabs,
no credible encrypted cross-device sync, abandoned/sold extensions (broken trust).**
Our angle is narrow on purpose:

- **"Never lose your tabs"** — reliability as the headline promise.
- **End-to-end encrypted cloud sync + multi-device** — we built it; most rivals
  lack a privacy-first sync story.
- **Local-first, no tracking** — a trust story in a category full of creepy or
  abandoned extensions.

Don't try to out-feature them broadly. Win **one painful job**: *my tabs are safe,
private, and follow me across devices.*

## 3. Pricing (starting point)

- **Free** = the safety net (save/restore/search/folders/trash/export). Generous
  on purpose, so it spreads and earns trust.
- **Pro** = $4.99/mo or $39/yr (annual ≈ 35% off → pushes annual, better cash &
  retention).
- Consider an **early-adopter lifetime / founder deal** (e.g. ~$29 one-time) to
  get first revenue + champions while the brand is unknown.
- The paywall must gate something users *feel* — sync, cross-device, long history,
  autosave — **never** the core "never lose your tabs" safety net.

## 4. The funnel — what to optimize, in order

`Install → Activation (saves 1st session) → Habit (returns in week 1) → hits a wall they care about → Converts`

- Early effort concentrates at the **top** (installs) and **activation** (first-run
  "aha"). The 3-step onboarding already helps.
- Free→paid conversion for extensions is typically **~1–3%**. Plan for the low end;
  2.2% is optimistic-but-possible, not a given.

## 5. Acquisition on a near-zero budget (priority order)

1. **Chrome Web Store ASO** — the #1 free channel. Keyword-rich title ("Session
   Manager · Tab Saver · Sync"), sharp screenshots, a benefit-led description, and
   **ratings** (prompt happy users at a good moment). Most installs come from
   in-store search.
2. **Migrate frustrated competitors' users** — mine OneTab / Session Buddy 1–2★
   reviews, speak to those exact pains ("lost your tabs? encrypted sync?") in copy
   and a simple comparison page.
3. **Launch posts** — Show HN, Product Hunt, r/chrome, r/productivity, r/browsers,
   r/datahoarder (literal tab hoarders). One good launch can seed the first hundreds.
4. **SEO content** — "OneTab alternative", "how to save & sync browser tabs",
   "recover lost tabs". Cheap and compounding.
5. **Heavy-tab niches** — researchers, students, devs, writers; communities where
   100-tab people already hang out.

## 6. Metrics vs the "no tracking" promise

- **Free signal, zero code:** the Chrome Web Store dashboard (installs, weekly
  users, uninstalls, ratings). Start here.
- For the funnel you'll eventually want activation / retention / conversion.
  Options consistent with the privacy stance: **opt-in** anonymous metrics, or
  aggregate-only counts. Decide deliberately — running a freemium business fully
  blind is very hard. (Whatever you choose, keep it consistent with PRIVACY.md.)

## 7. Realistic phases

- **Phase 0 — Validate (free):** ship the free wedge, reach ~1K installs + real
  reviews, learn activation & retention. **No billing needed yet.**
- **Phase 1 — Monetize:** turn on Pro (needs billing infra + SMTP for sync).
  First payers come from your most engaged free users.
- **Phase 2 — Scale:** double down on the channel that worked, improve conversion,
  consider family/team plans.

## 8. Costs — near-zero, not zero

- $5 one-time Chrome developer registration · domain (~$10/yr) · Supabase free
  tier until you have real usage (then usage-based) · payment fees (~3–5%).
- The real cost is **time**, especially on acquisition and support.

## 9. Risks to watch

- **Acquisition is the #1 risk** — the build is largely done; "nobody installs" is
  the actual failure mode.
- Chrome Web Store policy / rejection; Manifest V3 changes over time.
- **Trust** — an extension that reads your tabs is scary; lean hard on the
  privacy / E2E-encryption story everywhere.
- Support load and churn once there's a paid tier.
- Competitor response (free/cheap sync).

## 10. Strategy in one sentence

Ship a genuinely useful free **"never lose your tabs"** extension, win trust with
**privacy-first encrypted sync**, grow through **Web Store search + competitor-pain
migration**, and invest in paid **only once the free funnel shows retention.**

## 11. Reality check — what we have vs what this needs

- **Have:** working product, E2E-encrypted sync, privacy story, onboarding, free
  safety net. The engineering wedge is basically ready.
- **Need (see [`RELEASE.md`](RELEASE.md)):** billing infra, a polished store listing
  (ASO), an actual acquisition motion, and a metrics decision. **None of these are
  code in the three component areas — they're the unowned "Area 4/5" work.**

---

_This is intentionally basic and theoretical — a shared starting point so all
three of us reason about the business, not just the code. Refine it together._
