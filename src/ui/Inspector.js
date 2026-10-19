// Pannello destro: schede Proprietà · Verifiche · Esercitazioni.
import { h, icon, clear, optLabel, optValue } from './dom.js';
import { DEFS } from '../catalog/defs/index.js';
import { WIRE_COLORS, SECTIONS, colorById, iz, fmt, fmtA, fmtV } from '../sim/norms.js';
import { cabs } from '../sim/complex.js';
import { mountLabel } from '../core/layout.js';
import { JUSTIFICATIONS } from '../exercises/index.js';

const ACTIONS = {
  toggle: { icon: 'toggle', label: (s, def) => (['sa', 'sd', 'si', 'kpp'].includes(def.type) ? 'Commuta' : s.on ? 'Apri (OFF)' : 'Chiudi (ON)') },
  test: { icon: 'activity', label: () => 'Tasto di prova T', momentary: true },
  reset: { icon: 'reset', label: () => 'Ripristina' },
  trip: { icon: 'zap', label: () => 'Prova di intervento' },
  replace: { icon: 'wrench', label: () => 'Sostituisci' },
  replaceCoil: { icon: 'wrench', label: () => 'Sostituisci bobina' },
  trigger: { icon: 'walk', label: () => 'Simula un passaggio' },
  resetEnergy: { icon: 'reset', label: () => 'Azzera energia' },
  power: { icon: 'power', label: (s) => (s.limiter ? 'Riarma il contatore' : s.on ? 'Scollega l’impianto' : 'Alimenta l’impianto') },
  press: { icon: 'pointer', label: () => 'Premi', momentary: true },
  start: { icon: 'play', label: () => 'MARCIA', momentary: true },
  stop: { icon: 'pause', label: () => 'ARRESTO', momentary: true },
};

export class RightPanel {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.tab = 'props';
    this.tabs = h('div', { class: 'tabs' });
    this.body = h('div', { class: 'panel-body' });
    el.append(this.tabs, this.body);
    this.panels = {};
    this.renderTabs();
  }

  register(id, label, iconName, panel) {
    this.panels[id] = { label, icon: iconName, panel };
    this.renderTabs();
  }

  renderTabs() {
    clear(this.tabs);
    for (const [id, p] of Object.entries(this.panels)) {
      const count = p.panel.badge?.();
      this.tabs.append(h('button', { class: 'tab' + (id === this.tab ? ' active' : ''), onclick: () => this.show(id) },
        icon(p.icon, 15), p.label, count ? h('span', { class: 'count ' + (count.level || '') }, count.text) : null));
    }
    this.tabs.append(h('div', { style: { flex: 1 } }),
      h('button', { class: 'tbtn icon', title: 'Nascondi il pannello', onclick: () => this.app.togglePanel('right') }, icon('panelRight', 16)));
  }

  show(id) {
    this.tab = id;
    this.renderTabs();
    clear(this.body);
    this.panels[id]?.panel.render(this.body);
    this.body.scrollTop = 0;
  }

  refresh(id) {
    if (!id || id === this.tab) {
      const st = this.body.scrollTop;
      clear(this.body);
      this.panels[this.tab]?.panel.render(this.body);
      this.body.scrollTop = st;
    }
    this.renderTabs();
  }
}

export class Inspector {
  constructor(app) {
    this.app = app;
    this.live = null;
    this.timer = setInterval(() => this.tick(), 250);
  }

  badge() {
    return null;
  }

  render(el) {
    this.el = el;
    this.live = null;
    const sel = this.app.selection;
    if (sel?.comp && this.app.project.comp(sel.comp)) this.renderComponent(el, sel.comp);
    else if (sel?.wire && this.app.project.wire(sel.wire)) this.renderWire(el, sel.wire);
    else this.renderProject(el);
  }

  // ── Componente ────────────────────────────────────────────────────────────────────
  renderComponent(el, id) {
    const app = this.app;
    const project = app.project;
    const c = project.comp(id);
    const def = DEFS[c.type];
    const params = project.params(id);
    const thumb = app.library?.thumbs[c.type];
    el.append(h('div', { class: 'insp-head' },
      h('div', { class: 'insp-thumb' }, thumb ? h('img', { src: thumb, alt: '' }) : null),
      h('div', { class: 'insp-title' },
        h('div', { class: 'kind' }, def.name),
        h('h3', {}, def.fixed ? c.tag : h('input', { class: 'tag-input', value: c.tag, title: 'Sigla del componente (CEI EN 81346)', onchange: (e) => project.setMeta(id, { tag: e.target.value.trim().toUpperCase() || c.tag }) }),
          ' ', h('span', { class: 'muted', style: { fontSize: '12px', fontWeight: 500 } }, mountLabel(c.mount))))));

    if (!def.fixed) {
      el.append(h('div', { class: 'field' }, h('label', {}, 'Descrizione'),
        h('input', { type: 'text', value: c.label || '', placeholder: 'es. Luci soggiorno, Prese cucina…', onchange: (e) => project.setMeta(id, { label: e.target.value }) })));
    }

    // Parametri
    const ps = (def.params || []).filter((p) => !p.teacher || app.settings.teacher);
    if (ps.length) {
      const sec = h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('sliders', 13), 'Parametri'));
      for (const p of ps) sec.append(this.paramField(id, p, params[p.key]));
      el.append(sec);
    }

    // Stato e misure (aggiornati dal vivo)
    const inst = app.sim.getInst(id);
    const ro = h('div', { class: 'readouts' });
    const acts = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const sec2 = h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('activity', 13), 'Stato e misure'), ro, acts);
    el.append(sec2);
    this.live = { kind: 'comp', id, ro, acts, def };
    this.fillReadouts();
    this.fillActions();
    void inst;

    // Morsetti e collegamenti
    const terms = project.terminals(id);
    if (terms.length) {
      const list = h('div', { class: 'term-list' });
      for (const t of terms) {
        const ws = project.wiresAt({ c: id, t: t.id });
        const to = ws.map((w) => {
          const o = w.a.c === id && w.a.t === t.id ? w.b : w.a;
          const oc = project.comp(o.c);
          const ot = project.terminal(o);
          return `${oc?.tag}:${ot?.label} (${colorById(w.color).label.toLowerCase()} ${fmt(w.section, 1)} mm²)`;
        });
        list.append(h('div', { class: 'term-item' },
          h('b', {}, t.label),
          h('span', { class: 'to', title: to.join('\n') }, to.length ? to.join(' · ') : h('span', { class: 'muted' }, 'libero')),
          h('button', { class: 'btn small ghost', title: 'Collega da questo morsetto', onclick: () => app.startWireFrom({ c: id, t: t.id }) }, icon('wire', 14))));
      }
      el.append(h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('wire', 13), 'Morsetti e collegamenti'), list));
    }

    // Motivazione
    if (!def.fixed) {
      el.append(h('div', { class: 'section' },
        h('div', { class: 'section-title' }, icon('book', 13), 'Motivazione della scelta'),
        h('div', { class: 'field' }, h('textarea', {
          placeholder: 'Perché hai scelto questo componente e questi parametri? (compare nella scheda tecnica e nella presentazione)',
          oninput: (e) => { c.note = e.target.value; app.scheduleSave(); },
        }, c.note || ''))));
    }
    if (def.help) el.append(h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('info', 13), 'A cosa serve'), h('p', { class: 'help-text' }, def.help)));
    if (!def.fixed) {
      el.append(h('div', { class: 'section btn-row' },
        h('button', { class: 'btn', onclick: () => app.focusComponent(id) }, icon('scan', 15), 'Inquadra'),
        h('button', { class: 'btn danger', onclick: () => app.deleteSelection() }, icon('trash', 15), 'Rimuovi')));
    }
  }

  paramField(id, p, value) {
    const app = this.app;
    const set = (v) => {
      const r = app.project.setParam(id, p.key, v);
      if (r?.error) app.toast(r.error, 'warn');
      else if (app.project.comp(id)) {
        /* aggiornato */
      }
    };
    let control;
    if (p.type === 'select') {
      control = h('select', { onchange: (e) => set(parse(p, e.target.value)) },
        p.options.map((o) => h('option', { value: String(optValue(o)), selected: String(optValue(o)) === String(value) }, optLabel(o) + (p.unit && typeof o !== 'object' ? ' ' + p.unit : ''))));
    } else if (p.type === 'number') {
      const out = h('output', {}, `${fmt(value, p.step < 1 ? 1 : 0)} ${p.unit || ''}`);
      const range = h('input', { type: 'range', min: p.min, max: p.max, step: p.step, value,
        oninput: (e) => { out.textContent = `${fmt(+e.target.value, p.step < 1 ? 1 : 0)} ${p.unit || ''}`; },
        onchange: (e) => set(+e.target.value) });
      control = h('div', { class: 'range-row' }, range, out);
    } else if (p.type === 'bool') {
      control = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!value, onchange: (e) => set(e.target.checked) }), h('span', {}, value ? 'Sì' : 'No'));
    } else {
      control = h('input', { type: 'text', value: value ?? '', onchange: (e) => set(e.target.value) });
    }
    return h('div', { class: 'field' + (p.teacher ? ' teacher' : '') },
      h('label', {}, p.label, p.unit && p.type === 'select' ? null : null),
      control,
      p.help ? h('div', { class: 'help' }, p.help) : null);
  }

  // ── Conduttore ────────────────────────────────────────────────────────────────────
  renderWire(el, id) {
    const app = this.app;
    const project = app.project;
    const w = project.wire(id);
    const ta = project.terminal(w.a);
    const tb = project.terminal(w.b);
    const ca = project.comp(w.a.c);
    const cb = project.comp(w.b.c);
    el.append(h('div', { class: 'insp-head' },
      h('div', { class: 'insp-thumb', style: { display: 'grid', placeItems: 'center' } }, h('div', { class: 'wire-dot', style: { width: '34px', height: '34px', background: colorById(w.color).hex } })),
      h('div', { class: 'insp-title' }, h('div', { class: 'kind' }, w.fixed ? 'Conduttore di terra (fisso)' : 'Conduttore'),
        h('h3', {}, `${ca?.tag}:${ta?.label} → ${cb?.tag}:${tb?.label}`))));
    if (!w.fixed) {
      const sw = h('div', { class: 'swatches' }, WIRE_COLORS.map((c) => h('button', {
        class: 'swatch' + (c.id === w.color ? ' active' : ''),
        title: `${c.label} — ${c.use}`,
        style: { background: c.stripe ? `linear-gradient(135deg, ${c.hex} 50%, ${c.stripe} 50%)` : c.hex },
        onclick: () => project.setWire(id, { color: c.id }),
      })));
      el.append(h('div', { class: 'field' }, h('label', {}, 'Colore', h('span', { class: 'unit' }, `· ${colorById(w.color).label}: ${colorById(w.color).use}`)), sw));
      el.append(h('div', { class: 'field' }, h('label', {}, 'Sezione'),
        h('select', { onchange: (e) => project.setWire(id, { section: +e.target.value }) },
          SECTIONS.map((s) => h('option', { value: s, selected: s === w.section }, `${fmt(s, 1)} mm² — portata ${fmt(iz(s, 2), 1)} A (monofase) · ${fmt(iz(s, 3), 1)} A (trifase)`)))));
      const auto = w.lengthMode !== 'manual';
      const L = project.electricalLength(w);
      el.append(h('div', { class: 'field' }, h('label', {}, 'Lunghezza elettrica'),
        h('div', { class: 'range-row' },
          h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: auto, onchange: (e) => project.setWire(id, e.target.checked ? { lengthMode: 'auto' } : { lengthMode: 'manual', length: Math.round(L * 10) / 10 }) }), h('span', {}, 'automatica')),
          auto ? h('output', {}, `${fmt(L, 1)} m`) : h('input', { type: 'number', min: 0.1, max: 300, step: 0.5, value: w.length, style: { width: '90px' }, onchange: (e) => project.setWire(id, { length: Math.max(0.1, +e.target.value) }) })),
        h('div', { class: 'help' }, 'In automatico: percorso nel quadro + distanza dell’utenza dal quadro (parametro dell’utenza).')));
      if (app.settings.teacher) {
        el.append(h('div', { class: 'field teacher' }, h('label', {}, 'Guasto sul conduttore'),
          h('select', { onchange: (e) => project.setWire(id, { fault: e.target.value === 'none' ? undefined : e.target.value }) },
            [['none', 'Nessun guasto'], ['open', 'Conduttore interrotto'], ['loose', 'Morsetto allentato (contatto incerto)']].map(([v, l]) => h('option', { value: v, selected: (w.fault || 'none') === v }, l)))));
      }
    }
    const ro = h('div', { class: 'readouts' });
    el.append(h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('activity', 13), 'Misure'), ro));
    this.live = { kind: 'wire', id, ro };
    this.fillReadouts();
    if (!w.fixed) el.append(h('div', { class: 'section btn-row' }, h('button', { class: 'btn danger', onclick: () => app.deleteSelection() }, icon('trash', 15), 'Rimuovi il conduttore')));
  }

  // ── Progetto ──────────────────────────────────────────────────────────────────────
  renderProject(el) {
    const app = this.app;
    const m = app.project.meta;
    const f = (key, label, ph, type = 'text') => h('div', { class: 'field' }, h('label', {}, label),
      type === 'textarea'
        ? h('textarea', { placeholder: ph, oninput: (e) => { m[key] = e.target.value; app.scheduleSave(); } }, m[key] || '')
        : h('input', { type, value: m[key] || '', placeholder: ph, onchange: (e) => app.project.setProjectMeta({ [key]: e.target.value }) }));
    const comps = app.project.components.filter((c) => !DEFS[c.type].fixed).length;
    el.append(
      h('div', { class: 'empty', style: { padding: '14px 8px 6px' } }, icon('pointer', 26), 'Seleziona un componente o un conduttore per vederne parametri e misure.'),
      h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('school', 13), 'Progetto'),
        f('title', 'Titolo', 'Impianto'),
        h('div', { class: 'grid2' }, f('author', 'Studente / gruppo', 'Nome e cognome'), f('classe', 'Classe', 'es. 4ª A')),
        h('div', { class: 'grid2' }, f('school', 'Istituto', 'Nome dell’istituto'), f('date', 'Data', '', 'date')),
        f('description', 'Descrizione e obiettivo dell’impianto', 'Che cosa alimenta l’impianto e con quali scelte progettuali…', 'textarea')),
      h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('book', 13), 'Giustificazione delle scelte'),
        h('p', { class: 'help', style: { marginTop: 0 } }, 'Le risposte compaiono nella presentazione e nella scheda tecnica (Fase 4).'),
        ...JUSTIFICATIONS.map((j) => {
          const js = (m.justifications = m.justifications || {});
          return h('div', { class: 'field' }, h('label', {}, j.label),
            h('textarea', { placeholder: j.q, rows: 2, oninput: (e) => { js[j.key] = e.target.value; app.scheduleSave(); } }, js[j.key] || ''));
        })),
      h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('box', 13), 'Riepilogo'),
        h('div', { class: 'readouts' },
          h('div', { class: 'ro' }, h('span', {}, 'Componenti'), h('b', {}, String(comps))),
          h('div', { class: 'ro' }, h('span', {}, 'Conduttori'), h('b', {}, String(app.project.wires.filter((w) => !w.fixed).length))))),
      h('div', { class: 'section btn-row' },
        h('button', { class: 'btn', onclick: () => app.modals.presets() }, icon('grid', 15), 'Modelli predefiniti'),
        h('button', { class: 'btn accent', onclick: () => app.report() }, icon('report', 15), 'Scheda tecnica')));
  }

  // ── Aggiornamenti dal vivo ────────────────────────────────────────────────────────
  tick() {
    if (!this.live || !this.el?.isConnected) return;
    this.fillReadouts();
    if (this.live.kind === 'comp') this.fillActions(true);
  }

  fillReadouts() {
    const L = this.live;
    const app = this.app;
    if (L.kind === 'comp') {
      const inst = app.sim.getInst(L.id);
      if (!inst) return;
      const rows = L.def.readouts ? L.def.readouts(inst, app.sim.ctxFor(inst)) : [];
      this.paintRows(L.ro, rows.length ? rows : [{ label: 'Stato', value: 'Nessuna misura disponibile' }]);
    } else if (L.kind === 'wire') {
      const w = app.project.wire(L.id);
      if (!w) return;
      const I = cabs(app.sim.wireCurrent(L.id));
      const Iz2 = iz(w.section, 2);
      const len = app.project.electricalLength(w);
      const R = (0.0214 * len) / w.section;
      this.paintRows(L.ro, [
        { label: 'Corrente', value: fmtA(I), level: I > Iz2 ? 'error' : undefined },
        { label: 'Portata Iz (B1, 2 cond.)', value: fmtA(Iz2) },
        { label: 'Utilizzo I/Iz', value: `${fmt((I / Iz2) * 100, 0)} %`, bar: Math.min(1, I / Iz2) },
        { label: 'Resistenza del conduttore', value: `${fmt(R * 1000, 1)} mΩ` },
        { label: 'Caduta di tensione sul tratto', value: fmtV(I * R) },
        { label: 'Lunghezza elettrica', value: `${fmt(len, 1)} m` },
      ]);
    }
  }

  paintRows(ro, rows) {
    const html = rows.map((r) => `<div class="ro ${r.level || ''}"><span>${r.label}</span><b>${r.value}</b>${r.bar !== undefined ? `<div class="bar"><i style="width:${Math.round(r.bar * 100)}%"></i></div>` : ''}</div>`).join('');
    if (ro._html !== html) {
      ro.innerHTML = html;
      ro._html = html;
    }
  }

  fillActions(onlyLabels = false) {
    const L = this.live;
    const app = this.app;
    const inst = app.sim.getInst(L.id);
    if (!inst) return;
    const keys = Object.keys(L.def.interact || {});
    const sig = keys.map((k) => ACTIONS[k]?.label(inst.state, L.def) || k).join('|');
    if (onlyLabels && L.acts._sig === sig) return;
    L.acts._sig = sig;
    clear(L.acts);
    for (const k of keys) {
      const a = ACTIONS[k];
      if (!a) continue;
      const b = h('button', { class: 'btn small' }, icon(a.icon, 14), a.label(inst.state, L.def));
      if (a.momentary) {
        b.addEventListener('pointerdown', () => app.interaction.doInteract(L.id, k, 'down'));
        const up = () => app.interaction.doInteract(L.id, k, 'up');
        b.addEventListener('pointerup', up);
        b.addEventListener('pointerleave', (e) => { if (e.buttons) up(); });
      } else b.addEventListener('click', () => app.interaction.doInteract(L.id, k, 'click'));
      L.acts.append(b);
    }
  }
}

function parse(p, v) {
  const o = p.options.find((x) => String(optValue(x)) === v);
  return o === undefined ? v : optValue(o);
}
