// ---------------------------------------------------------------------------
// report.js — the Z-report: daily totals, per-type breakdown, variance, export.
// ---------------------------------------------------------------------------

import { el, clear, sh, niceDate, todayKey, addDays, downloadText, toCSV, toast, plural } from './util.js';
import { listTx, listDays, exportAll } from './store.js';
import { computeDay } from './float.js';

export function zReport(rows) {
  const done = rows.filter((r) => (r.outcome || 'completed') === 'completed');
  const byType = new Map();
  for (const r of done) {
    const k = r.typeLabel || r.type;
    const cur = byType.get(k) ?? { count: 0, value: 0, commission: 0 };
    cur.count += 1;
    cur.value += r.amount || 0;
    cur.commission += r.commission || 0;
    byType.set(k, cur);
  }
  const byNetwork = new Map();
  for (const r of done) {
    const cur = byNetwork.get(r.network) ?? { count: 0, value: 0, commission: 0 };
    cur.count += 1;
    cur.value += r.amount || 0;
    cur.commission += r.commission || 0;
    byNetwork.set(r.network, cur);
  }
  return {
    count: rows.length,
    completed: done.length,
    failed: rows.length - done.length,
    value: done.reduce((a, r) => a + (r.amount || 0), 0),
    commission: done.reduce((a, r) => a + (r.commission || 0), 0),
    byType: Array.from(byType, ([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value),
    byNetwork: Array.from(byNetwork, ([network, v]) => ({ network, ...v })),
  };
}

export async function renderReport(mount, ctx) {
  let from = addDays(todayKey(), -6);
  let to = todayKey();
  const body = el('div', { class: 'view' });
  clear(mount).append(body);

  async function load() {
    const [all, days] = await Promise.all([listTx(), listDays()]);
    const dayMap = new Map(days.map((d) => [d.date, d]));
    const daysKeys = Array.from(new Set([
      ...all.map((r) => r.day),
      ...Array.from(dayMap.keys()),
    ])).filter((k) => k && k >= from && k <= to).sort();

    const rowsByDay = new Map();
    for (const r of all) {
      if (!r.day) continue;
      if (!rowsByDay.has(r.day)) rowsByDay.set(r.day, []);
      rowsByDay.get(r.day).push(r);
    }

    const zDays = daysKeys.map((k) => {
      const rows = rowsByDay.get(k) ?? [];
      const day = dayMap.get(k);
      return { date: k, z: zReport(rows), rec: computeDay(rows, day), day };
    });

    const grand = zDays.reduce((a, d) => ({
      count: a.count + d.z.count,
      completed: a.completed + d.z.completed,
      failed: a.failed + d.z.failed,
      value: a.value + d.z.value,
      commission: a.commission + d.z.commission,
    }), { count: 0, completed: 0, failed: 0, value: 0, commission: 0 });

    const typeTotals = new Map();
    for (const d of zDays) {
      for (const t of d.z.byType) {
        const cur = typeTotals.get(t.label) ?? { count: 0, value: 0, commission: 0 };
        cur.count += t.count; cur.value += t.value; cur.commission += t.commission;
        typeTotals.set(t.label, cur);
      }
    }

    clear(body).append(
      el('div', { class: 'view__head' },
        el('h1', {}, 'Z-Report'),
        el('p', { class: 'muted' }, 'The day-end summary you hand to your supervisor or your own accountant.'),
      ),
      el('div', { class: 'panel' },
        el('div', { class: 'grid grid--2' },
          el('label', { class: 'field' }, el('span', {}, 'From'),
            el('input', { type: 'date', class: 'input', value: from,
              onchange: (e) => { from = e.target.value; load(); } })),
          el('label', { class: 'field' }, el('span', {}, 'To'),
            el('input', { type: 'date', class: 'input', value: to,
              onchange: (e) => { to = e.target.value; load(); } })),
        ),
        el('div', { class: 'row row--end' },
          el('button', { class: 'btn btn--ghost', onclick: () => { from = todayKey(); to = todayKey(); load(); } }, 'Today'),
          el('button', { class: 'btn btn--ghost', onclick: () => { from = addDays(todayKey(), -6); to = todayKey(); load(); } }, '7 days'),
          el('button', { class: 'btn btn--ghost', onclick: () => { from = addDays(todayKey(), -29); to = todayKey(); load(); } }, '30 days'),
          el('button', { class: 'btn btn--ghost', onclick: () => printZ(zDays, grand, from, to) }, 'Print'),
        ),
      ),
      el('div', { class: 'stats stats--2' },
        el('div', { class: 'stat' },
          el('div', { class: 'stat__label' }, 'Value handled'),
          el('div', { class: 'stat__value' }, `UGX ${sh(grand.value)}`),
          el('div', { class: 'stat__sub' }, `${plural(grand.completed, 'completed transaction')}`)),
        el('div', { class: 'stat stat--good' },
          el('div', { class: 'stat__label' }, 'Commission earned'),
          el('div', { class: 'stat__value' }, `UGX ${sh(grand.commission)}`),
          el('div', { class: 'stat__sub' }, 'net revenue for the period')),
      ),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn--primary', onclick: () => exportZ(zDays) }, 'Export Z-report (CSV)'),
        el('button', { class: 'btn btn--ghost', onclick: exportJson }, 'Backup all data (JSON)'),
      ),
      typeTotals.size ? el('div', { class: 'panel' },
        el('h3', {}, 'By transaction type'),
        table(
          ['Type', 'Count', 'Value', 'Commission'],
          Array.from(typeTotals, ([label, v]) => [label, String(v.count), `UGX ${sh(v.value)}`, `UGX ${sh(v.commission)}`]),
        ),
      ) : null,
      el('div', { class: 'panel' },
        el('h3', {}, 'By day'),
        zDays.length ? table(
          ['Date', 'Txn', 'Value', 'Commission', 'Cash variance', 'Closed'],
          zDays.map((d) => [
            niceDate(d.date),
            String(d.z.count),
            `UGX ${sh(d.z.value)}`,
            `UGX ${sh(d.z.commission)}`,
            d.rec.variance == null ? '—' : `UGX ${sh(d.rec.variance)}`,
            d.day?.closedAt ? new Date(d.day.closedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'open',
          ]),
          [1, 2, 3],
        ) : el('p', { class: 'empty' }, 'No activity in this range yet.'),
      ),
    );
  }

  function exportZ(zDays) {
    if (!zDays.length) { toast('Nothing in this range to export', 'warn'); return; }
    const rows = zDays.map((d) => ({
      date: d.date, transactions: d.z.count, completed: d.z.completed, failed: d.z.failed,
      value_ugx: d.z.value, commission_ugx: d.z.commission,
      cash_in_ugx: d.rec.cashIn + d.rec.airtimeCash, cash_out_ugx: d.rec.cashOut,
      expected_closing_ugx: d.rec.expected, counted_ugx: d.rec.counted ?? '',
      variance_ugx: d.rec.variance == null ? '' : d.rec.variance,
      closed_at: d.day?.closedAt ?? '', notes: d.day?.notes ?? '',
    }));
    const csv = toCSV(rows, [
      { key: 'date', label: 'Date' }, { key: 'transactions', label: 'Transactions' },
      { key: 'completed', label: 'Completed' }, { key: 'failed', label: 'Not completed' },
      { key: 'value_ugx', label: 'Value handled UGX' },
      { key: 'commission_ugx', label: 'Commission UGX' },
      { key: 'cash_in_ugx', label: 'Cash received UGX' },
      { key: 'cash_out_ugx', label: 'Cash paid out UGX' },
      { key: 'expected_closing_ugx', label: 'Expected closing UGX' },
      { key: 'counted_ugx', label: 'Counted closing UGX' },
      { key: 'variance_ugx', label: 'Variance UGX' },
      { key: 'closed_at', label: 'Closed at' }, { key: 'notes', label: 'Notes' },
    ]);
    if (!downloadText(`z-report_${from}_to_${to}.csv`, csv, 'text/csv')) {
      toast('Download blocked in this view', 'warn');
    } else toast('Z-report downloaded');
  }

  async function exportJson() {
    const payload = await exportAll();
    if (!downloadText(`mmt-backup_${todayKey()}.json`, JSON.stringify(payload, null, 2), 'application/json')) {
      toast('Download blocked in this view', 'warn');
    } else toast('Backup downloaded');
  }

  function printZ(zDays, grand, f, t) {
    const w = window.open('', '_blank');
    if (!w) { toast('Pop-up blocked — use Export instead', 'warn'); return; }
    const rows = zDays.map((d) => `<tr>
      <td>${d.date}</td><td>${d.z.count}</td><td>${sh(d.z.value)}</td>
      <td>${sh(d.z.commission)}</td>
      <td>${d.rec.variance == null ? '—' : sh(d.rec.variance)}</td>
      <td>${d.day?.closedAt ? new Date(d.day.closedAt).toLocaleString() : 'open'}</td></tr>`).join('');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Z-Report ${f} to ${t}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;padding:24px;color:#111}
h1{font-size:20px;margin:0 0 4px} table{border-collapse:collapse;width:100%;margin-top:16px}
td,th{border:1px solid #ccc;padding:6px 8px;text-align:right} th:first-child,td:first-child{text-align:left}
tfoot td{font-weight:700} .meta{color:#555;font-size:12px}</style>
<h1>Z-Report: ${f} to ${t}</h1>
<div class="meta">${ctx.settings.profile.businessName} · generated ${new Date().toLocaleString()}</div>
<table><thead><tr><th>Date</th><th>Txn</th><th>Value UGX</th><th>Commission UGX</th><th>Variance UGX</th><th>Closed</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td>Total</td><td>${grand.completed}</td><td>${sh(grand.value)}</td><td>${sh(grand.commission)}</td><td></td><td></td></tr></tfoot></table>`);
    w.document.close();
    w.focus();
    w.print();
  }

  await load();
}

function table(headers, rows, numericCols = []) {
  return el('div', { class: 'tablewrap' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.map((r) =>
        el('tr', {}, r.map((c, i) =>
          el('td', { class: numericCols.includes(i) ? 'num' : '' }, String(c)))))),
    ));
}
