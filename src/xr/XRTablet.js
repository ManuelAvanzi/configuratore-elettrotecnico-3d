// Tablet virtuale sul controller sinistro: strumenti, libreria componenti, simulazione, proprietà della selezione.
import { CanvasPanel, UI } from './CanvasPanel.js';
import { DEFS, FAMILIES } from '../catalog/defs/index.js';
import { WIRE_COLORS, colorById, fmt, fmtA, fmtV, fmtW } from '../sim/norms.js';
import { summarize } from '../sim/checks.js';
import { optLabel, optValue } from '../ui/dom.js';
import { cabs } from '../sim/complex.js';

const TABS = [
  { id: 'tools', label: 'Strumenti', icon: 'wire' },
  { id: 'lib', label: 'Componenti', icon: 'box' },
  { id: 'sim', label: 'Simula', icon: 'power' },
  { id: 'sel', label: 'Selezione', icon: 'sliders' },
];
const FAM_SHORT = { protezione: 'Protezione', comando: 'Comando', segnalazione: 'Segnali', morsetti: 'Morsetti', utenze: 'Utenze', campo: 'Campo' };

export class XRTablet {
  constructor(app) {
    this.app = app;
    this.panel = new CanvasPanel({ px: [1024, 768], size: [0.3, 0.225] });
    this.mesh = this.panel.mesh;
    this.tab = 'tools';
    this.family = 'protezione';
    this.page = 0;
    this.paramPage = 0;
    this.msg = null;
    this.msgT = 0;
    this.images = new Map();
    this.t = 0;
    app.on('selection', () => {
      this.paramPage = 0;
      if (app.xrActive && app.selection) this.tab = 'sel';
      this.panel.dirty = true;
    });
    for (const ev of ['tool', 'project', 'measure', 'speed', 'wiremode', 'checks', 'tutorial']) app.on(ev, () => (this.panel.dirty = true));
  }

  img(type) {
    const src = this.app.library?.thumbs[type];
    if (!src) return null;
    let im = this.images.get(type);
    if (!im) {
      im = new Image();
      im.onload = () => (this.panel.dirty = true);
      im.src = src;
      this.images.set(type, im);
    }
    return im.complete ? im : null;
  }

  message(text, level = 'info') {
    this.msg = { text, level };
    this.msgT = 5;
    this.panel.dirty = true;
  }

  update(dt) {
    this.t += dt;
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) {
        this.msg = null;
        this.panel.dirty = true;
      }
    }
    const live = this.tab === 'sim' || this.tab === 'sel' || (this.tab === 'tools' && this.app.interaction.tool === 'measure');
    if (live && this.t > 0.5) {
      this.t = 0;
      this.panel.dirty = true;
    }
    if (this.panel.dirty) this.draw();
  }

  draw() {
    const p = this.panel;
    const app = this.app;
    if (app.tutorial) return this.drawTutorial();
    p.begin(UI.bg);
    // Intestazione
    p.rect(0, 0, 1024, 92, UI.panel, 34);
    p.rect(0, 60, 1024, 32, UI.panel, 0);
    p.rect(24, 22, 48, 48, UI.accent, 12);
    p.icon('zap', 34, 32, 28, '#fff');
    const toolName = { select: 'Seleziona', wire: 'Cabla', measure: 'Misura', place: 'Posiziona' }[app.interaction.tool];
    p.text('Laboratorio elettrotecnico', 88, 36, { size: 26, weight: 800, font: 'Manrope' });
    p.text(`Strumento: ${toolName}`, 88, 68, { size: 21, color: UI.muted });
    if (this.msg) {
      const col = this.msg.level === 'error' ? UI.error : this.msg.level === 'warn' ? UI.warn : this.msg.level === 'ok' ? UI.ok : UI.muted;
      p.text(this.msg.text, 1000, 50, { size: 20, color: col, align: 'right', maxW: 560 });
    } else {
      const sup = app.sim.powerState();
      p.rect(760, 30, 16, 16, sup.fault ? UI.error : sup.on ? UI.ok : UI.dim, 8);
      p.text(sup.label, 786, 39, { size: 20, color: UI.muted });
    }
    // Schede
    TABS.forEach((t, i) => p.button('tab-' + t.id, 20 + i * 248, 104, 236, 64, { label: t.label, icon: t.icon, active: this.tab === t.id, small: true, onClick: () => { this.tab = t.id; this.panel.dirty = true; } }));
    const y0 = 186;
    if (this.tab === 'tools') this.drawTools(y0);
    else if (this.tab === 'lib') this.drawLib(y0);
    else if (this.tab === 'sim') this.drawSim(y0);
    else this.drawSel(y0);
    p.end();
  }

  drawTools(y) {
    const p = this.panel;
    const app = this.app;
    const it = app.interaction;
    [['select', 'Seleziona', 'select'], ['wire', 'Cabla', 'wire'], ['measure', 'Misura', 'measure']].forEach(([id, label, ic], i) =>
      p.button('tool-' + id, 20 + i * 330, y, 318, 104, { label, icon: ic, active: it.tool === id, onClick: () => it.setTool(id) }));
    y += 124;
    if (it.tool === 'wire') {
      p.text('Colore', 24, y + 30, { size: 22, color: UI.muted });
      WIRE_COLORS.forEach((c, i) => {
        const x = 120 + i * 78;
        const act = !it.wireOpts.auto && it.wireOpts.color === c.id;
        p.button('col-' + c.id, x, y, 66, 60, { onClick: () => { it.wireOpts.color = c.id; it.wireOpts.auto = false; this.panel.dirty = true; } });
        p.rect(x + 8, y + 8, 50, 44, c.hex, 22);
        if (c.stripe) p.rect(x + 8, y + 8, 50, 14, c.stripe, 8);
        if (act) {
          p.g.strokeStyle = '#fff';
          p.g.lineWidth = 4;
          p.g.beginPath();
          p.g.roundRect(x + 4, y + 4, 58, 52, 24);
          p.g.stroke();
        }
      });
      p.button('auto', 680 + 20, y, 300, 60, { label: 'Automatico', icon: 'sparkles', active: it.wireOpts.auto, small: true, onClick: () => { it.wireOpts.auto = !it.wireOpts.auto; this.panel.dirty = true; } });
      y += 76;
      p.text('Sezione mm²', 24, y + 30, { size: 22, color: UI.muted });
      [1, 1.5, 2.5, 4, 6, 10].forEach((s, i) => p.button('sec-' + s, 160 + i * 138, y, 126, 60, { label: fmt(s, 1), active: !it.wireOpts.auto && it.wireOpts.section === s, small: true, onClick: () => { it.wireOpts.section = s; it.wireOpts.auto = false; this.panel.dirty = true; } }));
      y += 80;
      p.text(it.wireStart ? `Partenza: ${it.label(it.wireStart)} — punta il morsetto di arrivo` : 'Punta un morsetto e premi il grilletto per iniziare il cavo', 24, y + 20, { size: 22, color: UI.muted, maxW: 980 });
    } else if (it.tool === 'measure') {
      p.rect(20, y, 984, 150, '#b9c8a9', 18);
      let value = '— — —';
      let sub = 'Tocca due morsetti (puntale rosso e nero) o un cavo (pinza)';
      if (it.clamp) {
        const I = cabs(app.sim.wireCurrent(it.clamp));
        value = I < 1 ? `${fmt(I * 1000, 0)} mA` : `${fmt(I, 2)} A`;
        sub = 'Pinza amperometrica';
      } else if (it.probes.length === 2) {
        value = `${fmt(app.sim.measureV(it.probes[0].ref, it.probes[1].ref), 1)} V`;
        sub = `${it.label(it.probes[0])} — ${it.label(it.probes[1])}`;
      } else if (it.probes.length === 1) sub = `Rosso su ${it.label(it.probes[0])}: tocca il secondo morsetto`;
      p.text(value, 980, y + 70, { size: 84, color: '#1b2615', weight: 800, align: 'right', font: 'Courier New' });
      p.text(sub, 40, y + 128, { size: 22, color: '#2b3a22', maxW: 940 });
      y += 170;
    } else {
      p.text('Grilletto: seleziona, aziona leve e pulsanti, trascina i componenti.', 24, y + 16, { size: 23, color: UI.muted });
      p.text('Punta un morsetto per iniziare un collegamento.', 24, y + 50, { size: 23, color: UI.muted });
      y += 90;
    }
    y = Math.max(y, 560);
    p.button('undo', 20, y, 236, 70, { label: 'Annulla', icon: 'undo', small: true, onClick: () => app.undo() });
    p.button('redo', 268, y, 236, 70, { label: 'Ripeti', icon: 'redo', small: true, onClick: () => app.redo() });
    p.button('esc', 516, y, 236, 70, { label: 'Interrompi', icon: 'close', small: true, onClick: () => app.interaction.cancel() });
    p.button('del', 764, y, 240, 70, { label: 'Rimuovi', icon: 'trash', small: true, disabled: !app.selection, onClick: () => app.deleteSelection() });
    y += 86;
    ['panoramica', 'quadro', 'utenze', 'lim'].forEach((v, i) => p.button('view-' + v, 20 + i * 248, y, 236, 56, { label: { panoramica: 'Davanti al banco', quadro: 'Al quadro', utenze: 'Alle utenze', lim: 'Alla LIM' }[v], small: true, onClick: () => app.xr.teleportToView(v) }));
  }

  drawLib(y) {
    const p = this.panel;
    const app = this.app;
    FAMILIES.forEach((f, i) => p.button('fam-' + f.id, 20 + i * 166, y, 156, 56, { label: FAM_SHORT[f.id], active: this.family === f.id, small: true, onClick: () => { this.family = f.id; this.page = 0; this.panel.dirty = true; } }));
    y += 72;
    const defs = Object.values(DEFS).filter((d) => d.family === this.family && !d.fixed);
    const per = 8;
    const pages = Math.max(1, Math.ceil(defs.length / per));
    this.page = Math.min(this.page, pages - 1);
    defs.slice(this.page * per, this.page * per + per).forEach((d, i) => {
      const x = 20 + (i % 4) * 248;
      const yy = y + Math.floor(i / 4) * 222;
      const armed = app.interaction.tool === 'place' && app.interaction.placeType === d.type;
      p.button('lib-' + d.type, x, yy, 236, 210, { active: armed, onClick: () => { app.interaction.setTool('place', { type: d.type, params: {} }); this.message(`${d.short}: punta ${d.mount === 'din' ? 'una guida del quadro' : 'il pannello utenze'} e premi il grilletto`); } });
      const im = this.img(d.type);
      if (im) p.g.drawImage(im, x + 18, yy + 8, 200, 150);
      else p.icon('box', x + 88, yy + 50, 60, UI.dim);
      p.text(d.short, x + 118, yy + 180, { size: 21, weight: 700, align: 'center', font: 'Manrope', maxW: 224, color: armed ? '#fff' : UI.text });
    });
    if (pages > 1) {
      p.button('pg-prev', 20, 700, 120, 56, { icon: 'left', disabled: this.page === 0, onClick: () => { this.page--; this.panel.dirty = true; } });
      p.text(`${this.page + 1} / ${pages}`, 512, 728, { size: 22, color: UI.muted, align: 'center' });
      p.button('pg-next', 884, 700, 120, 56, { icon: 'right', disabled: this.page >= pages - 1, onClick: () => { this.page++; this.panel.dirty = true; } });
    }
  }

  drawSim(y) {
    const p = this.panel;
    const app = this.app;
    const s = app.sim.powerState();
    const on = s.on;
    p.button('power', 20, y, 480, 120, { label: s.action, icon: 'power', active: on, color: s.fault ? UI.error : UI.ok, onClick: () => app.togglePower() });
    p.button('reset', 520, y, 484, 120, { label: 'Riarma protezioni', icon: 'reset', onClick: () => app.resetAll() });
    y += 140;
    const vln = s.V;
    [['Tensione', fmtV(vln)], ['Corrente', fmtA(Math.max(...s.I))], ['Potenza', fmtW(s.P)], ['Energia', `${fmt(s.kWh, 3)} kWh`]].forEach(([l, v], i) => {
      const x = 20 + i * 248;
      p.rect(x, y, 236, 104, UI.panel, 14);
      p.text(l.toUpperCase(), x + 18, y + 28, { size: 18, color: UI.dim, weight: 800, font: 'Manrope' });
      p.text(v, x + 18, y + 72, { size: 32, weight: 700 });
    });
    y += 122;
    p.text('Velocità', 24, y + 30, { size: 22, color: UI.muted });
    [1, 5, 20].forEach((k, i) => p.button('spd-' + k, 170 + i * 120, y, 108, 60, { label: `×${k}`, small: true, active: app.simSpeed === k, onClick: () => app.setSpeed(k) }));
    p.text('Cavi', 560, y + 30, { size: 22, color: UI.muted });
    [['normal', 'Cavi'], ['flow', 'Corrente'], ['heat', 'Carico']].forEach(([m, l], i) => p.button('wm-' + m, 630 + i * 126, y, 118, 60, { label: l, small: true, active: app.settings.wireMode === m, onClick: () => app.setWireMode(m) }));
    y += 78;
    p.text('Luce esterna', 24, y + 30, { size: 22, color: UI.muted });
    p.button('lux-', 200, y, 80, 60, { icon: 'minus', onClick: () => app.setLux(Math.max(0, app.sim.env.lux / 3)) });
    p.text(`${fmt(app.sim.env.lux, 0)} lx`, 360, y + 32, { size: 26, align: 'center' });
    p.button('lux+', 440, y, 80, 60, { icon: 'plus', onClick: () => app.setLux(Math.min(1000, Math.max(1, app.sim.env.lux * 3))) });
    const sm = summarize(app.checksPanel.results);
    p.rect(560, y - 4, 444, 68, UI.panel, 14);
    p.text('Verifiche', 580, y + 30, { size: 22, color: UI.muted });
    p.text(`${sm.error} errori · ${sm.warn} avvisi · ${sm.ok} ok`, 700, y + 30, { size: 22, color: sm.error ? UI.error : sm.warn ? UI.warn : UI.ok, maxW: 290 });
    y += 84;
    const ev = app.sim.events[app.sim.events.length - 1];
    if (ev) p.text(ev.text, 24, y + 20, { size: 21, color: ev.level === 'error' ? UI.error : ev.level === 'warn' ? UI.warn : UI.muted, maxW: 980 });
  }

  drawSel(y) {
    const p = this.panel;
    const app = this.app;
    const sel = app.selection;
    const project = app.project;
    if (sel?.comp && project.comp(sel.comp)) {
      const c = project.comp(sel.comp);
      const def = DEFS[c.type];
      const prm = project.params(c.id);
      const im = this.img(c.type);
      if (im) p.g.drawImage(im, 20, y - 6, 120, 90);
      p.text(`${c.tag} · ${def.short}`, 156, y + 24, { size: 30, weight: 800, font: 'Manrope', maxW: 700 });
      p.text(def.name, 156, y + 60, { size: 20, color: UI.muted, maxW: 700 });
      if (!def.fixed) p.button('sel-del', 884, y, 120, 70, { icon: 'trash', onClick: () => app.deleteSelection() });
      y += 96;
      const ps = (def.params || []).filter((x) => !x.teacher || app.settings.teacher);
      const per = 4;
      const pages = Math.ceil(ps.length / per);
      ps.slice(this.paramPage * per, this.paramPage * per + per).forEach((q, i) => {
        const yy = y + i * 70;
        const v = prm[q.key];
        let text = String(v);
        if (q.type === 'select') {
          const o = q.options.find((o2) => optValue(o2) === v);
          text = o ? optLabel(o).split(' — ')[0] + (q.unit && typeof o !== 'object' ? ' ' + q.unit : '') : text;
        } else if (q.type === 'number') text = `${fmt(v, q.step < 1 ? 1 : 0)} ${q.unit || ''}`;
        else if (q.type === 'bool') text = v ? 'Sì' : 'No';
        p.rect(20, yy, 984, 60, UI.panel, 12);
        p.text(q.label, 36, yy + 31, { size: 21, color: UI.muted, maxW: 430 });
        p.text(text, 700, yy + 31, { size: 23, weight: 700, align: 'center', maxW: 330 });
        p.button(`pm-${q.key}`, 480, yy + 4, 66, 52, { icon: 'left', onClick: () => this.cycle(c.id, q, -1) });
        p.button(`pp-${q.key}`, 930, yy + 4, 66, 52, { icon: 'right', onClick: () => this.cycle(c.id, q, 1) });
      });
      if (pages > 1) p.button('pp-next', 884, y + per * 70, 120, 40, { label: `${this.paramPage + 1}/${pages}`, small: true, onClick: () => { this.paramPage = (this.paramPage + 1) % pages; this.panel.dirty = true; } });
      y += per * 70 + 50;
      const inst = app.sim.getInst(c.id);
      const acts = Object.keys(def.interact || {}).filter((k) => !['replaceCoil', 'resetEnergy'].includes(k)).slice(0, 4);
      const lab = { toggle: 'Aziona', test: 'Prova T', reset: 'Ripristina', trip: 'Prova', replace: 'Sostituisci', trigger: 'Presenza', power: 'Alimenta', press: 'Premi', start: 'MARCIA', stop: 'ARRESTO' };
      acts.forEach((k, i) => {
        const mom = ['test', 'press', 'start', 'stop'].includes(k);
        p.button('act-' + k, 20 + i * 250, y, 238, 64, {
          label: lab[k] || k,
          small: true,
          onClick: mom ? null : () => app.interaction.doInteract(c.id, k, 'click'),
          onDown: mom ? () => app.interaction.doInteract(c.id, k, 'down') : null,
          onUp: mom ? () => app.interaction.doInteract(c.id, k, 'up') : null,
        });
      });
      y += 78;
      const rows = inst && def.readouts ? def.readouts(inst, app.sim.ctxFor(inst)).slice(0, 2) : [];
      rows.forEach((r, i) => p.text(`${r.label}: ${r.value}`, 24, y + 16 + i * 34, { size: 21, color: r.level === 'error' ? UI.error : r.level === 'warn' ? UI.warn : UI.muted, maxW: 980 }));
    } else if (sel?.wire && project.wire(sel.wire)) {
      const w = project.wire(sel.wire);
      p.text(`Conduttore ${project.comp(w.a.c)?.tag}:${project.terminal(w.a)?.label} → ${project.comp(w.b.c)?.tag}:${project.terminal(w.b)?.label}`, 24, y + 24, { size: 28, weight: 800, font: 'Manrope', maxW: 840 });
      if (!w.fixed) p.button('w-del', 884, y, 120, 64, { icon: 'trash', onClick: () => app.deleteSelection() });
      y += 90;
      if (!w.fixed) {
        WIRE_COLORS.forEach((c, i) => {
          const x = 20 + i * 90;
          p.button('wc-' + c.id, x, y, 80, 70, { active: w.color === c.id, onClick: () => project.setWire(w.id, { color: c.id }) });
          p.rect(x + 12, y + 12, 56, 46, c.hex, 22);
        });
        y += 90;
        [1, 1.5, 2.5, 4, 6, 10].forEach((s, i) => p.button('ws-' + s, 20 + i * 164, y, 152, 64, { label: `${fmt(s, 1)} mm²`, small: true, active: w.section === s, onClick: () => project.setWire(w.id, { section: s }) }));
        y += 84;
      }
      const I = cabs(app.sim.wireCurrent(w.id));
      p.text(`${colorById(w.color).label} · ${fmt(w.section, 1)} mm² · ${fmt(project.electricalLength(w), 1)} m · corrente ${fmtA(I)}`, 24, y + 20, { size: 23, color: UI.muted, maxW: 980 });
    } else {
      p.icon('pointer', 470, y + 120, 84, UI.dim);
      p.text('Punta un componente o un cavo', 512, y + 260, { size: 30, weight: 700, align: 'center', font: 'Manrope' });
      p.text('e premi il grilletto per selezionarlo.', 512, y + 304, { size: 24, color: UI.muted, align: 'center' });
    }
  }

  /** Tablet in modalità tutorial: il passo corrente e i comandi Indietro / Mostrami come / Avanti */
  drawTutorial() {
    const p = this.panel;
    const app = this.app;
    const t = app.tutorial;
    p.begin(UI.bg);
    p.rect(0, 0, 1024, 92, UI.panel, 34);
    p.rect(0, 60, 1024, 32, UI.panel, 0);
    p.rect(24, 22, 48, 48, UI.accent, 12);
    p.icon('school', 34, 32, 28, '#fff');
    p.text('Tutorial guidato', 88, 36, { size: 26, weight: 800, font: 'Manrope' });
    if (this.msg) p.text(this.msg.text, 1000, 50, { size: 20, color: this.msg.level === 'ok' ? UI.ok : UI.muted, align: 'right', maxW: 560 });
    if (!t.lesson) {
      p.text('Scegli una lezione', 88, 68, { size: 21, color: UI.muted });
      t.lessons.forEach((l, i) => {
        const y = 116 + i * 124;
        p.button('les-' + l.id, 20, y, 984, 110, { onClick: () => t.start(l.id) });
        p.rect(40, y + 22, 66, 66, l.color, 14);
        p.text(String(l.n), 73, y + 56, { size: 34, weight: 800, align: 'center', font: 'Manrope', color: '#fff' });
        p.text(l.title, 130, y + 40, { size: 30, weight: 800, font: 'Manrope', maxW: 700 });
        p.text(l.subtitle, 130, y + 78, { size: 21, color: UI.muted, maxW: 720 });
        if (t.isCompleted(l.id)) p.icon('ok', 940, y + 36, 40, UI.ok);
      });
      p.end();
      return;
    }
    const s = t.step;
    p.text(`Lezione ${t.lesson.n} · ${t.lesson.title}`, 88, 68, { size: 20, color: UI.muted, maxW: 620 });
    p.text(`${t.i + 1} / ${t.total}`, 1000, 36, { size: 22, color: UI.muted, align: 'right' });
    p.rect(20, 104, 984, 10, UI.panel2, 5);
    p.rect(20, 104, (984 * (t.i + 1)) / t.total, 10, UI.accent, 5);
    let y = 150;
    p.text(s.title, 24, y + 10, { size: 36, weight: 800, font: 'Manrope', maxW: 976 });
    y = p.wrap(s.text || '', 24, y + 64, 976, 34, s.type === 'quiz' ? 2 : 5, { size: 25, color: '#dfe6ed' });
    y += 6;
    if (s.type === 'quiz') {
      s.options.forEach((o, k) => {
        const picked = t.quiz.picked === k;
        const col = picked ? (o.correct ? UI.ok : UI.error) : t.quiz.solved && o.correct ? UI.ok : null;
        p.button('q-' + k, 20, y, 984, 66, { active: !!col, color: col || undefined, onClick: () => t.answer(k) });
        p.text(`${String.fromCharCode(65 + k)}.  ${o.text}`, 40, y + 34, { size: 22, weight: 600, maxW: 940, color: col ? '#fff' : UI.text });
        y += 76;
      });
      if (t.quiz.picked !== null && t.quiz.picked !== undefined) p.wrap(s.options[t.quiz.picked].feedback, 24, y + 14, 976, 30, 2, { size: 21, color: s.options[t.quiz.picked].correct ? UI.ok : UI.warn });
    } else if (!t.done && s.todo) {
      p.rect(20, y, 984, 96, '#2a1a10', 16);
      p.icon('pointer', 40, y + 30, 36, UI.accent);
      p.wrap(s.todo, 96, y + 32, 890, 30, 2, { size: 22, color: '#ffd9bf', weight: 600 });
      y += 110;
      (s.buttons || []).slice(0, 2).forEach((b, k) => p.button('sb-' + k, 20 + k * 496, y, 484, 64, { label: b.label, icon: b.icon || 'play', small: true, onClick: () => t.runButton(b) }));
    } else if (t.done && s.type !== 'info' && s.type !== 'end') {
      p.rect(20, y, 984, 70, '#123524', 16);
      p.icon('ok', 40, y + 17, 36, UI.ok);
      p.text('Fatto! Si passa al prossimo passo.', 96, y + 36, { size: 24, weight: 700, color: '#b9f0d2' });
    }
    if (s.type === 'end') {
      const next = t.nextLesson();
      p.button('end-list', 20, 602, 484, 70, { label: 'Tutte le lezioni', icon: 'grid', small: true, onClick: () => t.stop() });
      if (next) p.button('end-next', 520, 602, 484, 70, { label: `Lezione ${next.n}`, icon: 'next', active: true, small: true, onClick: () => t.start(next.id) });
    }
    const canShow = !t.done && s.type !== 'info' && s.type !== 'end';
    p.button('t-prev', 20, 686, 300, 64, { label: 'Indietro', icon: 'left', small: true, disabled: t.i === 0, onClick: () => t.prev() });
    if (canShow) p.button('t-show', 336, 686, 352, 64, { label: 'Mostrami come', icon: 'eye', small: true, onClick: () => t.showMe() });
    if (s.type !== 'end') p.button('t-next', 704, 686, 300, 64, { label: 'Avanti', icon: 'right', small: true, active: t.done, disabled: !t.done, onClick: () => t.next() });
    p.end();
  }

  cycle(id, q, dir) {
    const app = this.app;
    const cur = app.project.params(id)[q.key];
    let v;
    if (q.type === 'select') {
      const vals = q.options.map(optValue);
      const i = vals.findIndex((x) => x === cur);
      v = vals[(i + dir + vals.length) % vals.length];
    } else if (q.type === 'number') v = Math.max(q.min, Math.min(q.max, +(cur + dir * q.step * (q.max - q.min > 50 ? 5 : 1)).toFixed(3)));
    else if (q.type === 'bool') v = !cur;
    else return;
    const r = app.project.setParam(id, q.key, v);
    if (r?.error) this.message(r.error, 'warn');
  }
}
