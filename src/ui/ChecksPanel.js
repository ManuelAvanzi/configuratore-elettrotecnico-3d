// Scheda Verifiche: esiti delle verifiche tecniche automatiche, raggruppati e cliccabili.
import { h, icon } from './dom.js';
import { runChecks, summarize, CHECK_GROUPS } from '../sim/checks.js';

const LEVEL_ICON = { ok: 'ok', warn: 'warn', error: 'error', info: 'info' };

export class ChecksPanel {
  constructor(app) {
    this.app = app;
    this.results = [];
    this.timer = null;
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 350);
  }

  run() {
    try {
      this.results = runChecks(this.app.project, this.app.sim);
    } catch (e) {
      console.error(e);
      this.results = [];
    }
    this.app.emit('checks', this.results);
    this.app.right?.refresh('checks');
  }

  badge() {
    const s = summarize(this.results);
    if (s.error) return { text: String(s.error), level: 'error' };
    if (s.warn) return { text: String(s.warn), level: 'warn' };
    return null;
  }

  render(el) {
    const s = summarize(this.results);
    el.append(h('div', { class: 'check-summary' },
      h('div', {}, h('b', { style: { color: 'var(--error)' } }, String(s.error)), h('span', {}, 'errori')),
      h('div', {}, h('b', { style: { color: 'var(--warn)' } }, String(s.warn)), h('span', {}, 'avvisi')),
      h('div', {}, h('b', { style: { color: 'var(--ok)' } }, String(s.ok)), h('span', {}, 'superate'))));
    if (!this.results.length) {
      el.append(h('div', { class: 'empty' }, icon('checks', 28), 'Aggiungi e collega i componenti: le verifiche si aggiornano automaticamente.'));
      return;
    }
    for (const g of CHECK_GROUPS) {
      const items = this.results.filter((r) => r.group === g.id);
      if (!items.length) continue;
      el.append(h('div', { class: 'section-title', style: { marginTop: '12px' } }, g.label));
      for (const r of items) {
        el.append(h('div', {
          class: 'check ' + r.level,
          title: 'Evidenzia nel modello',
          onclick: () => this.app.flagCheck(r),
        }, icon(LEVEL_ICON[r.level], 17), h('div', {}, h('b', {}, r.title), h('p', {}, r.detail))));
      }
    }
    el.append(h('p', { class: 'help-text', style: { marginTop: '14px', fontSize: '11.5px' } },
      'Verifiche semplificate a scopo didattico (CEI 64-8, CEI EN 60898, CEI-UNEL 35024). Le cadute di tensione si misurano con l’impianto alimentato.'));
  }
}
