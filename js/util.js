// ---------------------------------------------------------------------------
// util.js — small shared helpers. No dependencies.
// ---------------------------------------------------------------------------

/* ---------- money (UGX is a whole-shilling currency: store integers) -------- */

export const sh = (n) => {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('en-UG');
};

export const ugx = (n) => `UGX ${sh(n)}`;

/** Parse "12,000", "12000", "12 000", "12.50" -> 12500 (rounded). */
export const parseSh = (s) => {
  if (typeof s === 'number') return Math.round(s);
  const cleaned = String(s ?? '').replace(/[^0-9.\-]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * Commission = percentage of value, with an optional floor and a cap.
 * All arguments are integer shillings except pct (percent).
 */
export function commission(value, { pct = 0, fixed = 0, min = 0, cap = 0 } = {}) {
  let c = Math.round((value * pct) / 100);
  if (fixed) c += fixed;
  if (min) c = Math.max(c, min);
  if (cap) c = Math.min(c, cap);
  return c;
}

/* ---------- dates -------------------------------------------------------- */

export const todayKey = (d = new Date()) => dayKey(d);

/** Local-time YYYY-MM-DD (NOT toISOString, which shifts across TZ). */
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dayKey(dt);
}

export const niceDate = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const nowTime = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function uid(prefix = 'id') {
  const rnd =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}

/* ---------- DOM ----------------------------------------------------------- */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') {
      // CSS custom properties (--tint) CANNOT be set with Object.assign on a
      // CSSStyleDeclaration — that silently creates a JS property and the
      // variable keeps falling back to its :root default. Use setProperty.
      for (const [prop, val] of Object.entries(v)) {
        if (val === null || val === undefined || val === false) continue;
        if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
        else node.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

export function toast(msg, kind = 'ok') {
  let host = qs('#toasts');
  if (!host) {
    host = el('div', { id: 'toasts', class: 'toasts' });
    document.body.append(host);
  }
  const t = el('div', { class: `toast toast--${kind}`, text: msg });
  host.append(t);
  setTimeout(() => { t.classList.add('is-out'); }, 2600);
  setTimeout(() => t.remove(), 3100);
}

export function haptic(ms = 18) {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

/* ---------- text ---------------------------------------------------------- */

export const titleCase = (s) =>
  String(s).replace(/\b\w/g, (c) => c.toUpperCase());

/** Escape for safe innerHTML interpolation. */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** 1 -> "1 transaction", 2 -> "2 transactions" */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- download ------------------------------------------------------ */

export function downloadText(filename, text, mime = 'text/plain') {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export const toCSV = (rows, columns) => {
  const escCell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => escCell(c.label ?? c.key)).join(',');
  const body = rows.map((r) => columns.map((c) => escCell(r[c.key])).join(',')).join('\n');
  return `${head}\n${body}\n`;
};
