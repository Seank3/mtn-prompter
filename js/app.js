// ---------------------------------------------------------------------------
// app.js — boot, routing, the flow picker, and the bottom navigation.
// ---------------------------------------------------------------------------

import { el, clear, qs, qsa, sh, todayKey, toast } from './util.js';
import { init as initStore, getSetting, setSetting, listTx, getDay } from './store.js';
import { mergeSettings, SETTINGS_KEY } from './config.js';
import { FLOWS, NETWORKS } from './flows.js';
import { Prompter, speechSupported } from './prompter.js';
import { renderLog, summarise } from './ledger.js';
import { renderFloat } from './float.js';
import { renderReport } from './report.js';
import { renderSettings } from './settings.js';
import { brandLogo, artFor } from './brands.js';

const app = {
  settings: mergeSettings({}),
  state: { flowNetwork: 'all', query: '', floatDate: null },
  ctx: null,
};

/* ---------------- theme ---------------- */

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

/* ---------------- views ---------------- */

function flowCard(f) {
  const net = NETWORKS[f.network];
  const art = brandLogo(artFor(f.network, app.settings), { size: 22 });
  return el('button', { class: 'card flow', style: { '--tint': net.tint },
    dataset: { risk: f.risk },
    onclick: () => { location.hash = `#/flow/${f.id}`; },
  },
    el('div', { class: 'flow__top' },
      el('span', { class: 'pill pill--net', style: { '--tint': net.tint } },
        art, net.short),
      f.ussd !== '—' ? el('code', { class: 'flow__ussd' }, f.ussd) : null,
    ),
    el('h3', { class: 'flow__name' }, f.title),
    el('p', { class: 'flow__blurb' }, f.blurb),
    el('div', { class: 'flow__foot' },
      el('span', { class: 'meta' }, `${f.steps.length} steps`),
      el('span', { class: 'meta' }, `~${f.est}`),
      el('span', { class: 'risk' }, `${f.risk} risk`),
    ),
  );
}

async function renderHome(mount) {
  const statsHost = el('div', { class: 'stats stats--3' });
  const listHost = el('div', { class: 'flowgrid' });

  const tabs = el('div', { class: 'tabs' },
    [['all', 'All'], ['airtel', 'Airtel'], ['mtn', 'MTN'], ['visa', 'VISA'], ['ops', 'Ops']]
      .map(([id, label]) => el('button', {
        class: `tab tab--net`, dataset: { net: id },
        style: { '--tint': NETWORKS[id]?.tint ?? '#64748B' },
        onclick: () => { app.state.flowNetwork = id; paint(); },
      }, brandLogo(artFor(id, app.settings), { size: 18 }), label)),
  );

  const search = el('input', {
    type: 'search', class: 'input search', placeholder: 'Search a flow — e.g. cash out, refund, fraud',
    value: app.state.query,
    oninput: (e) => { app.state.query = e.target.value; paint(); },
  });

  const root = el('div', { class: 'view' },
    el('div', { class: 'hero' },
      el('h1', {}, 'Money Prompter'),
      el('p', {}, 'Your step-by-step guide for every Airtel Money, MTN MoMo and VISA transaction at the counter.'),
    ),
    // Shown until the merchant confirms the shipped placeholder rates.
    app.settings.ui.ratesConfirmed ? null : el('div', {
      class: 'warnbar warnbar--home',
      onclick: () => { location.hash = '#/settings'; },
      role: 'button', tabindex: '0',
    },
      el('strong', {}, '⚠ Commission rates are placeholders'),
      el('p', {}, 'Confirm them against your provider contracts before you trade. Tap to review.'),
    ),
    statsHost, tabs, search, listHost,
  );
  clear(mount).append(root);

  async function paint() {
    qsa('.tab', tabs).forEach((t) => t.classList.toggle('is-on', t.dataset.net === app.state.flowNetwork));

    const txs = await listTx();
    const today = txs.filter((r) => r.day === todayKey());
    const s = summarise(today);
    const day = await getDay(todayKey());
    clear(statsHost).append(
      el('div', { class: 'stat' },
        el('div', { class: 'stat__label' }, 'Today'),
        el('div', { class: 'stat__value' }, String(s.count)),
        el('div', { class: 'stat__sub' }, 'transactions')),
      el('div', { class: 'stat stat--good' },
        el('div', { class: 'stat__label' }, 'Commission'),
        el('div', { class: 'stat__value small' }, `UGX ${sh(s.commission)}`),
        el('div', { class: 'stat__sub' }, 'today')),
      el('div', { class: 'stat' },
        el('div', { class: 'stat__label' }, 'Till'),
        el('div', { class: `stat__value small ${day?.closedAt ? '' : 'muted'}` },
          day ? `UGX ${sh(day.counted ?? 0)}` : '—'),
        el('div', { class: 'stat__sub' }, day?.closedAt ? 'day closed' : 'not counted')),
    );

    const q = app.state.query.trim().toLowerCase();
    const list = FLOWS.filter((f) => app.state.flowNetwork === 'all' || f.network === app.state.flowNetwork)
      .filter((f) => !q || `${f.title} ${f.short} ${f.blurb}`.toLowerCase().includes(q));

    clear(listHost);
    if (!list.length) {
      listHost.append(el('p', { class: 'empty' }, 'No flow matches that search.'));
      return;
    }
    const groups = app.state.flowNetwork === 'all' ? ['airtel', 'mtn', 'visa', 'ops'] : [app.state.flowNetwork];
    for (const g of groups) {
      const inGroup = list.filter((f) => f.network === g);
      if (!inGroup.length) continue;
      if (groups.length > 1) {
        listHost.append(el('h2', { class: 'grouph', style: { '--tint': NETWORKS[g].tint } },
          brandLogo(artFor(g, app.settings), { size: 20 }),
          g === 'visa'
            ? `${NETWORKS[g].name} & Mastercard`
            : NETWORKS[g].name));
      }
      const grid = el('div', { class: 'flowgrid__inner' });
      inGroup.forEach((f) => grid.append(flowCard(f)));
      listHost.append(grid);
    }
  }

  await paint();
}

/* ---------------- router ---------------- */

const ROUTES = [
  { name: 'flows',    match: (h) => h === '' || h === '#/' || h === '#/flows',        icon: '▶',   render: renderHome },
  { name: 'log',      match: (h) => h === '#/log',                                   icon: '≡',   render: renderLog },
  { name: 'float',    match: (h) => h === '#/float',                                 icon: '⇄',   render: renderFloat },
  { name: 'report',   match: (h) => h === '#/report',                                icon: '▦',   render: renderReport },
  { name: 'settings', match: (h) => h === '#/settings',                              icon: '⚙',   render: renderSettings },
];

const TABS = ['flows', 'log', 'float', 'report', 'settings'];

function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean);
  return { name: parts[0] || 'flows', arg: parts[1] || null };
}

let currentPrompter = null;
// Set while we are tearing a prompter down *because* we are already routing to
// a new screen. Without this, the outgoing prompter's exit() would redirect the
// hash back to '#/' and clobber the destination (e.g. switching flow to flow).
let suppressExitNav = false;

async function route() {
  const mount = qs('#app');
  const { name, arg } = parseHash();

  if (currentPrompter) {
    suppressExitNav = true;
    currentPrompter.exit();
    suppressExitNav = false;
    currentPrompter = null;
  }

  // prompter takes over the whole screen
  if (name === 'flow' && arg) {
    const flow = FLOWS.find((f) => f.id === arg);
    document.body.classList.add('is-prompter');
    clear(mount).append(el('div', { class: 'pr-loading' }, flow ? '' : 'Loading flow…'));
    if (!flow) {
      toast('Unknown flow', 'warn');
      location.hash = '#/';
      return;
    }
    currentPrompter = new Prompter(mount, {
      flowId: arg,
      settings: app.settings,
      profile: app.settings.profile,
      // Only steer the hash if we are still on a prompter route — otherwise an
      // in-flight exit would clobber whatever the user navigated to next.
      onExit: () => {
        if (suppressExitNav) return;
        const here = parseHash();
        if (here.name === 'flow') location.hash = '#/';
      },
      onLog: async (record) => {
        const { saveTx } = await import('./store.js');
        await saveTx(record);
        toast(`Logged ${record.typeLabel} · UGX ${sh(record.amount)} · +${sh(record.commission)} commission`);
      },
    });
    return;
  }
  document.body.classList.remove('is-prompter');

  const r = ROUTES.find((x) => x.match(`#/${name}`)) || ROUTES[0];
  qsa('.tabbar button').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === r.name));
  // toasts are global; a message about the screen you just left is just noise
  qs('#toasts')?.remove();
  // the main area is the only scroller, so reset it here (not window.scrollTo)
  mount.scrollTop = 0;
  window.scrollTo?.(0, 0);
  await r.render(mount, app.ctx);
}

function buildNav() {
  const nav = qs('#tabbar');
  clear(nav);
  for (const key of TABS) {
    const def = ROUTES.find((r) => r.name === key);
    nav.append(el('button', { class: 'tabbtn', dataset: { tab: key },
      onclick: () => { location.hash = `#/${key}`; } },
      el('span', { class: 'tabbtn__icon' }, def.icon),
      el('span', { class: 'tabbtn__label' }, def.icon === '⚙' ? 'Settings' : key[0].toUpperCase() + key.slice(1)),
    ));
  }
}

function buildTopbar() {
  const bar = qs('#topbar');
  clear(bar);
  bar.append(
    el('div', { class: 'brand' },
      el('span', { class: 'brand__mark' }, 'M'),
      el('span', { class: 'brand__name' }, app.settings.profile.businessName || 'Money Prompter'),
    ),
    el('div', { class: 'topbar__right' },
      app.settings.ui.ttsEnabled && speechSupported()
        ? el('span', { class: 'chip', title: 'Read-aloud available — press V in a flow' }, '🔊 voice')
        : null,
      el('button', { class: 'btn btn--icon', title: 'Switch theme',
        onclick: async () => {
          const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
          app.settings.ui.theme = next;
          applyTheme(next);
          await setSetting(SETTINGS_KEY, JSON.parse(JSON.stringify(app.settings)));
        } }, document.documentElement.dataset.theme === 'light' ? '🌙' : '☀️'),
    ),
  );
}

/* ---------------- boot ---------------- */

async function boot() {
  const mode = await initStore();
  const loaded = await getSetting(SETTINGS_KEY, {});
  app.settings = mergeSettings(loaded);
  applyTheme(app.settings.ui.theme);

  app.ctx = {
    settings: app.settings,
    state: app.state,
    reloadSettings: async () => {
      const l = await getSetting(SETTINGS_KEY, {});
      app.settings = mergeSettings(l);
      app.ctx.settings = app.settings;
      buildTopbar();
    },
    rerenderShell: () => buildTopbar(),
  };

  buildTopbar();
  buildNav();
  window.addEventListener('hashchange', route);

  qs('#splash')?.remove();
  await route();

  if (mode === 'memory') {
    toast('Storage is blocked in this view — your data will not be saved', 'warn');
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline not available */ });
  }
}

boot();
