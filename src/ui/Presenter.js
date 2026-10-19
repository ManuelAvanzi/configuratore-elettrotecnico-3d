// Presentazione guidata del progetto (Fase 4): la telecamera accompagna la classe componente per
// componente, mostrando parametri e motivazioni dello studente. Pensata per proiettore / LIM / 3 schermi.
import { h, icon, clear } from './dom.js';

const appendAll = (el, ...kids) => el.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));
import { DEFS } from '../catalog/defs/index.js';
import { summarize } from '../sim/checks.js';
import { mountLabel } from '../core/layout.js';
import { JUSTIFICATIONS } from '../exercises/index.js';

export class Presenter {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.i = 0;
    this.auto = false;
    this.t = 0;
    this.el = h('div', { class: 'hud', style: { position: 'absolute', left: '16px', bottom: 'calc(var(--simbar-h, 62px) + 24px)', width: 'min(520px, calc(100% - 32px))', padding: '18px 20px', display: 'none', zIndex: 8 } });
    document.getElementById('overlay').append(this.el);
  }

  slides() {
    const p = this.app.project;
    const order = (c) => (c.type === 'supply' ? -1 : c.type === 'pebar' ? 999 : c.mount.kind === 'din' ? c.mount.rail * 100 + c.mount.pos : 500 + c.mount.row * 10 + c.mount.col);
    const comps = p.components.filter((c) => c.type !== 'pebar').sort((a, b) => order(a) - order(b));
    return [
      { kind: 'intro' },
      { kind: 'scelte' },
      ...comps.map((c) => ({ kind: 'comp', id: c.id })),
      { kind: 'checks' },
    ];
  }

  toggle() {
    this.active ? this.stop() : this.start();
  }

  start() {
    this.active = true;
    this.i = 0;
    this.app.root.classList.add('presenting');
    this.app.emit('panels');
    setTimeout(() => this.app.stage.resize(), 30);
    this.el.style.display = '';
    this.show();
    this.keys = (e) => {
      if (!this.active) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') this.next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.prev();
      else if (e.key === 'Escape') this.stop();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', this.keys, true);
  }

  stop() {
    this.active = false;
    this.auto = false;
    this.app.root.classList.remove('presenting');
    this.app.emit('panels');
    this.el.style.display = 'none';
    this.app.view.flag([], []);
    window.removeEventListener('keydown', this.keys, true);
    setTimeout(() => this.app.stage.resize(), 30);
  }

  next() {
    const n = this.slides().length;
    this.i = Math.min(n - 1, this.i + 1);
    this.t = 0;
    this.show();
  }
  prev() {
    this.i = Math.max(0, this.i - 1);
    this.t = 0;
    this.show();
  }

  update(dt) {
    if (!this.active || !this.auto) return;
    this.t += dt;
    if (this.t > 7) {
      if (this.i >= this.slides().length - 1) this.auto = false;
      else this.next();
    }
  }

  show() {
    const app = this.app;
    const p = app.project;
    const slides = this.slides();
    const s = slides[this.i];
    const el = clear(this.el);
    const nav = h('div', { class: 'btn-row', style: { marginTop: '14px', alignItems: 'center' } },
      h('button', { class: 'btn small', onclick: () => this.prev(), disabled: this.i === 0 }, icon('left', 14), 'Indietro'),
      h('button', { class: 'btn small accent', onclick: () => this.next(), disabled: this.i >= slides.length - 1 }, 'Avanti', icon('right', 14)),
      h('button', { class: 'btn small', onclick: () => { this.auto = !this.auto; this.t = 0; this.show(); } }, icon(this.auto ? 'pause' : 'play', 14), this.auto ? 'Pausa' : 'Automatica'),
      h('span', { class: 'muted', style: { marginLeft: 'auto', fontSize: '12px' } }, `${this.i + 1} / ${slides.length}`),
      h('button', { class: 'btn small ghost', title: 'Esci (Esc)', onclick: () => this.stop() }, icon('close', 14)));
    if (s.kind === 'intro') {
      app.view.flag([], []);
      app.goView('panoramica');
      const m = p.meta;
      appendAll(el,
        h('div', { class: 'muted', style: { fontFamily: 'var(--font-ui)', fontWeight: 800, letterSpacing: '.06em', fontSize: '11px' } }, 'PRESENTAZIONE DEL PROGETTO'),
        h('h2', { style: { margin: '6px 0 4px', fontFamily: 'var(--font-ui)', fontSize: '24px' } }, m.title),
        h('div', { class: 'muted' }, [m.author, m.classe, m.school].filter(Boolean).join(' · ') || 'Studente / classe non indicati'),
        m.description ? h('p', { class: 'help-text', style: { color: 'var(--text)', fontSize: '14px' } }, m.description) : null,
        h('p', { class: 'help-text' }, `${p.components.filter((c) => !DEFS[c.type].fixed).length} componenti · ${p.wires.filter((w) => !w.fixed).length} conduttori · alimentazione ${p.params('XA').sys === '3F' ? 'trifase 400 V' : 'monofase 230 V'}, sistema ${p.params('XA').earth}`),
        nav);
    } else if (s.kind === 'scelte') {
      // giustificazione delle scelte (Fase 4: presentazione della configurazione adottata)
      app.view.flag([], []);
      app.goView('quadro');
      const js = p.meta.justifications || {};
      appendAll(el,
        h('div', { class: 'muted', style: { fontFamily: 'var(--font-ui)', fontWeight: 800, letterSpacing: '.06em', fontSize: '11px' } }, 'LE SCELTE DEL PROGETTO'),
        h('h2', { style: { margin: '6px 0 8px', fontFamily: 'var(--font-ui)', fontSize: '22px' } }, 'Perché l’impianto è fatto così'),
        ...JUSTIFICATIONS.map((j) => h('div', { style: { margin: '0 0 8px' } },
          h('div', { class: 'section-title', style: { marginBottom: '2px' } }, j.label),
          h('p', { class: 'help-text', style: { color: js[j.key]?.trim() ? 'var(--text)' : 'var(--dim)', fontSize: '13.5px', margin: 0 } }, js[j.key]?.trim() || `Da scrivere nel pannello Progetto: ${j.q}`))),
        nav);
    } else if (s.kind === 'comp') {
      const c = p.comp(s.id);
      const def = DEFS[c.type];
      const prm = p.params(c.id);
      app.view.flag([c.id], p.wires.filter((w) => w.a.c === c.id || w.b.c === c.id).map((w) => w.id));
      app.focusComponent(c.id, true);
      const plist = (def.params || []).filter((x) => !x.teacher).map((x) => {
        const v = prm[x.key];
        const o = x.options?.find((q) => (typeof q === 'object' ? q.value : q) === v);
        return `${x.label}: ${o && typeof o === 'object' ? o.label : v}${x.unit && !(o && typeof o === 'object') ? ' ' + x.unit : ''}`;
      });
      appendAll(el,
        h('div', { class: 'muted', style: { fontFamily: 'var(--font-ui)', fontWeight: 800, letterSpacing: '.06em', fontSize: '11px' } }, mountLabel(c.mount).toUpperCase()),
        h('h2', { style: { margin: '6px 0 2px', fontFamily: 'var(--font-ui)', fontSize: '22px' } }, `${c.tag} · ${def.short}`),
        c.label ? h('div', { style: { color: 'var(--accent-2)', fontWeight: 600 } }, c.label) : null,
        plist.length ? h('ul', { class: 'goal-list', style: { marginTop: '8px' } }, plist.map((x) => h('li', {}, x))) : null,
        h('div', { class: 'section-title', style: { marginTop: '10px' } }, 'Motivazione'),
        h('p', { class: 'help-text', style: { color: c.note ? 'var(--text)' : 'var(--dim)', fontSize: '13.5px', marginTop: 0 } }, c.note || 'Nessuna motivazione scritta: aggiungila nelle Proprietà del componente.'),
        nav);
    } else {
      app.view.flag([], []);
      app.goView('panoramica');
      const sm = summarize(app.checksPanel.results);
      appendAll(el,
        h('h2', { style: { margin: '0 0 6px', fontFamily: 'var(--font-ui)', fontSize: '22px' } }, 'Verifiche tecniche'),
        h('div', { class: 'check-summary' },
          h('div', {}, h('b', { style: { color: 'var(--error)' } }, String(sm.error)), h('span', {}, 'errori')),
          h('div', {}, h('b', { style: { color: 'var(--warn)' } }, String(sm.warn)), h('span', {}, 'avvisi')),
          h('div', {}, h('b', { style: { color: 'var(--ok)' } }, String(sm.ok)), h('span', {}, 'superate'))),
        h('p', { class: 'help-text' }, sm.error ? 'Ci sono ancora errori da discutere con la classe: aprili nella scheda Verifiche.' : 'Nessun errore: il progetto rispetta le verifiche del configuratore.'),
        nav);
    }
  }
}
