// ---------------------------------------------------------------------------
// settings.js — merchant profile, limits, commission rates, prompter behaviour,
// data export/import/reset.
// ---------------------------------------------------------------------------

import { el, clear, parseSh, toast, clamp } from './util.js';
import { setSetting, exportAll, importAll, clearStore, storageMode } from './store.js';
import { englishVoices, speechSupported } from './prompter.js';
import { brandLogo } from './brands.js';

const pct = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));

export async function renderSettings(mount, ctx) {
  const s = ctx.settings;
  const save = async () => {
    await setSetting('settings', JSON.parse(JSON.stringify(s)));
    document.documentElement.dataset.theme = s.ui.theme === 'light' ? 'light' : 'dark';
    // Re-read settings into memory. Without this, app.settings stays stale and
    // a merchant who changes a setting and presses Save sees no change
    // anywhere until they restart the app. Then re-render this view so the
    // banner/bars that depend on the new values (e.g. rates confirmation)
    // update immediately.
    await ctx.reloadSettings?.();
    toast('Settings saved');
    renderSettings(mount, ctx);
  };

  const section = (title, note, ...children) => el('section', { class: 'panel' },
    el('h3', {}, title),
    note ? el('p', { class: 'muted small' }, note) : null,
    ...children);

  const text = (label, value, onSet, sub) => el('label', { class: 'field' },
    el('span', {}, label),
    el('input', { type: 'text', class: 'input', value: value ?? '',
      onchange: (e) => onSet(e.target.value) }),
    sub ? el('small', { class: 'muted' }, sub) : null);

  const money = (label, value, onSet) => el('label', { class: 'field' },
    el('span', {}, label),
    el('input', { type: 'text', inputmode: 'numeric', class: 'input', value: value ?? '',
      onchange: (e) => onSet(parseSh(e.target.value)) }));

  const number = (label, value, onSet, { min = 0, max = 1000, step = 1 } = {}) => el('label', { class: 'field' },
    el('span', {}, label),
    el('input', { type: 'number', class: 'input', value, min, max, step,
      onchange: (e) => onSet(clamp(Number(e.target.value), min, max)) }));

  const toggle = (label, value, onSet, sub) => el('label', { class: 'switch' },
    el('input', { type: 'checkbox', checked: value, onchange: (e) => onSet(e.target.checked) }),
    el('span', { class: 'switch__label' }, label, sub ? el('small', { class: 'muted' }, sub) : null));

  /* ---------- profile ---------- */

  const profile = section('Your business', 'Used to fill the merchant code and number into the scripts.',
    text('Business name', s.profile.businessName, (v) => (s.profile.businessName = v)),
    text('Your name', s.profile.merchantName, (v) => (s.profile.merchantName = v)),
    text('Airtel merchant code', s.profile.airtelCode, (v) => (s.profile.airtelCode = v.trim()),
      'Appears on the customer\'s screen in every Merchant Pay step.'),
    text('MTN merchant number', s.profile.mtnNumber, (v) => (s.profile.mtnNumber = v.trim())),
    text('VISA merchant ID (MID)', s.profile.visaMid, (v) => (s.profile.visaMid = v.trim())),
    text('Agent tier', s.profile.agentTier, (v) => (s.profile.agentTier = v)),
    text('Town / city', s.profile.city, (v) => (s.profile.city = v)),
  );

  /* ---------- rates ---------- */

  const rateRow = (net, key, label) => el('label', { class: 'field field--inline' },
    el('span', {}, label),
    el('input', {
      type: 'number', class: 'input input--rate', step: '0.05', min: '0', max: '20',
      value: s.rates[net]?.[key] ?? 0,
      onchange: (e) => { s.rates[net][key] = pct(e.target.value); },
    }),
    el('span', { class: 'suffix' }, '%'),
  );

  const rates = section('Commission rates (%)',
    'PLACEHOLDERS. Replace each one with the percentage in your own Airtel / MTN agent contract or your acquirer’s schedule. Commission is frozen onto a transaction when you save it, so changing a rate later never rewrites history.',
    el('div', { class: 'grid grid--2' },
      el('h4', { class: 'subhead' }, 'Airtel Money'),
      el('h4', { class: 'subhead' }, 'MTN MoMo'),
      rateRow('airtel', 'merchantPay', 'Merchant Pay'),
      rateRow('mtn', 'merchantPay', 'Merchant Pay'),
      rateRow('airtel', 'cashIn', 'Cash In'),
      rateRow('mtn', 'cashIn', 'Cash In'),
      rateRow('airtel', 'cashOut', 'Cash Out'),
      rateRow('mtn', 'cashOut', 'Cash Out'),
      rateRow('airtel', 'airtime', 'Airtime'),
      rateRow('mtn', 'airtime', 'Airtime'),
      rateRow('airtel', 'sendMoney', 'Send Money'),
      rateRow('mtn', 'sendMoney', 'Send Money'),
      rateRow('airtel', 'bankTransfer', 'Bank / Wallet'),
      rateRow('mtn', 'bankTransfer', 'Bank / Wallet'),
    ),
    el('h4', { class: 'subhead' }, 'VISA'),
    el('div', { class: 'grid grid--2' },
      rateRow('visa', 'cardPayment', 'Interchange you receive'),
      number('Acquirer fee per settled sale', s.rates.visa.fixedPerSale, (v) => (s.rates.visa.fixedPerSale = v), { min: 0, max: 100000, step: 5 }),
      rateRow('visa', 'acqFeePct', 'Acquirer % fee (shown as your true net)'),
    ),
    el('p', { class: 'muted small' },
      'The Z-report shows interchange as commission. Your true take is: amount × (interchange − acquirer %) − fixed fee. ' +
      'Ask your acquirer for both figures; never guess them.'),
  );

  /* ---------- limits ---------- */

  const limits = section('Limits & compliance triggers',
    'PLACEHOLDERS. These drive the ID and escalation steps. Set them from your provider’s current tier matrix.',
    el('div', { class: 'grid grid--2' },
      money('Airtel daily wallet limit', s.limits.airtelDaily, (v) => (s.limits.airtelDaily = v)),
      money('MTN daily wallet limit', s.limits.mtnDaily, (v) => (s.limits.mtnDaily = v)),
      money('Airtel monthly limit', s.limits.airtelMonthly, (v) => (s.limits.airtelMonthly = v)),
      money('MTN monthly limit', s.limits.mtnMonthly, (v) => (s.limits.mtnMonthly = v)),
      money('Airtel agent per-txn cap', s.limits.airtelAgentTxCap, (v) => (s.limits.airtelAgentTxCap = v)),
      money('MTN agent per-txn cap', s.limits.mtnAgentTxCap, (v) => (s.limits.mtnAgentTxCap = v)),
      money('ID required at or above', s.limits.idRequiredAbove, (v) => (s.limits.idRequiredAbove = v)),
      money('Escalate to manager at or above', s.limits.managerApprovalAbove, (v) => (s.limits.managerApprovalAbove = v)),
      money('“Structuring” suspicion level', s.limits.suspiciousStructuring, (v) => (s.limits.suspiciousStructuring = v)),
      number('Card decline retry cap', s.limits.cardDeclineRetryCap, (v) => (s.limits.cardDeclineRetryCap = v), { min: 1, max: 10 }),
      money('Float variance — warn above', s.limits.floatVarianceAlert, (v) => (s.limits.floatVarianceAlert = v)),
      money('Float variance — refuse to close above', s.limits.floatVarianceStop, (v) => (s.limits.floatVarianceStop = v)),
    ),
    el('p', { class: 'muted small' },
      'A payment broken into several amounts just under the ID threshold is a known laundering technique. ' +
      'Two or three “small” transactions in a row that add up to a large one is a pattern, not a coincidence.'),
  );

  /* ---------- prompter ---------- */

  const voices = englishVoices();
  const voiceSelect = el('select', { class: 'input',
    onchange: (e) => (s.ui.ttsVoiceURI = e.target.value) },
    el('option', { value: '' }, 'Device default'),
    voices.map((v) => el('option', { value: v.voiceURI, selected: v.voiceURI === s.ui.ttsVoiceURI },
      `${v.name} (${v.lang})`)));

  const prompter = section('Prompter behaviour',
    null,
    toggle('Tick required boxes before moving on', s.ui.requireChecks,
      (v) => (s.ui.requireChecks = v),
      'Forces the discipline. Turn it off only in training.'),
    number('Auto-scroll speed', s.ui.prompterSpeed, (v) => { s.ui.prompterSpeed = v; ctx.rerenderShell?.(); },
      { min: 10, max: 300, step: 5 }),
    number('Text size multiplier', s.ui.prompterFontScale, (v) => { s.ui.prompterFontScale = v; ctx.rerenderShell?.(); },
      { min: 0.8, max: 1.8, step: 0.05 }),
    el('label', { class: 'field' },
      el('span', {}, 'Primary card network'),
      el('select', { class: 'input', onchange: (e) => { s.ui.cardNetwork = e.target.value; ctx.rerenderShell?.(); } },
        [['visa', 'VISA'], ['mastercard', 'Mastercard']].map(([v, label]) =>
          el('option', { value: v, selected: (s.ui.cardNetwork || 'visa') === v }, label))),
      el('small', { class: 'muted' },
        'Only changes the logo shown on card flows. Ugandan shops take both, so pick the one you see most.'),
      el('div', { class: 'netpreviews' },
        brandLogo('visa', { size: 34 }),
        brandLogo('mastercard', { size: 34 }))),
    toggle('Read prompts aloud (press V)', s.ui.ttsEnabled, (v) => (s.ui.ttsEnabled = v)),
    el('label', { class: 'field' }, el('span', {}, 'Voice'), voiceSelect),
    number('Speaking rate', s.ui.ttsRate, (v) => (s.ui.ttsRate = v), { min: 0.5, max: 2, step: 0.05 }),
    toggle('Keep the screen awake', s.ui.keepAwake, (v) => (s.ui.keepAwake = v)),
    toggle('Airtime sold is physical cash', s.ui.airtimeIsCash !== false, (v) => { s.ui.airtimeIsCash = v; },
      'Affects the float reconciliation only.'),
    el('p', { class: 'muted small' },
      speechSupported()
        ? `Speech is available on this device (${voices.length} English voice${voices.length === 1 ? '' : 's'} found).`
        : 'This browser cannot speak text. Every script is still fully readable on screen.'),
  );

  /* ---------- data ---------- */

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const res = await importAll(payload, { merge: true });
      toast(`Merged ${res.tx} transactions, ${res.days} day sheets`);
      ctx.reloadSettings?.();
    } catch (err) {
      toast(`Could not read that file: ${err.message}`, 'warn');
    }
    fileInput.value = '';
  });

  const data = section('Your data',
    `Stored on this device only (${storageMode()}). Nothing is uploaded anywhere. Back up regularly — a lost phone is a lost till.`,
    el('div', { class: 'row' },
      el('button', { class: 'btn btn--ghost', onclick: async () => {
        const { downloadText } = await import('./util.js');
        const payload = await exportAll();
        if (!downloadText(`mmt-backup_${new Date().toISOString().slice(0, 10)}.json`,
          JSON.stringify(payload, null, 2), 'application/json')) toast('Download blocked here', 'warn');
        else toast('Backup downloaded');
      } }, 'Download backup'),
      el('button', { class: 'btn btn--ghost', onclick: () => fileInput.click() }, 'Restore from file'),
      fileInput,
      el('button', { class: 'btn btn--danger', onclick: async () => {
        if (!confirm('Delete ALL transactions, day sheets and settings on this device? This cannot be undone.')) return;
        await clearStore('tx'); await clearStore('days');
        await setSetting('settings', null);
        toast('All local data erased');
        setTimeout(() => location.reload(), 700);
      } }, 'Erase everything'),
    ),
  );

  const saveBtn = el('button', { class: 'btn btn--primary btn--wide', onclick: save }, 'Save settings');

  const confirmedOn = new Date(s.ui.ratesConfirmedAt || Date.now())
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const root = el('div', { class: 'view' },
    el('div', { class: 'view__head' },
      el('h1', {}, 'Settings'),
      el('p', { class: 'muted' },
        'Every number in this app is editable. The defaults are starting points, not verified tariffs.'),
    ),
    s.ui.ratesConfirmed
      ? el('div', { class: 'okbar' },
          el('strong', {}, '✓ Rates confirmed'),
          el('p', {}, `You marked these as checked against your provider contracts on ${confirmedOn}. ` +
            'Providers change tariffs often — re-check them when your contract is renewed.'))
      : el('div', { class: 'warnbar' },
          el('strong', {}, '⚠ Before you trade with this app:'),
          el('p', {}, 'This app ships with PLACEHOLDER commission rates and limits — not verified tariffs. ' +
            'Open Settings → Commission rates and Limits, replace every value with the figures from your own ' +
            'Airtel / MTN agent contract and your card acquirer’s agreement, then mark them confirmed. ' +
            'You can still use the app before that, but any commission it shows you may be wrong.'),
          el('label', { class: 'switch warn' },
            el('input', { type: 'checkbox', checked: !!s.ui.ratesConfirmed,
              onchange: (e) => {
                s.ui.ratesConfirmed = e.target.checked;
                s.ui.ratesConfirmedAt = e.target.checked ? new Date().toISOString() : '';
              } }),
            el('span', {}, 'I have checked these against my provider contracts')),
    ),
    profile, rates, limits, prompter, data, saveBtn,
    el('p', { class: 'muted small centre' }, 'MM Money Prompter · built for Ugandan mobile-money merchants'),
  );

  clear(mount).append(root);
}
