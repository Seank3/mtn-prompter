// ---------------------------------------------------------------------------
// prompter.js — the prompting engine.
//
// One step at a time, large type, auto-scrolling "say" text, optional TTS,
// gating checklists, a blocking red-flag screen, a hand-the-phone-over
// customer view, and a transaction log form at the end.
// ---------------------------------------------------------------------------

import { el, clear, sh, parseSh, commission, uid, todayKey, nowTime, toast, haptic, clamp } from './util.js';
import { getFlow, NETWORKS, fillPlaceholders } from './flows.js';
import { brandLogo, artFor } from './brands.js';
import { FLOW_TYPE_FOR, TX_TYPES, CASH_DIRECTION } from './config.js';

/* ---------------- speech synthesis ---------------- */

let voices = [];
const loadVoices = () => {
  try { voices = window.speechSynthesis?.getVoices() ?? []; } catch { voices = []; }
  return voices;
};
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}
export const englishVoices = () => {
  loadVoices();
  return voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
};
export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

/* ---------------- sentence splitting ---------------- */

const splitSentences = (t) =>
  String(t || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/g)
    .map((s) => s.trim())
    .filter(Boolean);

/* ---------------- the prompter ---------------- */

export class Prompter {
  constructor(mount, { flowId, settings, profile, onExit, onLog }) {
    this.mount = mount;
    this.flow = getFlow(flowId);
    this.settings = settings;
    this.profile = profile;
    this.onExit = onExit;
    this.onLog = onLog;

    this.i = 0;
    this.ticked = this.flow.steps.map(() => new Set());
    this.startedAt = Date.now();
    this.stepStartedAt = Date.now();
    this.scrolling = true;
    this.speaking = false;
    this.paused = false;
    this.fields = { amount: '', number: '' };
    this.raf = null;
    this.wakeLock = null;
    this.ackFlags = new Set();   // red-flag step indexes already acknowledged

    if (!this.flow) {
      clear(mount).append(el('p', { class: 'empty' }, 'That flow no longer exists.'));
      return;
    }
    this.build();
    this.go(0);
    this.acquireWakeLock();
    this.bindKeys();
  }

  /* ---------- chrome ---------- */

  build() {
    const net = NETWORKS[this.flow.network];
    this.netEl = el('span', { class: 'pill pill--net', style: { '--tint': net.tint } },
      brandLogo(artFor(this.flow.network, this.settings), { size: 22 }), net.short);
    this.stepCounter = el('span', { class: 'pr__count' });
    this.timerEl = el('span', { class: 'pr__timer', title: 'Time on this step' });

    this.bar = el('div', { class: 'pr__bar' }, el('i'));

    this.liveFields = el('div', { class: 'pr__fields' },
      el('label', { class: 'field' },
        el('span', {}, 'Amount'),
        el('input', {
          type: 'text', inputmode: 'numeric', placeholder: '0', 'data-field': 'amount',
          oninput: (e) => { this.fields.amount = e.target.value; this.paint(); },
        }),
      ),
      el('label', { class: 'field' },
        el('span', {}, 'Number'),
        el('input', {
          type: 'text', inputmode: 'tel', placeholder: '07…', 'data-field': 'number',
          oninput: (e) => { this.fields.number = e.target.value; this.paint(); },
        }),
      ),
    );

    this.focusBox = el('div', { class: 'pr__focus', onclick: () => this.toggleScroll() });
    this.guide = el('div', { class: 'pr__guide' });
    this.marquee = el('div', { class: 'pr__marquee' });
    this.focusBox.append(this.marquee, this.guide);

    this.sayLabel = el('div', { class: 'pr__label' }, 'Say to the customer');
    this.doBox = el('div', { class: 'pr__do' });
    this.checkBox = el('div', { class: 'pr__checks' });

    this.custBtn = el('button', {
      class: 'btn btn--ghost pr__cust', onclick: () => this.showCustomer(),
    }, 'Show customer');

    this.prevBtn = el('button', {
      class: 'btn btn--ghost', onclick: () => this.go(this.i - 1),
    }, 'Back');
    this.nextBtn = el('button', {
      class: 'btn btn--primary', onclick: () => this.next(),
    }, 'Next');
    this.ttsBtn = el('button', {
      class: 'btn btn--icon', title: 'Read aloud', onclick: () => this.toggleSpeak(),
    }, '🔊');

    this.root = el('div', { class: 'pr' },
      el('header', { class: 'pr__head' },
        el('button', { class: 'btn btn--icon', title: 'Exit', onclick: () => this.exit() }, '✕'),
        el('div', { class: 'pr__title' },
          el('div', { class: 'pr__titlemain' }, this.netEl, ' ', this.flow.short),
        ),
        this.timerEl,
        this.stepCounter,
      ),
      this.bar,
      this.liveFields,
      this.sayLabel,
      this.focusBox,
      this.doBox,
      this.checkBox,
      el('footer', { class: 'pr__foot' },
        this.prevBtn,
        this.custBtn,
        this.ttsBtn,
        this.nextBtn,
      ),
    );

    this.timerHandle = setInterval(() => {
      const secs = Math.round((Date.now() - this.stepStartedAt) / 1000);
      this.timerEl.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    }, 1000);

    clear(this.mount).append(this.root);
  }

  bindKeys() {
    this.onKey = (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.i - 1); }
      else if (e.key.toLowerCase() === 'c') this.showCustomer();
      else if (e.key.toLowerCase() === 'v') this.toggleSpeak();
      else if (e.key === 'Escape') this.exit();
    };
    window.addEventListener('keydown', this.onKey);
  }

  async acquireWakeLock() {
    if (!this.settings.ui.keepAwake) return;
    try {
      this.wakeLock = await navigator.wakeLock?.request('screen');
    } catch { this.wakeLock = null; }
  }

  /* ---------- navigation ---------- */

  go(i) {
    const n = this.flow.steps.length;
    if (i < 0) return;
    if (i >= n) { this.finish(); return; }
    this.i = i;
    this.stepStartedAt = Date.now();
    this.stopScroll();
    this.cancelSpeech();

    const step = this.flow.steps[i];
    this.paint();

    // A red flag is shown once per step per session, blocking until read.
    if (step.flag && !this.ackFlags.has(i)) {
      this.ackFlags.add(i);
      this.showFlag(step.flag);
    }
  }

  next() {
    if (this.gateLocked()) {
      const missing = this.flow.steps[this.i].check.filter((c, idx) => c.req && !this.isTicked(idx));
      toast(`Tick first: ${missing.length} required step${missing.length > 1 ? 's' : ''}`, 'warn');
      haptic(40);
      return;
    }
    haptic();
    this.go(this.i + 1);
  }

  isTicked(idx) {
    return this.ticked[this.i]?.has(idx);
  }

  gateLocked() {
    if (!this.settings.ui.requireChecks) return false;
    const step = this.flow.steps[this.i];
    if (!step.check?.length) return false;
    return step.check.some((c, idx) => c.req && !this.isTicked(idx));
  }

  /* ---------- rendering ---------- */

  paint() {
    const step = this.flow.steps[this.i];
    const scale = this.settings.ui.prompterFontScale || 1;

    this.stepCounter.textContent = `${this.i + 1} / ${this.flow.steps.length}`;
    this.bar.firstChild.style.width = `${((this.i + 1) / this.flow.steps.length) * 100}%`;

    // A step with nothing to say aloud (a pure merchant action) shows only the
    // action list — no empty prompt box with a dash in it.
    const speakable = !!step.say;
    this.sayLabel.hidden = !speakable;
    this.focusBox.hidden = !speakable;
    if (speakable) {
      const say = this.substitute(step.say);
      this.marquee.innerHTML = '';
      const copy = el('div', {
        class: 'pr__span', style: { fontSize: `${1.45 * scale}rem` },
      }, say);
      this.marquee.append(copy, copy.cloneNode(true));
      this.marquee.dataset.text = say;
    }

    this.paintDo(step);
    this.paintChecks(step);
    this.paintButtons();
    this.startScroll();
  }

  paintDo(step) {
    clear(this.doBox);
    if (step.cust) {
      this.doBox.append(el('div', { class: 'callout callout--cust' },
        el('div', { class: 'callout__tag' }, 'On their screen'),
        el('div', { class: 'callout__body' }, this.substitute(step.cust)),
      ));
    }
    (step.do || []).forEach((line) => this.doBox.append(el('div', { class: 'doitem' },
      el('span', { class: 'doitem__dot' }), el('span', {}, line))));
    if (step.flag) {
      this.doBox.append(el('div', { class: 'callout callout--flag' },
        el('div', { class: 'callout__tag' }, 'Red flag'),
        el('div', { class: 'callout__body' }, step.flag)));
    }
  }

  paintChecks(step) {
    clear(this.checkBox);
    if (!step.check?.length) return;
    (step.check || []).forEach((c, idx) => {
      const box = el('input', { type: 'checkbox', id: `chk-${this.i}-${idx}` });
      box.checked = !!this.isTicked(idx);
      box.addEventListener('change', () => {
        if (box.checked) this.ticked[this.i].add(idx); else this.ticked[this.i].delete(idx);
        haptic();
        this.paintButtons();
      });
      this.checkBox.append(el('label', { class: `check ${c.req ? 'check--req' : ''}`, for: `chk-${this.i}-${idx}` },
        box, el('span', {}, c.t, c.req ? el('i', { class: 'check__req' }, 'required') : null)));
    });
  }

  paintButtons() {
    this.prevBtn.disabled = this.i === 0;
    const last = this.i === this.flow.steps.length - 1;
    const locked = this.gateLocked();
    this.nextBtn.classList.toggle('is-gated', locked);
    this.nextBtn.textContent = locked ? 'Locked' : last ? 'Finish' : 'Next';
    this.custBtn.disabled = !this.flow.steps[this.i].say && !this.flow.steps[this.i].cust;
  }

  substitute(text) {
    return fillPlaceholders(text, this.profile)
      .replace(/\[AMOUNT\]/g, this.fields.amount ? `UGX ${sh(parseSh(this.fields.amount))}` : '[AMOUNT]')
      .replace(/\[NUMBER\]/g, this.fields.number || '[NUMBER]');
  }

  /* ---------- marquee ---------- */

  startScroll() {
    this.stopScroll();
    const span = this.marquee.firstElementChild;
    const clone = span?.nextElementSibling;
    if (!span) return;

    const boxH = this.focusBox.clientHeight;
    const spanH = span.offsetHeight;
    const fits = spanH <= boxH + 4;
    this.focusBox.classList.toggle('is-fitted', fits);

    // The marquee holds two copies so the loop is seamless; when the text fits
    // there is nothing to loop, so the second copy must not be visible.
    if (clone) clone.style.display = fits ? 'none' : '';

    if (!this.scrolling || fits) {
      this.marquee.style.transform = 'translateY(0)';
      return;
    }

    const gap = 40;
    const speed = clamp(Number(this.settings.ui.prompterSpeed) || 55, 10, 300);
    let y = 0;
    const tick = () => {
      y += speed / 60;
      const limit = spanH + gap;
      if (y >= limit) y = 0;
      this.marquee.style.transform = `translateY(${-y}px)`;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopScroll() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; }

  toggleScroll() {
    this.scrolling = !this.scrolling;
    if (this.scrolling) this.startScroll(); else this.stopScroll();
    this.focusBox.classList.toggle('is-paused', !this.scrolling);
  }

  /* ---------- TTS ---------- */

  cancelSpeech() {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    this.speaking = false;
    if (this.ttsBtn) this.ttsBtn.textContent = '🔊';
  }

  toggleSpeak() {
    if (!speechSupported()) { toast('Speech is not available in this browser', 'warn'); return; }
    if (this.speaking) { this.cancelSpeech(); toast('Read-aloud stopped'); return; }
    const text = this.substitute(this.flow.steps[this.i].say || '');
    if (!text || text === '—') { toast('Nothing to read on this step', 'warn'); return; }
    this.speak(text);
  }

  speak(text) {
    const synth = window.speechSynthesis;
    synth.cancel();
    this.speaking = true;
    this.ttsBtn.textContent = '⏹';

    const pool = englishVoices();
    const chosen = pool.find((v) => v.voiceURI === this.settings.ui.ttsVoiceURI) || pool[0];
    const sentences = splitSentences(text);

    sentences.forEach((sentence, idx) => {
      const u = new SpeechSynthesisUtterance(sentence);
      if (chosen) u.voice = chosen;
      u.rate = clamp(Number(this.settings.ui.ttsRate) || 0.95, 0.5, 2);
      u.lang = chosen?.lang || 'en-GB';
      if (idx === sentences.length - 1) {
        u.onend = () => { this.speaking = false; this.ttsBtn.textContent = '🔊'; };
      }
      u.onerror = () => { this.speaking = false; this.ttsBtn.textContent = '🔊'; };
      synth.speak(u);
    });
  }

  /* ---------- overlays ---------- */

  overlay(inner, { dismissible = true, onOpen } = {}) {
    const ov = el('div', { class: 'ov' });
    const close = () => {
      ov.remove();
      document.removeEventListener('keydown', onKey);
      onOpen?.();
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
    if (dismissible) {
      ov.append(el('button', { class: 'ov__close btn btn--icon', onclick: close }, '✕'));
    }
    ov.append(inner);
    document.body.append(ov);
    document.addEventListener('keydown', onKey);
    return { close };
  }

  showCustomer() {
    const step = this.flow.steps[this.i];
    const body = el('div', { class: 'cust' },
      el('div', { class: 'cust__tag' }, 'Please hand the phone to the customer'),
      el('div', { class: 'cust__text' }, this.substitute(step.cust || step.say || '')),
      el('div', { class: 'cust__foot' }, 'Tap ✕ to take the phone back'),
    );
    this.stopScroll(); this.cancelSpeech();
    this.overlay(body);
  }

  showFlag(text) {
    const body = el('div', { class: 'flagbox' },
      el('div', { class: 'flagbox__tag' }, '⚠ Stop and check'),
      el('div', { class: 'flagbox__text' }, text),
      el('button', {
        class: 'btn btn--danger btn--wide', onclick: () => ov.close(),
      }, 'I have read this and I am proceeding'),
    );
    const ov = this.overlay(body, { dismissible: false });
  }

  /* ---------- finish + log ---------- */

  finish() {
    this.stopScroll();
    this.cancelSpeech();

    const typeKey = FLOW_TYPE_FOR[this.flow.id] ?? 'other';
    const meta = TX_TYPES[typeKey];
    const netId = meta?.network ?? this.flow.network;

    const amountInput = el('input', {
      type: 'text', inputmode: 'numeric', placeholder: '0', class: 'input input--big',
      oninput: (e) => this.recalc(),
    });
    amountInput.value = this.fields.amount ? String(parseSh(this.fields.amount)) : '';

    const refInput = el('input', { type: 'text', placeholder: 'Airtel / MTN / terminal reference', class: 'input' });

    const outcome = el('select', { class: 'input' },
      el('option', { value: 'completed' }, 'Completed'),
      el('option', { value: 'declined' }, 'Declined / failed'),
      el('option', { value: 'cancelled' }, 'Cancelled before completion'),
    );

    const commOut = el('div', { class: 'stat__value' }, 'UGX 0');
    this.recalc = () => {
      const v = parseSh(amountInput.value);
      const pct = this.ratePct();
      const c = commission(v, { pct, min: 0 });
      commOut.textContent = `UGX ${sh(c)}`;
    };

    const skip = el('button', { class: 'btn btn--ghost btn--wide', onclick: () => { ov.close(); this.exit(); } },
      'Skip logging — I did this manually');

    const save = el('button', {
      class: 'btn btn--primary btn--wide',
      onclick: () => {
        const value = parseSh(amountInput.value);
        const pct = this.ratePct();
        const record = {
          id: uid('tx'),
          at: new Date().toISOString(),
          day: todayKey(),
          time: nowTime(),
          network: netId,
          type: typeKey,
          typeLabel: meta.label,
          flowId: this.flow.id,
          flowTitle: this.flow.title,
          number: this.fields.number || '',
          amount: value,
          commission: commission(value, { pct }),
          ratePct: pct,
          reference: refInput.value.trim(),
          outcome: outcome.value,
          note: '',
          cash: CASH_DIRECTION[typeKey] ?? 0,
        };
        ov.close();
        this.onLog?.(record);
        this.exit();
      },
    }, 'Save transaction');

    const body = el('div', { class: 'finish' },
      el('div', { class: 'finish__head' },
        el('h2', {}, 'Log this transaction'),
        el('p', { class: 'muted' }, `${this.flow.title} · ${this.flow.est}`),
      ),
      el('label', { class: 'field' }, el('span', {}, 'Amount received (UGX)'), amountInput),
      el('div', { class: 'stat' },
        el('div', { class: 'stat__label' }, `Commission at ${this.ratePct()}%`),
        commOut,
      ),
      el('label', { class: 'field' }, el('span', {}, 'Reference number'), refInput),
      el('label', { class: 'field' }, el('span', {}, 'Outcome'), outcome),
      el('p', { class: 'muted small' },
        'Commission is calculated from the rate in Settings. Change the rate there if your contract differs.'),
      save, skip,
    );

    const ov = this.overlay(body, { dismissible: false });
    this.recalc();
    amountInput.focus?.();
  }

  ratePct() {
    const typeKey = FLOW_TYPE_FOR[this.flow.id] ?? 'other';
    const meta = TX_TYPES[typeKey];
    if (!meta || !meta.rate) return 0;
    if (this.flow.network === 'visa') return Number(this.settings.rates.visa[meta.rate] ?? 0);
    return Number(this.settings.rates[this.flow.network]?.[meta.rate] ?? 0);
  }

  /* ---------- teardown ---------- */

  exit() {
    if (this.dead) return;
    this.dead = true;
    this.stopScroll();
    this.cancelSpeech();
    clearInterval(this.timerHandle);
    window.removeEventListener('keydown', this.onKey);
    try { this.wakeLock?.release?.(); } catch { /* noop */ }
    this.onExit?.();
  }
}
