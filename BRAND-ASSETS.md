# Brand assets — where they came from and how to replace them

The app shows real Airtel, MTN, VISA and Mastercard artwork. This file records
exactly what each file is, so nobody has to reverse-engineer it later.

## ⚠️ Read this before you publish

**These files were derived from artwork supplied for this build, not from the
networks' official brand portals.** They are correct enough to recognise, but
if this app goes on the Play Store, or into a branch of a real chain, swap in
the official press-kit files first. The networks restrict how their marks may be
reproduced (colour, clear space, minimum size, "do not distort") and those terms
are not satisfied by a crop taken from a supplied image.

Swapping is trivial: overwrite the file, keep the filename, bump the service
worker cache version. No code changes.

## Files

| File | What it is | Size | Used in |
|---|---|---|---|
| `airtel-mark.png` | Airtel swirl, recoloured white on an Airtel-red rounded tile | 5.5 KB | Flow cards, filter tabs, group headers, prompter header, log rows |
| `airtel-lockup.png` | Full Airtel lockup — swirl over the `airtel` wordmark | 25 KB | Reference / print; not in the main UI |
| `mtn-mark.png` | The navy MoMo tile with the yellow MoMo mark | 23 KB | Same as Airtel |
| `mtn-lockup.png` | MoMo tile + "MoMo from MTN" | 27 KB | Reference / print |
| `visa-mark.png` | Navy `VISA` wordmark on a white rounded tile | 9.8 KB | Same as Airtel |
| `visa-lockup.png` | `VISA` wordmark alone | 41 KB | Reference / print |
| `mastercard-mark.png` | The red/orange Mastercard circles on a white tile | 9.9 KB | Same as Airtel |
| `mastercard-lockup.png` | Mastercard circles alone | 17 KB | Reference / print |

Total ~155 KB. The four *marks* are what actually render in the app and are
precached by the service worker; the *lockups* are fetched normally.

## Why PNG files and not base64

The question came up during the build, so here is the reasoning:

| | PNG files (chosen) | base64 data URIs |
|---|---|---|
| Total bytes | ~47 KB for the four marks | ~63 KB (base64 adds ~33%) |
| Requests | 4, all `<link rel="preload">` in the shell | 0 |
| Offline | Precached by `sw.js` | Free with the HTML |
| Swapping for official art | Drop in a file | Edit a JS module |
| Cache across versions | Normal HTTP caching | Re-downloaded with the JS |

Base64 buys one thing — no extra requests — and only pays for it when the
assets are large. At 5–23 KB each, files are the better trade, and they keep
the swap-to-official-art path trivial. If you later want to inline them anyway,
`js/brands.js` is the only file to change.

## Colours

| Brand | Tint used for pills/headers/borders |
|---|---|
| Airtel | `#E4002B` |
| MTN MoMo | `#1E3A5F` |
| VISA | `#1A1F71` |
| Mastercard | `#EB001B` |

These live in `js/brands.js` (`BRANDS[*].tint`). They drive the surrounding UI
only — the logos themselves carry their own colours.

## Visa or Mastercard?

All six card flows live under the `visa` network id in `js/config.js`, because
they are card *handling* flows (payment, refund, pre-auth, declines,
chargeback, fraud check) rather than scheme-specific ones. Which mark is
displayed follows the merchant's choice in **Settings → Prompter behaviour →
Primary card network**, because Ugandan shops see both and neither is
"correct". The default is VISA.

Flow titles still name the scheme explicitly, so nothing is ambiguous on screen.

## Rebuilding the assets

The generator used for this build is `/home/user/.qa/build-brands.py`. It reads
the three supplied JPGs from `/home/user/uploads/` and writes the eight files
above. It is not part of the shipped app — the app only needs the PNGs.

To regenerate or adjust, edit the crop coordinates at the bottom of each
section, then check the result at `.qa/brands-preview.html` (a contact sheet
showing every mark at 16/24/32/44 px on both themes).

## After changing anything here

1. Bump `VERSION` in `sw.js` — otherwise returning users keep the old logos
   from cache.
2. Re-run the E2E suite (`/home/user/.qa/e2e.mjs`), which asserts that every
   flow card, tab, group header, prompter header and log row carries a decoded
   logo.