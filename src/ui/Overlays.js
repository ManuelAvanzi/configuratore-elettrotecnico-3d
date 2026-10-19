// Sovrapposizioni sulla scena: viste, opzioni del cavo, barra di simulazione, suggerimenti, tooltip,
// multimetro, notifiche.
import { h, icon, clear } from './dom.js';
import { WIRE_COLORS, SECTIONS, colorById, fmt, fmtA, fmtV, fmtW } from '../sim/norms.js';
import { cabs } from '../sim/complex.js';
import { DEFS } from '../catalog/defs/index.js';

export class Overlays {
  /** @param {{minimal?: boolean}} opts minimal: solo tooltip, multimetro e notifiche (modalità tutorial) */
  constructor(app, el, { minimal = false } = {}) {
    this.app = app;
    this.el = el;
    this.minimal = minimal;
    this.tooltip = h('div', { class: 'hud tooltip', style: { display: 'none' } });
    this.meter = h('div', { class: 'hud multimeter', style: { display: 'none' } });
    this.toasts = h('div', { class: 'toasts' });
    el.append(this.tooltip, this.meter, this.toasts);
    app.on('hover', (x) => this.showTooltip(x));
    app.on('measure', () => this.refreshMeter());
    app.on('tool', () => this.refreshMeter());
    if (minimal) {
      setInterval(() => {
        if (app.interaction?.tool === 'measure') this.refreshMeter();
      }, 200);
      return;
    }
    this.buildViewbar();
    this.buildToolopts();
    this.buildSimbar();
    this.hint = h('div', { class: 'hud hint', style: { display: 'none' } });
    this.leftBtn = h('button', { class: 'hud collapse-btn l', title: 'Mostra i componenti', onclick: () => app.togglePanel('left') }, icon('panelLeft', 16));
    this.rightBtn = h('button', { class: 'hud collapse-btn r', title: 'Mostra il pannello proprietà', onclick: () => app.togglePanel('right') }, icon('panelRight', 16));
    el.append(this.hint, this.leftBtn, this.rightBtn);
    app.on('tool', () => this.refreshToolopts());
    app.on('hint', () => this.refreshHint());
    app.on('panels', () => this.refreshPanelButtons());
    this.refreshToolopts();
    this.refreshHint();
    this.refreshPanelButtons();
    setInterval(() => this.tick(), 200);
  }

  refreshPanelButtons() {
    const cls = this.app.root.classList;
    this.leftBtn.style.display = cls.contains('no-left') && !cls.contains('presenting') ? '' : 'none';
    this.rightBtn.style.display = cls.contains('no-right') && !cls.contains('presenting') ? '' : 'none';
  }

  // ── Viste ─────────────────────────────────────────────────────────────────────────
  buildViewbar() {
    const views = [['panoramica', 'Panoramica'], ['quadro', 'Quadro'], ['utenze', 'Utenze'], ['lim', 'LIM'], ['aula', 'Aula']];
    this.viewbar = h('div', { class: 'hud viewbar' }, views.map(([id, label], i) => h('button', { dataset: { view: id }, title: `${label} (${i + 1})`, onclick: () => this.app.goView(id) }, label)));
    this.el.append(this.viewbar);
    this.app.on('view', (id) => {
      for (const b of this.viewbar.children) b.classList.toggle('active', b.dataset.view === id);
    });
  }

  // ── Opzioni del cavo ──────────────────────────────────────────────────────────────
  buildToolopts() {
    this.toolopts = h('div', { class: 'hud toolopts', style: { display: 'none' } });
    this.el.append(this.toolopts);
  }

  refreshToolopts() {
    const it = this.app.interaction;
    const o = it.wireOpts;
    const t = this.toolopts;
    if (it.tool !== 'wire') {
      t.style.display = 'none';
      return;
    }
    t.style.display = '';
    clear(t);
    t.append(
      h('span', { class: 'lbl' }, 'Conduttore'),
      h('div', { class: 'swatches' }, WIRE_COLORS.map((c) => h('button', {
        class: 'swatch' + (!o.auto && c.id === o.color ? ' active' : ''),
        title: `${c.label} — ${c.use}`,
        style: { background: c.stripe ? `linear-gradient(135deg, ${c.hex} 50%, ${c.stripe} 50%)` : c.hex },
        onclick: () => { o.color = c.id; o.auto = false; this.refreshToolopts(); },
      }))),
      h('div', { class: 'seg' }, SECTIONS.slice(0, 6).map((s) => h('button', { class: !o.auto && s === o.section ? 'active' : '', title: `${fmt(s, 1)} mm²`, onclick: () => { o.section = s; o.auto = false; this.refreshToolopts(); } }, fmt(s, 1)))),
      h('span', { class: 'lbl' }, 'mm²'),
      h('label', { class: 'auto', title: 'Colore e sezione scelti in base ai morsetti (PE giallo-verde, N blu, comandi rosso, prese 2,5 mm²)' },
        h('input', { type: 'checkbox', checked: o.auto, onchange: (e) => { o.auto = e.target.checked; this.refreshToolopts(); } }), 'automatico'));
  }

  // ── Barra di simulazione ─────────────────────────────────────────────────────────
  buildSimbar() {
    const app = this.app;
    this.powerBtn = h('button', { class: 'power-btn', title: 'Alimenta / scollega l’impianto (P)', onclick: () => app.togglePower() }, h('span', { class: 'led' }), h('span', { class: 'txt' }, 'Impianto non alimentato'));
    this.meters = h('div', { class: 'meters' });
    this.speed = h('div', { class: 'seg', title: 'Velocità della simulazione (per osservare gli interventi termici)' },
      [1, 5, 20].map((k) => h('button', { dataset: { k }, class: k === 1 ? 'active' : '', onclick: () => app.setSpeed(k) }, `×${k}`)));
    this.flow = h('div', { class: 'seg', title: 'Visualizzazione dei conduttori' },
      [['normal', 'Cavi'], ['flow', 'Corrente'], ['heat', 'Carico']].map(([m, l]) => h('button', { dataset: { m }, class: m === 'normal' ? 'active' : '', onclick: () => app.setWireMode(m) }, l)));
    this.lux = h('input', { type: 'range', min: 0, max: 3, step: 0.05, value: Math.log10(400) / 1, title: 'Luminosità esterna (per il crepuscolare)', oninput: (e) => app.setLux(Math.pow(10, +e.target.value) - 1) });
    this.lastEv = h('div', { class: 'lastevent' });
    this.simbar = h('div', { class: 'hud simbar' },
      this.powerBtn,
      h('button', { class: 'btn small', title: 'Riarma tutte le protezioni intervenute', onclick: () => app.resetAll() }, icon('reset', 14), 'Riarma'),
      this.meters,
      h('div', { class: 'spacer' }),
      this.lastEv,
      h('div', { class: 'ctl', title: 'Velocità della simulazione' }, icon('timer', 14), this.speed));
    this.viewopts = h('div', { class: 'hud viewopts' },
      h('div', { class: 'ctl', title: 'Come mostrare i conduttori: normali, corrente (alternata al rallentatore), carico rispetto alla portata' }, icon('waves', 14), this.flow),
      h('div', { class: 'ctl', title: 'Luminosità esterna (per l’interruttore crepuscolare)' }, icon('sun', 14), this.lux));
    this.el.append(this.simbar, this.viewopts);
    new ResizeObserver(() => this.el.style.setProperty('--simbar-h', this.simbar.offsetHeight + 'px')).observe(this.simbar);
    app.on('speed', (k) => { for (const b of this.speed.children) b.classList.toggle('active', +b.dataset.k === k); });
    app.on('wiremode', (m) => { for (const b of this.flow.children) b.classList.toggle('active', b.dataset.m === m); });
    app.on('event', (e) => this.showEvent(e));
  }

  showEvent(e) {
    if (!e?.text) return;
    this.lastEv.className = 'lastevent ' + (e.level || '');
    clear(this.lastEv).append(icon(e.level === 'error' ? 'error' : e.level === 'warn' ? 'warn' : 'info', 14), h('span', {}, e.text));
    this.lastEv.title = e.text;
  }

  tick() {
    const app = this.app;
    const s = app.sim.powerState();
    this.powerBtn.className = 'power-btn' + (s.fault ? ' fault' : s.on ? ' on' : '');
    this.powerBtn.querySelector('.txt').textContent = s.label;
    const I = Math.max(...s.I);
    const freq = s.kind === 'genset' && s.on ? `<div class="meter"><span>Frequenza</span><b>${fmt(s.fBus, 1)} Hz</b></div>` : '';
    const html = `<div class="meter"><span>Tensione</span><b>${fmtV(s.V)}</b></div>${freq}<div class="meter"><span>Corrente</span><b>${fmtA(I)}</b></div><div class="meter"><span>Potenza</span><b>${fmtW(s.P)}</b></div><div class="meter"><span>Energia</span><b>${fmt(s.kWh, 3)} kWh</b></div>`;
    if (this.meters._h !== html) {
      this.meters.innerHTML = html;
      this.meters._h = html;
    }
    if (app.interaction.tool === 'measure') this.refreshMeter();
  }

  // ── Suggerimenti contestuali ─────────────────────────────────────────────────────
  refreshHint() {
    const it = this.app.interaction;
    let html = '';
    if (it.wireStart) html = `${icon('wire', 15).outerHTML} Morsetto <b>${it.label(it.wireStart)}</b>: ora fai clic sul morsetto di arrivo. <kbd>Esc</kbd> annulla`;
    else if (it.tool === 'wire') html = `${icon('wire', 15).outerHTML} Fai clic sul morsetto di partenza del conduttore`;
    else if (it.tool === 'place') html = `${icon('box', 15).outerHTML} Punta ${DEFS[it.placeType]?.mount === 'din' ? 'una guida DIN libera' : 'una posizione del pannello utenze'} e fai clic · <kbd>Maiusc</kbd> per inserirne altri · <kbd>Esc</kbd> annulla`;
    else if (it.tool === 'measure') html = `${icon('measure', 15).outerHTML} Clic su due morsetti: tensione · clic su un cavo: corrente`;
    this.hint.style.display = html ? '' : 'none';
    this.hint.innerHTML = html;
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────────────
  showTooltip(x) {
    const t = this.tooltip;
    if (!x || !x.screen || x.kind === null || x.kind === undefined) {
      t.style.display = 'none';
      return;
    }
    const app = this.app;
    const p = app.project;
    let html = '';
    if (x.kind === 'terminal') {
      const c = p.comp(x.term.compId);
      const n = p.wiresAt(x.term.ref).length;
      const role = { L: 'fase', N: 'neutro', PE: 'terra (PE)', coil: 'bobina', aux: 'contatto ausiliario', ctrl: 'comando' }[x.term.def.role] || '';
      let v = '';
      if (app.sim.powerState().on) {
        const V = cabs(app.sim.terminalV(x.term.compId, x.term.ref.t));
        v = ` · ${fmtV(V)} verso terra`;
      }
      html = `<b>${c?.tag} · morsetto ${x.term.def.label}</b><div class="sub">${DEFS[c.type].short}${role ? ' · ' + role : ''}${v}</div><div class="sub">${n ? `${n} conduttor${n > 1 ? 'i' : 'e'} collegat${n > 1 ? 'i' : 'o'}` : 'libero'} · clic per collegare</div>`;
    } else if (x.kind === 'part') {
      const c = p.comp(x.compId);
      html = `<b>${c ? c.tag : 'Contatore'}</b><div class="sub">${x.hint || (x.momentary ? 'Tieni premuto' : 'Clic per azionare')}</div>`;
    } else if (x.kind === 'device') {
      const c = p.comp(x.compId);
      if (!c) return;
      html = `<b>${c.tag}${c.label ? ' · ' + c.label : ''}</b><div class="sub">${DEFS[c.type].name}</div>`;
    } else if (x.kind === 'wire') {
      const w = p.wire(x.wireId);
      if (!w) return;
      const I = cabs(app.sim.wireCurrent(w.id));
      html = `<b>${p.comp(w.a.c)?.tag}:${p.terminal(w.a)?.label} → ${p.comp(w.b.c)?.tag}:${p.terminal(w.b)?.label}</b><div class="sub">${colorById(w.color).label} · ${fmt(w.section, 1)} mm²${I > 0.001 ? ' · ' + fmtA(I) : ''}</div>`;
    } else if (x.kind === 'place' || x.kind === 'drag') {
      html = x.ok ? '<b>Posizione libera</b>' : `<b>Non qui</b><div class="sub">${x.reason || 'Scegli un’altra posizione'}</div>`;
    } else {
      t.style.display = 'none';
      return;
    }
    t.innerHTML = html;
    t.style.display = '';
    t.style.left = x.screen.x + 'px';
    t.style.top = x.screen.y + 'px';
  }

  // ── Multimetro ────────────────────────────────────────────────────────────────────
  refreshMeter() {
    const app = this.app;
    const it = app.interaction;
    const m = this.meter;
    if (it.tool !== 'measure') {
      m.style.display = 'none';
      return;
    }
    m.style.display = '';
    let value = '— — —';
    let mode = 'V~';
    let probes = 'Tocca due morsetti con i puntali (rosso e nero) oppure un cavo con la pinza.';
    if (it.clamp) {
      const w = app.project.wire(it.clamp);
      const I = w ? cabs(app.sim.wireCurrent(w.id)) : 0;
      value = I < 1 ? fmt(I * 1000, 0) + ' mA' : fmt(I, I < 10 ? 2 : 1) + ' A';
      mode = 'A~ pinza';
      probes = w ? `Pinza sul cavo ${app.project.comp(w.a.c)?.tag}:${app.project.terminal(w.a)?.label} → ${app.project.comp(w.b.c)?.tag}:${app.project.terminal(w.b)?.label}` : '';
    } else if (it.probes.length) {
      const a = it.probes[0];
      const b = it.probes[1];
      probes = `<span class="probe-red">Rosso</span> ${it.label(a)}${b ? ` · <span class="probe-black">Nero</span> ${it.label(b)}` : ' · tocca il secondo morsetto'}`;
      if (b) value = fmt(app.sim.measureV(a.ref, b.ref), 1) + ' V';
    }
    m.innerHTML = `<h4>${icon('measure', 15).outerHTML} Multimetro</h4><div class="disp">${value}</div><div class="mode"><span>${mode}</span><span>CAT III 600 V</span></div><div class="probes">${probes}</div>`;
  }

  // ── Notifiche ─────────────────────────────────────────────────────────────────────
  toast(text, level = 'info', ms = 4200) {
    const ic = { error: 'error', warn: 'warn', ok: 'ok', info: 'info' }[level] || 'info';
    const t = h('div', { class: 'toast ' + level }, icon(ic, 17), h('div', {}, text));
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 350);
    }, ms);
  }
}
