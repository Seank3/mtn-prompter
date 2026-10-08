// ---------------------------------------------------------------------------
// float.js — daily cash float and agent-float reconciliation.
//
// The single most useful control a small agent has: if the cash in the till
// at close does not equal what the log says it should be, you know something
// went wrong TODAY, while you still remember what it was.
// ---------------------------------------------------------------------------

import { el, clear, sh, parseSh, niceDate, todayKey, addDays, toast, plural } from './util.js';
import { listTx, getDay, saveDay, deleteDay } from './store.js';

const dayId = (k) => `day_${k}`;

const WALLET_SIGN = {
  airtelCashIn: -1, mtnCashIn: -1,
  airtelCashOut: 1, mtnCashOut: 1,
  airtelMerchantPay: 1, mtnMerchantPay: 1,
  airtelAirtime: -1, mtnAirtime: -1,
  airtelSendMoney: 0, mtnSendMoney: 0,
  airtelBank: 0, mtnBank: 0,
  visaPayment: 0, visaRefund: 0, visaPreauth: 0, other: 0,
};

let ctxAirtime = true; // "physical airtime counts as cash into the till"

export function computeDay(rows, day) {
  const done = rows.filter((r) => (r.outcome || 'completed') === 'completed');
  const cashIn = done.filter((r) => r.type === 'airtelCashIn' || r.type === 'mtnCashIn')
    .reduce((a, r) => a + (r.amount || 0), 0);
  const airtimeCash = ctxAirtime
    ? done.filter((r) => r.type === 'airtelAirtime' || r.type === 'mtnAirtime')
      .reduce((a, r) => a + (r.amount || 0), 0)
    : 0;
  const cashOut = done.filter((r) => r.type === 'airtelCashOut' || r.type === 'mtnCashOut')
    .reduce((a, r) => a + (r.amount || 0), 0);

  const commission = done.reduce((a, r) => a + (r.commission || 0), 0);
  // Agent wallet = +commission, then the transaction's own effect on the
  // merchant float: cash-in debits your float, cash-out credits it.
  const walletMove = done.reduce((a, r) => {
    const sign = WALLET_SIGN[r.type] ?? 0;
    return a + (r.commission || 0) + sign * (r.amount || 0);
  }, 0);

  const open = day?.openingFloat ?? 0;
  const added = (day?.cashAdded ?? 0) - (day?.cashRemoved ?? 0);
  const expected = open + added + cashIn + airtimeCash - cashOut;
  const counted = day?.counted ?? 0;
  const variance = day?.counted == null ? null : counted - expected;

  return {
    cashIn, airtimeCash, cashOut, commission, walletMove,
    opening: open, added, expected, counted, variance,
    transactions: rows.length,
    failed: rows.length - done.length,
  };
}

export async function renderFloat(mount, ctx) {
  ctxAirtime = ctx.settings.ui.airtimeIsCash !== false;
  let date = ctx.state.floatDate || todayKey();
  const body = el('div', { class: 'view' });
  const state = { day: null, summary: null, alert: null };
  ctx.state.floatDate = date;

  const dayPicker = el('div', { class: 'daynav' },
    el('button', { class: 'btn btn--icon', onclick: () => { date = addDays(date, -1); load(); } }, '‹'),
    el('strong', { class: 'daynav__label' }),
    el('button', { class: 'btn btn--icon', onclick: () => { date = addDays(date, 1); load(); } }, '›'),
    el('button', { class: 'btn btn--ghost', onclick: () => { date = todayKey(); load(); } }, 'Today'),
  );

  clear(mount).append(body);

  async function load() {
    ctx.state.floatDate = date;
    dayPicker.querySelector('.daynav__label').textContent = niceDate(date);

    const rows = (await listTx()).filter((r) => r.day === date);
    const day = await getDay(date);
    state.day = day ?? blankDay(date);

    // The form is built once per date and keeps its inputs; only the
    // computed summary is re-rendered, so a half-typed figure is never lost.
    clear(body).append(head, dayPicker, summaryHost, formHost, explainerHost);
    buildForm();
    await paintSummary();
  }

  const head = el('div', { class: 'view__head' },
    el('h1', {}, 'Float & reconciliation'),
    el('p', { class: 'muted' },
      'Cash in the till must equal what your log says it should. Do this every day, not every week.'),
  );
  const summaryHost = el('div', { class: 'view__summary' });
  const formHost = el('div', {});
  const explainerHost = el('div', { class: 'view__explainer' });

  const num = (label, value, sub, tone) => el('div', { class: `stat ${tone ? `stat--${tone}` : ''}` },
    el('div', { class: 'stat__label' }, label),
    el('div', { class: 'stat__value' }, `UGX ${sh(value)}`),
    sub ? el('div', { class: 'stat__sub' }, sub) : null);

  async function paintSummary() {
    const rows = (await listTx()).filter((r) => r.day === date);
    const s = computeDay(rows, state.day);
    const { limits } = ctx.settings;
    state.summary = s;

    const alert = s.variance == null ? null
      : Math.abs(s.variance) > limits.floatVarianceStop ? 'stop'
      : Math.abs(s.variance) > limits.floatVarianceAlert ? 'warn' : 'ok';
    state.alert = alert;

    clear(summaryHost).append(
      el('div', { class: 'stats stats--2' },
        num('Expected closing float', s.expected, `opening ${sh(s.opening)} + adj ${sh(s.added)}`),
        num('Counted in the till', s.counted ?? 0, 'enter it below'),
      ),
      el('div', { class: `variance variance--${alert ?? 'none'}` },
        el('div', { class: 'variance__label' }, 'Variance'),
        el('div', { class: 'variance__value' },
          s.variance == null ? '— not counted —' : `UGX ${sh(s.variance)}`),
        el('div', { class: 'variance__note' },
          s.variance == null ? 'Count the till to see your variance.'
            : s.variance === 0 ? 'Balanced. Well run.'
            : s.variance > 0 ? 'More cash than expected — investigate before you close.'
            : 'Less cash than expected — investigate before you close.'),
      ),
      el('div', { class: 'stats stats--2' },
        num('Cash received from customers', s.cashIn + s.airtimeCash,
          s.airtimeCash ? `includes ${sh(s.airtimeCash)} airtime` : 'cash-in + airtime'),
        num('Cash paid out to customers', s.cashOut, 'cash-out withdrawals'),
      ),
      el('div', { class: 'stats stats--2' },
        num('Commission earned', s.commission, `${plural(s.transactions, 'transaction')} logged`),
        num('Expected agent-float move', s.walletMove,
          'what your MoMo agent balance should do, excl. bank transfers'),
      ),
    );

    clear(explainerHost).append(
      el('div', { class: 'panel panel--quiet' },
        el('h3', {}, 'How the expected figure is built'),
        el('pre', { class: 'formula' },
`expected closing float
  = opening float
  + cash added in / (cash taken out)
  + cash-in deposits        ${sh(s.cashIn)}
  + airtime sold in cash    ${sh(s.airtimeCash)}
  - cash-out withdrawals    ${sh(s.cashOut)}`),
        el('p', { class: 'muted small' },
          'Card payments are excluded: the money settles to your account, not your till. ' +
          'Set “airtime is physical cash” off in Settings if you sell airtime digitally only.'),
      ),
    );

    // keep the close button's wording and severity in step with the numbers
    if (state.closeBtn) {
      state.closeBtn.textContent = state.day.closedAt ? 'Re-open / re-close day' : 'Close the day';
      state.closeBtn.className = `btn btn--wide ${alert === 'stop' ? 'btn--danger' : 'btn--primary'}`;
    }
    if (state.deleteBtn) state.deleteBtn.hidden = !state.day.closedAt;
  }

  function buildForm() {
    const d = state.day;
    const save = async (patch) => {
      Object.assign(d, patch, { id: dayId(date), date });
      await saveDay({ ...d });
      await paintSummary();
    };
    state.save = save;

    const notes = el('textarea', { class: 'input', rows: '3',
      placeholder: 'What did you check? What did you find?' });
    notes.value = d.notes || '';
    notes.addEventListener('change', () => save({ notes: notes.value.trim() }));
    state.notes = notes;

    state.closeBtn = el('button', { class: 'btn btn--primary btn--wide',
      onclick: async () => {
        const s = state.summary;
        const stop = ctx.settings.limits.floatVarianceStop;
        if (s.variance != null && Math.abs(s.variance) > stop && !d.notes) {
          toast('Write down what you checked before closing an unexplained variance', 'warn');
          notes.focus();
          return;
        }
        // capture the intent first: save() mutates d, so reading d.closedAt
        // afterwards would report the opposite of what actually happened
        const wasClosed = !!d.closedAt;
        await save({ closedAt: wasClosed ? null : new Date().toISOString() });
        toast(wasClosed ? 'Day re-opened' : 'Day closed and saved');
      },
    }, d.closedAt ? 'Re-open / re-close day' : 'Close the day');

    state.deleteBtn = el('button', {
      class: 'btn btn--ghost btn--wide', hidden: !d.closedAt,
      onclick: async () => { await deleteDay(date); toast('Day sheet removed'); load(); },
    }, 'Delete this day sheet');

    clear(formHost).append(
      el('div', { class: 'panel' },
        el('h3', {}, 'Day sheet'),
        el('div', { class: 'grid grid--2' },
          fieldNum('Opening float (start of day)', d.openingFloat, (v) => save({ openingFloat: v ?? 0 })),
          fieldNum('Cash added to the till (own cash, bank, top-up)', d.cashAdded, (v) => save({ cashAdded: v ?? 0 })),
          fieldNum('Cash taken out of the till (banked, sent home)', d.cashRemoved, (v) => save({ cashRemoved: v ?? 0 })),
          fieldNum('Counted in the till at close', d.counted, (v) => save({ counted: v })),
        ),
        el('div', { class: 'grid grid--2' },
          fieldNum('Airtel agent balance (optional)', d.agentAir, (v) => save({ agentAir: v })),
          fieldNum('MTN agent balance (optional)', d.agentMtn, (v) => save({ agentMtn: v })),
        ),
        el('label', { class: 'field' }, el('span', {}, 'Reconciliation note'), notes),
        state.closeBtn,
        state.deleteBtn,
      ),
    );
  }

  await load();
}

function blankDay(date) {
  return {
    id: `day_${date}`, date,
    openingFloat: 0, cashAdded: 0, cashRemoved: 0,
    counted: null, agentAir: '', agentMtn: '', notes: '', closedAt: null,
  };
}

function fieldNum(label, value, onDone) {
  const input = el('input', {
    type: 'text', inputmode: 'numeric', class: 'input', value: value ?? '',
    onchange: () => onDone?.(input.value === '' ? null : parseSh(input.value)),
  });
  return el('label', { class: 'field' }, el('span', {}, label), input);
}
