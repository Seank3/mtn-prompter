// ---------------------------------------------------------------------------
// ledger.js — the transaction log: browse, filter, add, edit, delete.
// ---------------------------------------------------------------------------

import { el, clear, sh, parseSh, commission, uid, todayKey, nowTime, niceDate, toast, downloadText, toCSV, addDays, plural } from './util.js';
import { listTx, saveTx, deleteTx } from './store.js';
import { TX_TYPES, CASH_DIRECTION, FLOW_TYPE_FOR } from './config.js';
import { NETWORKS } from './flows.js';
import { brandLogo, artFor } from './brands.js';

const PAGE = 50;

export function rateFor(settings, typeKey) {
  const meta = TX_TYPES[typeKey];
  if (!meta?.rate) return 0;
  if (meta.network === 'visa') return Number(settings.rates.visa[meta.rate] ?? 0);
  if (meta.network === 'other') return 0;
  return Number(settings.rates[meta.network]?.[meta.rate] ?? 0);
}

const typeOptions = (selected) =>
  Object.entries(TX_TYPES).map(([k, v]) =>
    el('option', { value: k, selected: k === selected }, v.label));

const networkOptions = (selected) =>
  ['all', 'airtel', 'mtn', 'visa', 'other'].map((k) =>
    el('option', { value: k, selected: k === selected },
      k === 'all' ? 'All networks' : NETWORKS[k]?.name ?? k));

const outcomeOptions = (selected) =>
  ['completed', 'declined', 'cancelled'].map((k) =>
    el('option', { value: k, selected: k === selected },
      k === 'completed' ? 'Completed' : k === 'declined' ? 'Declined' : 'Cancelled'));

export function summarise(rows) {
  const completed = rows.filter((r) => r.outcome !== 'declined' && r.outcome !== 'cancelled');
  const total = completed.reduce((a, r) => a + (r.amount || 0), 0);
  const comm = completed.reduce((a, r) => a + (r.commission || 0), 0);
  const cashIn = completed.filter((r) => r.cash === 0 && /Cash In|Airtime/i.test(r.typeLabel || ''))
    .reduce((a, r) => a + (r.amount || 0), 0);
  const cashOut = completed.filter((r) => r.cash === 1)
    .reduce((a, r) => a + (r.amount || 0), 0);
  return {
    count: rows.length,
    completedCount: completed.length,
    total,
    commission: comm,
    cashIn,
    cashOut,
    failed: rows.length - completed.length,
  };
}

export async function renderLog(mount, ctx) {
  const state = { network: 'all', type: 'all', outcome: 'all', from: addDays(todayKey(), -6), to: todayKey(), q: '', limit: PAGE };
  const listHost = el('div', { class: 'list' });
  const sumHost = el('div', { class: 'stats stats--3' });

  const root = el('div', { class: 'view' },
    el('div', { class: 'view__head' },
      el('h1', {}, 'Transaction log'),
      el('p', { class: 'muted' }, 'Every merchant payment, cash movement and card sale you record.'),
    ),
    sumHost,
    el('div', { class: 'panel' },
      el('div', { class: 'grid grid--2' },
        el('label', { class: 'field' }, el('span', {}, 'Network'),
          el('select', { class: 'input', onchange: (e) => { state.network = e.target.value; refresh(); } },
            networkOptions(state.network))),
        el('label', { class: 'field' }, el('span', {}, 'Type'),
          el('select', { class: 'input', onchange: (e) => { state.type = e.target.value; refresh(); } },
            el('option', { value: 'all' }, 'All types'),
            typeOptions())),
      ),
      el('div', { class: 'grid grid--3' },
        el('label', { class: 'field' }, el('span', {}, 'From'),
          el('input', { type: 'date', class: 'input', value: state.from,
            onchange: (e) => { state.from = e.target.value; refresh(); } })),
        el('label', { class: 'field' }, el('span', {}, 'To'),
          el('input', { type: 'date', class: 'input', value: state.to,
            onchange: (e) => { state.to = e.target.value; refresh(); } })),
        el('label', { class: 'field' }, el('span', {}, 'Outcome'),
          el('select', { class: 'input', onchange: (e) => { state.outcome = e.target.value; refresh(); } },
            el('option', { value: 'all' }, 'Any outcome'), outcomeOptions(state.outcome))),
      ),
      el('label', { class: 'field' }, el('span', {}, 'Search reference or number'),
        el('input', { type: 'search', class: 'input', placeholder: 'Reference or number',
          oninput: (e) => { state.q = e.target.value; refresh(); } })),
      el('div', { class: 'row row--end' },
        el('button', { class: 'btn btn--ghost', onclick: () => { state.from = addDays(todayKey(), -6); state.to = todayKey(); refresh(); } }, 'Last 7 days'),
        el('button', { class: 'btn btn--ghost', onclick: () => { state.from = addDays(todayKey(), -29); state.to = todayKey(); refresh(); } }, 'Last 30 days'),
        el('button', { class: 'btn btn--primary', onclick: () => openEditor(null, ctx, refresh) }, '+ Add'),
      ),
    ),
    listHost,
  );
  clear(mount).append(root);

  async function refresh() {
    const all = await listTx();
    const filtered = all
      .filter((r) => (r.day ?? '') >= state.from && (r.day ?? '') <= state.to)
      .filter((r) => state.network === 'all' || r.network === state.network)
      .filter((r) => state.type === 'all' || r.type === state.type)
      .filter((r) => state.outcome === 'all' || (r.outcome || 'completed') === state.outcome)
      .filter((r) => !state.q || `${r.reference} ${r.number} ${r.typeLabel}`.toLowerCase().includes(state.q.toLowerCase()))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));

    const s = summarise(filtered);
    clear(sumHost).append(
      stat('Transactions', String(s.count), s.failed ? `${plural(s.failed, 'not completed')}` : 'all completed'),
      stat('Value handled', `UGX ${sh(s.total)}`, 'completed only'),
      stat('Commission earned', `UGX ${sh(s.commission)}`, 'your revenue'),
    );

    clear(listHost);
    if (!filtered.length) {
      listHost.append(el('p', { class: 'empty' },
        'Nothing logged in this range. Use “+ Add”, or run a flow and save it at the end.'));
      return;
    }

    const shown = filtered.slice(0, state.limit);
    const byDay = new Map();
    for (const r of shown) {
      if (!byDay.has(r.day)) byDay.set(r.day, []);
      byDay.get(r.day).push(r);
    }

    for (const [day, rows] of byDay) {
      const daySum = summarise(rows);
      listHost.append(el('div', { class: 'daygroup' },
        el('div', { class: 'daygroup__head' },
          el('h3', {}, niceDate(day)),
          el('span', { class: 'muted small' },
            `${plural(daySum.count, 'txn')} · UGX ${sh(daySum.total)} · comm UGX ${sh(daySum.commission)}`)),
        rows.map((r) => txRow(r, ctx, refresh)),
      ));
    }

    if (filtered.length > shown.length) {
      listHost.append(el('button', {
        class: 'btn btn--ghost btn--wide',
        onclick: () => { state.limit += PAGE; refresh(); },
      }, `Show ${Math.min(PAGE, filtered.length - shown.length)} more`));
    }
  }

  async function exportCSV() {
    const all = await listTx();
    const rows = all.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (!rows.length) { toast('Nothing to export yet', 'warn'); return; }
    const csv = toCSV(rows, [
      { key: 'day', label: 'Date' }, { key: 'time', label: 'Time' },
      { key: 'network', label: 'Network' }, { key: 'typeLabel', label: 'Type' },
      { key: 'flowTitle', label: 'Flow' }, { key: 'number', label: 'Customer number' },
      { key: 'amount', label: 'Amount UGX' }, { key: 'ratePct', label: 'Rate %' },
      { key: 'commission', label: 'Commission UGX' }, { key: 'reference', label: 'Reference' },
      { key: 'outcome', label: 'Outcome' }, { key: 'note', label: 'Note' },
    ]);
    if (!downloadText(`mmt-log-${todayKey()}.csv`, csv, 'text/csv')) {
      toast('Download blocked — long-press to copy instead', 'warn');
    }
  }
  root.querySelector('.view__head').append(
    el('button', { class: 'btn btn--ghost', onclick: exportCSV }, 'Export CSV'));

  refresh();
}

/* ---------------- pieces ---------------- */

function stat(label, value, sub) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat__label' }, label),
    el('div', { class: 'stat__value' }, value),
    sub ? el('div', { class: 'stat__sub' }, sub) : null);
}

function badge(r, settings = {}) {
  const net = NETWORKS[r.network] ?? { short: r.network, tint: '#64748B' };
  const ok = (r.outcome || 'completed') === 'completed';
  return el('span', { class: 'rowbadges' },
    el('span', { class: 'pill pill--net', style: { '--tint': net.tint } },
      brandLogo(artFor(r.network, settings), { size: 18 }), net.short),
    ok ? null : el('span', { class: 'pill pill--warn' }, r.outcome),
  );
}

function txRow(r, ctx, refresh) {
  const net = NETWORKS[r.network] ?? { tint: '#64748B' };
  return el('div', { class: 'tx', style: { '--tint': net.tint } },
    badge(r, ctx.settings),
    el('div', { class: 'tx__body', onclick: () => openEditor(r, ctx, refresh) },
      el('div', { class: 'tx__type' }, r.typeLabel || r.type,
        r.number ? el('span', { class: 'tx__num' }, r.number) : null),
      el('div', { class: 'tx__meta' },
        `${r.time ?? ''}${r.reference ? ` · ref ${r.reference}` : ''}${r.note ? ` · ${r.note}` : ''}`),
    ),
    el('div', { class: 'tx__amount' },
      el('div', { class: 'tx__val' }, `UGX ${sh(r.amount)}`),
      el('div', { class: 'tx__comm' }, `+${sh(r.commission)}`),
    ),
  );
}

/* ---------------- add / edit ---------------- */

export function openEditor(existing, ctx, done) {
  const rec = existing ? { ...existing } : {
    id: uid('tx'), at: new Date().toISOString(), day: todayKey(), time: nowTime(),
    network: 'airtel', type: 'airtelMerchantPay', amount: 0, reference: '',
    outcome: 'completed', note: '', number: '',
  };
  if (!rec.flowId && FLOW_TYPE_FOR[`${rec.network}-merchant-pay`]) {
    rec.flowId = FLOW_TYPE_FOR[`${rec.network}-merchant-pay`];
  }

  const commOut = el('div', { class: 'stat__value' }, 'UGX 0');
  const recalc = () => {
    const pct = rateFor(ctx.settings, rec.type);
    commOut.textContent = `UGX ${sh(commission(parseSh(amount.value), { pct }))}`;
  };

  const network = el('select', { class: 'input',
    onchange: (e) => { rec.network = e.target.value; recalc(); } },
    ['airtel', 'mtn', 'visa', 'other'].map((k) =>
      el('option', { value: k, selected: k === rec.network }, NETWORKS[k]?.name ?? k)));

  const type = el('select', { class: 'input',
    onchange: (e) => { rec.type = e.target.value; recalc(); } }, typeOptions(rec.type));
  const amount = el('input', { type: 'text', inputmode: 'numeric', class: 'input input--big',
    value: rec.amount || '', oninput: () => { rec.amount = parseSh(amount.value); recalc(); } });
  const number = el('input', { type: 'tel', class: 'input', value: rec.number || '',
    oninput: () => { rec.number = number.value.trim(); } });
  const reference = el('input', { type: 'text', class: 'input', value: rec.reference || '',
    oninput: () => { rec.reference = reference.value.trim(); } });
  const outcome = el('select', { class: 'input', onchange: () => { rec.outcome = outcome.value; } },
    outcomeOptions(rec.outcome || 'completed'));
  const note = el('textarea', { class: 'input', rows: '3',
    placeholder: 'Anything the next merchant should know about this one',
    oninput: () => { rec.note = note.value.trim(); } });
  note.value = rec.note || '';

  const body = el('div', { class: 'sheet' },
    el('h2', {}, existing ? 'Edit transaction' : 'Add transaction'),
    el('div', { class: 'grid grid--2' },
      el('label', { class: 'field' }, el('span', {}, 'Network'), network),
      el('label', { class: 'field' }, el('span', {}, 'Type'), type),
    ),
    el('label', { class: 'field' }, el('span', {}, 'Amount (UGX)'), amount),
    el('div', { class: 'stat' }, el('div', { class: 'stat__label' }, 'Commission'), commOut),
    el('div', { class: 'grid grid--2' },
      el('label', { class: 'field' }, el('span', {}, 'Customer number'), number),
      el('label', { class: 'field' }, el('span', {}, 'Reference'), reference),
    ),
    el('label', { class: 'field' }, el('span', {}, 'Outcome'), outcome),
    el('label', { class: 'field' }, el('span', {}, 'Note'), note),
    el('button', {
      class: 'btn btn--primary btn--wide', onclick: async () => {
        rec.amount = parseSh(amount.value);
        rec.commission = rec.outcome === 'completed'
          ? commission(rec.amount, { pct: rateFor(ctx.settings, rec.type) })
          : 0;
        rec.ratePct = rateFor(ctx.settings, rec.type);
        rec.cash = CASH_DIRECTION[rec.type] ?? 0;
        rec.typeLabel = TX_TYPES[rec.type]?.label ?? rec.type;
        await saveTx(rec);
        toast(existing ? 'Transaction updated' : 'Transaction saved');
        close();
        done?.();
      },
    }, 'Save'),
    existing ? el('button', {
      class: 'btn btn--danger btn--wide', onclick: async () => {
        if (!confirm('Delete this transaction permanently?')) return;
        await deleteTx(existing.id);
        toast('Deleted');
        close();
        done?.();
      },
    }, 'Delete transaction') : null,
  );

  const close = openSheet(body);
  recalc();
  amount.focus?.();
}

export function openSheet(inner, { title } = {}) {
  const ov = el('div', { class: 'ov ov--sheet' });
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.append(el('button', { class: 'ov__close btn btn--icon', onclick: close, 'aria-label': 'Close' }, '✕'), inner);
  document.body.append(ov);
  document.addEventListener('keydown', onKey);
  return close;
}
