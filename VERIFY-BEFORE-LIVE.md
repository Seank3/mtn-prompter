# Verify before you go live

This app ships with **placeholder numbers**, not verified tariffs. They are
starting points so the app is usable out of the box — they are not a statement
of what Airtel, MTN or your acquirer actually charge or permit.

Every one of these is editable in **Settings**, and changing a rate never
rewrites the commission already recorded on past transactions.

---

## 1. Commission rates (Settings → Commission rates)

| Setting | Shipped default | Set from |
|---|---|---|
| Airtel Merchant Pay | 0.6% | your Airtel agent contract |
| Airtel Cash In | 0.9% | " |
| Airtel Cash Out | 1.0% | " |
| Airtel Airtime | 1.0% | " |
| Airtel Send Money | 0.6% | " |
| Airtel Bank / Wallet | 0.5% | " |
| MTN (same six) | same placeholders | your MTN agent contract |
| VISA interchange received | 1.4% | your acquirer's merchant agreement |
| VISA acquirer % fee | 0.9% | " |
| VISA fixed fee per sale | UGX 50 | " |

**Your true card take is:**
`amount × (interchange − acquirer %) − fixed fee`
The Z-report shows gross interchange as "commission" and your Settings screen
explains the deduction — because some acquirers settle the difference off-bundle
rather than as a per-sale fee.

---

## 2. Limits (Settings → Limits & compliance triggers)

| Setting | Shipped default | What to confirm |
|---|---|---|
| Airtel / MTN daily wallet limit | UGX 5,000,000 | your provider's current full-KYC ceiling |
| Airtel / MTN monthly limit | UGX 20,000,000 | " |
| Agent per-transaction cap | UGX 5,000,000 | your agent contract cap |
| ID required at or above | UGX 1,000,000 | your provider's tier matrix |
| Escalate to manager at or above | UGX 10,000,000 | your own policy |
| "Structuring" suspicion level | UGX 1,000,000 | your own policy |
| Card decline retry cap | 2 | your acquirer's fraud policy |
| Float variance — warn / stop | UGX 500 / 2,000 | your own tolerance |

> The **ID threshold** is the one that matters most. It drives the "take the
> customer's ID" step. If it is set too high, you are under-recording; too low,
> you are photographing IDs you do not need — which is itself a data-protection
> problem.

> **Structuring** is worth understanding: splitting a 3,000,000 transaction into
> three 999,999 deposits is a known laundering technique. Several amounts just
> under your ID threshold that add up to a large one is a pattern, not a
> coincidence. The app cannot detect this automatically — it prompts you to look.

---

## 3. Things this app deliberately does not do

- **It does not file suspicious transaction reports.** Escalate to your
  supervisor or your provider's compliance desk, and to the FIU via your
  provider. In Uganda that obligation sits with the reporting institution.
- **It does not verify customer identity.** It prompts the merchant to match the
  face to the account name and to record an ID above the threshold. Actual
  verification is the provider's KYC function.
- **It does not check card authenticity.** The VISA scripts teach you what to
  look for; only your acquirer or a scheme-authorised service can verify a card.
- **It is not a licensed payment service provider.** It is a training and
  record-keeping aid for an agent who already holds a provider contract.

---

## 4. The compliance rules baked into the scripts

These are the behaviours the prompts enforce, and why each one is there:

1. **Only the account holder's own phone is used.** Third-party transactions on
   someone else's phone are refused. This is the single most common fraud
   pattern against Ugandan agents.
2. **The account name must match the person in front of you.** No exceptions for
   regulars. This is the highest-value rule in the app.
3. **Credit before you pay out.** Cash Out credits the wallet first, then pays.
   Never the other way round, never on a promise.
4. **Never transacting on a personal number.** Not to help a customer, not
   "just this once".
5. **Never asking for, seeing or writing down a PIN.** The customer enters it
   themselves and shields the screen.
6. **Never writing a full card number or CVV down.** Mask it. Never store card
   data in this app or your own notes.
7. **Never paying a large withdrawal because a stranger confirmed it by phone.**
   Only trust a call to the number withdrawing.
8. **Refunds go back to the original card**, never to a different card or cash.
9. **Never give a receipt before your own screen shows success.**
10. **Never transact from a link, a QR code or an app that is not the
    provider's.**

---

## 5. Menu positions

USSD entry codes are stable: Airtel Money is `*100#`, MTN MoMo is `*165#`.
**Menu positions are not.** Providers renumber options between versions and
between Android and feature-phone builds, so every menu path in the scripts is
given by **label as well as number** ("Agent services → Cash In").

Teach your staff the label. It survives a carrier update; a digit does not.
