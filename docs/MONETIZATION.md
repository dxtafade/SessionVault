# Monetization — how we actually collect money

> One-off strategy note for the team. Not legal/financial advice — payment
> providers' fees and country eligibility change often, **verify current terms
> before committing.** _2026-06-12._

## The core constraint (name it first)

We're a **CIS-based team**, our customers are **global**. The tech (gating,
licensing) is easy. The hard part: **most global processors (Stripe, Paddle,
Lemon Squeezy, PayPal) will not onboard a Russia/CIS-resident seller** due to
sanctions/compliance. So "how do we get paid" is really a **jurisdiction /
entity decision**, not a coding one.

## Good news: no 30% store tax

Google **shut down Chrome Web Store payments** years ago — there is no built-in
extension billing and **no platform cut**. You bring your own processor and your
own license check, and keep ~95%+ (minus processor fees). Unlike mobile apps,
there's no 15–30% store tax. That materially helps the unit economics.

## Three strategic paths

### Path 1 — Foreign entity + global processor (best for scaling worldwide)
Form a legal entity in a friendly jurisdiction, which unlocks Stripe / MoR
platforms and mainstream card payments from anyone.

- **Entity options (cheapest → closest to home):**
  - **US LLC** via Stripe Atlas / doola / Firstbase (~$500 setup, non-resident
    friendly) → Stripe + Mercury/Wise bank. The classic CIS-founder path.
  - **Estonia e-Residency + OÜ** → EU banking + Stripe.
  - **Kazakhstan / Armenia / Georgia / UAE** company → easier KYC for CIS
    residents, local banking, some processors.
- **Then use one of:**
  - **Lemon Squeezy** or **Paddle** — *Merchant of Record*: they're the seller,
    handle **global VAT/sales tax, fraud, chargebacks**; you just get payouts.
    Huge win for a 3-person team that can't deal with worldwide tax. ~5% + fees.
  - **ExtensionPay (extensionpay.com)** — built **specifically for Chrome
    extensions**, minimal code, Stripe under the hood. Least-code option. ~5% + Stripe.
  - **Stripe** direct — most control, but you handle tax/compliance yourself.

### Path 2 — Crypto gateway (fastest, borderless, no entity needed)
Accept **USDT / crypto** via a CIS-friendly gateway. Works regardless of
sanctions, no foreign entity required, payout to CIS.
- Gateways: **Cryptomus**, **NOWPayments**, **Plisio** — generate a checkout,
  webhook on payment. Fees ~0.4–1%.
- **Trade-off:** mainstream Western users dislike crypto → lower conversion;
  price volatility; "feels sketchy" to some. Good as a **fast test of
  willingness-to-pay** or a secondary rail, weaker as the only rail for a global
  consumer product.

### Path 3 — RU-local rails (only if the audience is Russian)
If a meaningful chunk of users are in Russia, a RU rail captures RU cards with an
**ИП / самозанятый** — no foreign entity.
- **YooKassa (ЮKassa)**, **Robokassa**, **CloudPayments**, **T-Bank acquiring**,
  **Lava.top**, **Boosty/Продамус**. Fees ~3–4%.
- **Limit:** RU cards / RU customers only — does **not** capture global Visa/MC.

## Processor cheat-sheet

| Option | Type | Handles tax? | CIS-resident seller? | Payout | Fee (rough) |
|---|---|---|---|---|---|
| Lemon Squeezy | MoR | ✅ | ❌ (needs foreign entity) | Stripe/PayPal/Wise | ~5%+ |
| Paddle | MoR | ✅ | ❌ (foreign entity) | Bank/Payoneer | ~5%+ |
| ExtensionPay | Gateway (Stripe) | ❌ | ❌ (Stripe country) | Stripe | 5% + Stripe |
| Stripe direct | Processor | ❌ | ❌ (US/EST/… entity) | Bank | 2.9%+30¢ |
| Cryptomus / NOWPayments | Crypto | ❌ | ✅ | Crypto/CIS | ~0.4–1% |
| YooKassa / Robokassa | RU acquiring | RU only | ✅ (ИП/самозанятый) | RU bank | ~3–4% |

## How billing plugs into our product

Whatever the rail, the mechanic is the same and small:
1. User clicks **Upgrade** → opens the processor's hosted checkout (web page).
2. On success, the processor fires a **webhook** to our backend (Supabase edge
   function / a tiny server).
3. The webhook flips the user's record to **`pro`** in the DB.
4. The extension reads entitlement from the backend — **`entitlements.js` (today
   a stub flag) becomes the real license check.** `GET_ENTITLEMENTS` already
   exists; just back it with the paid status.
- MoR/ExtensionPay provide most of this glue; ExtensionPay is purpose-built for
  the extension case.

## Pricing & packaging (recap from BUSINESS.md)

- $4.99/mo or $39/yr (annual ≈ 35% off → better cash + retention).
- Add an **early-adopter lifetime / founder deal** (~$29 one-time) for first
  revenue + champions while the brand is unknown and trust is low.
- Gate convenience/scale (sync, cross-device, long history, autosave) — never the
  free "never lose your tabs" safety net.

## ⭐ Our actual path: Kazakhstan ИП (verified 2026-06)

We can open a **Kazakhstan ИП** — and Kazakhstan is unsanctioned with real
payment access a Russian entity lacks. Verified:

- **Paddle supports Kazakhstan sellers** ([Paddle supported countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle)).
  Paddle is a **Merchant of Record** — it handles worldwide VAT/sales tax, fraud,
  and chargebacks, and pays out globally. With a KZ ИП this basically **solves
  monetization** for a 3-person team. ~5%.
- **Payoneer works in Kazakhstan** ([Payoneer KZ](https://www.payoneer.com/payments/kazakhstan/))
  — multicurrency (USD/EUR) receiving account, easy to open, withdraw to a KZ
  bank. Use it as the payout hub.
- **Stripe is NOT available in Kazakhstan directly** — only via a US LLC
  ([doola](https://www.doola.com/stripe-guide/how-to-open-a-stripe-account-in-kazakhstan/)).
  So **ExtensionPay and Lemon Squeezy (both Stripe-based) are out** with a KZ
  entity — drop them.
- **Alternative:** local KZ acquirers (Freedom Pay, CloudPayments KZ, ePay/Halyk)
  onboard a KZ ИП and accept international Visa/MC, settling to a KZ account — but
  then **you** owe customers' taxes (Paddle removes that headache).
- **Tax:** KZ ИП on the simplified regime (упрощёнка ~3% of turnover, or patent)
  is cheap; with Paddle as MoR you only owe KZ tax on your income.

**Recommended stack: KZ ИП → Paddle (checkout + subscriptions + tax) → payout to
Payoneer / KZ bank.** Crypto gateway optional as a second rail. Integration:
Paddle webhook → set `pro` in Supabase → `entitlements.js` becomes the real
license check (`GET_ENTITLEMENTS` already exists).

## Recommendation for us (early stage)

1. **If going global (likely):** the durable answer is a **foreign entity (US
   LLC is the well-trodden CIS path) → ExtensionPay or Lemon Squeezy.** LS/Paddle
   remove the global-tax nightmare; ExtensionPay removes the extension-glue work.
2. **To validate fast without entity overhead:** launch with a **crypto gateway
   (Cryptomus/NOWPayments)** to prove people will pay at all, then form the entity
   once revenue justifies the ~$500 + admin.
3. **If early users skew RU:** add a **YooKassa/Lava** rail via ИП/самозанятый in
   parallel — cheap and instant for that segment.
4. Don't block the **free-first launch (RELEASE.md Option A)** on any of this —
   ship free, build the audience, wire billing when conversion signal appears.

## Open questions for the team

- Where do we expect users to come from first — global or RU? (Decides the rail.)
- Are we willing to set up a foreign entity now, or validate with crypto first?
- Who owns the billing webhook → `pro` integration (Core/Dexter) when we get there?
