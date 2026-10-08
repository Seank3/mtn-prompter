// ---------------------------------------------------------------------------
// brands.js — real brand artwork, used everywhere a network is named.
//
// DECISION: image FILES, not base64 data URIs.  The marks are already tiny
// (5–23 KB each), base64 would inflate them ~33% for no benefit, and keeping
// them as files means official assets can be swapped in by dropping a file
// into assets/brands/ — no code change. The service worker precaches them, so
// offline is unaffected, and index.html preloads them so they arrive with the
// shell instead of after a request waterfall.
// ---------------------------------------------------------------------------

import { el } from './util.js';

export const BRANDS = {
  airtel: {
    id: 'airtel', label: 'Airtel Money', short: 'Airtel', tint: '#E4002B',
    mark: './assets/brands/airtel-mark.png',
    lockup: './assets/brands/airtel-lockup.png',
    onDark: true,
  },
  mtn: {
    id: 'mtn', label: 'MTN MoMo', short: 'MTN', tint: '#1E3A5F',
    mark: './assets/brands/mtn-mark.png',
    lockup: './assets/brands/mtn-lockup.png',
    onDark: true,
  },
  visa: {
    id: 'visa', label: 'VISA', short: 'VISA', tint: '#1A1F71',
    mark: './assets/brands/visa-mark.png',
    lockup: './assets/brands/visa-lockup.png',
    onDark: false,
  },
  mastercard: {
    id: 'mastercard', label: 'Mastercard', short: 'Mastercard', tint: '#EB001B',
    mark: './assets/brands/mastercard-mark.png',
    lockup: './assets/brands/mastercard-lockup.png',
    onDark: false,
  },
  // Not a network — the shop's own opening/closing routines.
  ops: {
    id: 'ops', label: 'Store operations', short: 'Ops', tint: '#22C55E',
    mark: null, lockup: null, onDark: true,
  },
  other: {
    id: 'other', label: 'Other', short: 'Other', tint: '#64748B',
    mark: null, lockup: null, onDark: true,
  },
};

export const brand = (id) => BRANDS[id] || BRANDS.other;

/** Which card-network artwork to show, given the merchant's preference. */
export function cardBrand(pref = 'visa') {
  return BRANDS[pref] || BRANDS.visa;
}

/**
 * Map an app network id to the artwork to display. Card flows all live under
 * the `visa` network in config.js, so they follow the merchant's chosen
 * primary card network (Settings > Prompter). Ugandan merchants see a mix of
 * Visa- and Mastercard-issued cards, so this is a real choice, not a cosmetic
 * one — and the flow's own title still says which scheme it names.
 */
export function artFor(network, settings = {}) {
  if (network !== 'visa') return network;
  // Accepts either the whole settings bundle (what callers hold) or just the
  // `ui` sub-object, so this cannot silently read the wrong nesting again.
  const pref = settings?.ui?.cardNetwork ?? settings?.cardNetwork ?? 'visa';
  return pref === 'mastercard' ? 'mastercard' : 'visa';
}

/**
 * A brand mark as an <img>. Explicit width/height are always set so the row
 * cannot reflow while the image loads. Returns null for networks with no
 * artwork (Ops / Other) so callers can fall back to their own glyph.
 */
export function brandLogo(id, { size = 24, variant = 'mark', className = '', alt } = {}) {
  const b = brand(id);
  const src = variant === 'lockup' ? b.lockup : b.mark;
  if (!src) return null;
  return el('img', {
    class: `logo ${className}`.trim(),
    src,
    width: size,
    height: variant === 'lockup' ? null : size,
    // Decorative whenever a text label sits beside it, which is always.
    alt: alt ?? '',
    decoding: 'async',
    draggable: 'false',
  });
}