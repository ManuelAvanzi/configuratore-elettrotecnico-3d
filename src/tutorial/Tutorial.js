// Controllore del tutorial guidato: carica la lezione, inquadra ciò di cui si parla, evidenzia il punto
// su cui agire, lascia cliccare solo quello, riconosce quando il passo è fatto e passa al successivo.
import * as THREE from 'three';
import { LESSONS, lessonById, makeContext, stepDone } from './lessons.js';
import { Markers, MARK } from './Markers.js';
import { loadJSON, saveJSON, STORE_KEY } from '../app/App.js';

const PROGRESS_KEY = 'configuratore-elettrotecnico:tutorial';
const AUTO_ADVANCE = ['wire', 'action', 'measure', 'clamp'];

export class Tutorial {
  constructor(app) {
    this.app = app;
    app.tutorial = this;
    this.lessons = LESSONS;
    this.markers = new Markers(app);
    this.lesson = null;
    this.i = 0;
    this.done = false;
    this.quiz = { solved: false, picked: null };
    this.memo = {};
    this.progress = loadJSON(PROGRESS_KEY) || { completed: [] };
    app.interaction.guard = {
      allow: (hit, phase) => this.allowHit(hit, phase),
      intercept: (p, hit) => this.intercept(p, hit),
      onBlocked: (hit) => this.onBlocked(hit),
    };
    app.on('frame', ({ dt }) => this.update(dt));
    app.on('project', () => {
      this.markersDirty = true;
    });
  }

  get step() {
    return this.lesson ? this.lesson.steps[this.i] : null;
  }

  get total() {
    return this.lesson ? this.lesson.steps.length : 0;
  }

  ctx() {
    if (!this._ctx) this._ctx = makeContext({ project: this.app.project, sim: this.app.sim, app: this.app, memo: this.memo });
    return this._ctx;
  }

  isCompleted(id) {
    return this.progress.completed.includes(id);
  }

  // ── Lezione ───────────────────────────────────────────────────────────────────────
  start(id) {
    const lesson = lessonById(id);
    if (!lesson) return;
    clearTimeout(this.autoT);
    if (this.lesson) this.lesson.exit?.(this.ctx());
    this.lesson = lesson;
    this.i = 0;
    this.memo = {};
    this._ctx = null;
    this.app.loadProject(lesson.start());
    this.app.interaction.setTool('select');
    this.app.emit('tutorial', { type: 'start' });
    this.enterStep();
  }

  stop() {
    clearTimeout(this.autoT);
    if (this.lesson) this.lesson.exit?.(this.ctx());
    this.lesson = null;
    this.markers.clear();
    this.app.view.flag([], []);
    this.app.interaction.setTool('select');
    this.app.emit('tutorial', { type: 'stop' });
  }

  nextLesson() {
    const k = LESSONS.indexOf(this.lesson);
    return k >= 0 && k < LESSONS.length - 1 ? LESSONS[k + 1] : null;
  }

  enterStep() {
    const s = this.step;
    const c = this.ctx();
    clearTimeout(this.autoT);
    this.quiz = { solved: false, picked: null };
    const it = this.app.interaction;
    if (it.wireStart) it.cancel();
    if (s.type === 'measure' || s.type === 'clamp') {
      it.setTool('measure');
      it.clearProbes();
    }
    s.enter?.(c);
    this.done = stepDone(s, c, this.quiz);
    this.lastWS = undefined;
    if (s.type === 'end' && !this.isCompleted(this.lesson.id)) {
      this.progress.completed.push(this.lesson.id);
      saveJSON(PROGRESS_KEY, this.progress);
    }
    this.frameCamera();
    this.refreshMarkers();
    this.app.emit('tutorial', { type: 'step' });
  }

  next() {
    if (!this.lesson || !this.done) return;
    if (this.i < this.total - 1) {
      this.i++;
      this.enterStep();
    }
  }

  keyNext() {
    if (this.done) this.next();
  }

  prev() {
    if (!this.lesson || this.i === 0) return;
    this.i--;
    this.enterStep();
  }

  restart() {
    if (this.lesson) this.start(this.lesson.id);
  }

  /** “Mostrami come”: esegue il passo al posto dello studente */
  showMe() {
    const s = this.step;
    if (!s || this.done) return;
    const c = this.ctx();
    const it = this.app.interaction;
    const v = this.app.view;
    switch (s.type) {
      case 'wire':
        if (it.wireStart) it.cancel();
        if (!c.hasWire(s.from, s.to)) {
          c.addWire(s.from, s.to);
          this.app.sfx('wire');
        }
        break;
      case 'measure': {
        it.setTool('measure');
        it.clearProbes();
        const a = v.terminal(c.ref(s.from));
        const b = v.terminal(c.ref(s.to));
        if (a) it.addProbe(a);
        if (b) it.addProbe(b);
        break;
      }
      case 'clamp': {
        it.setTool('measure');
        const w = c.wireBetween(s.from, s.to);
        if (w) {
          it.probes = [];
          it.clamp = w.id;
          this.app.emit('measure');
        }
        break;
      }
      case 'quiz':
        this.answer(s.options.findIndex((o) => o.correct));
        break;
      default:
        s.perform?.(c);
    }
  }

  answer(k) {
    const s = this.step;
    if (!s || s.type !== 'quiz' || this.quiz.solved) return;
    const o = s.options[k];
    this.quiz.picked = k;
    if (o?.correct) this.quiz.solved = true;
    else this.app.sfx('error');
    this.app.emit('tutorial', { type: 'quiz' });
  }

  runButton(b) {
    b.run(this.ctx());
    this.app.emit('tutorial', { type: 'button' });
  }

  /** Porta l'impianto della lezione nel laboratorio completo */
  openInLab() {
    saveJSON(STORE_KEY, this.app.project.toJSON());
    location.href = './laboratorio.html';
  }

  // ── Aggiornamento ─────────────────────────────────────────────────────────────────
  update(dt) {
    this.markers.update(dt);
    const s = this.step;
    if (!s) return;
    if (this.markersDirty) {
      this.markersDirty = false;
      this.refreshMarkers();
    }
    if (s.type === 'wire' || s.type === 'measure') {
      const it = this.app.interaction;
      const key = s.type === 'wire' ? it.wireStart?.key || null : it.probes.map((p) => p.key).join('|');
      if (key !== this.lastWS) {
        this.lastWS = key;
        this.refreshMarkers();
      }
    }
    if (!this.done && stepDone(s, this.ctx(), this.quiz)) this.complete();
  }

  complete() {
    this.done = true;
    this.app.sfx('ok');
    this.refreshMarkers();
    this.app.emit('tutorial', { type: 'done' });
    const s = this.step;
    if (AUTO_ADVANCE.includes(s.type)) {
      const idx = this.i;
      this.autoT = setTimeout(() => {
        if (this.i === idx && this.done && this.lesson) this.next();
      }, 1700);
    }
  }

  // ── Telecamera ────────────────────────────────────────────────────────────────────
  frameCamera() {
    const s = this.step;
    const app = this.app;
    if (!s || app.xrActive) return;
    const items = ['wire', 'measure', 'clamp'].includes(s.type) ? [s.from, s.to] : s.focus || [];
    if (s.view === 'panoramica' || !items.length) {
      if (s.view) app.goView(s.view);
      return;
    }
    const box = this.boxOf(items);
    if (box.isEmpty()) return;
    app.frameBox(box, { minDist: 0.5 * app.world.scale, margin: 1.5 });
  }

  boxOf(items) {
    const app = this.app;
    const c = this.ctx();
    const box = new THREE.Box3();
    const add = (obj) => {
      if (!obj) return;
      obj.updateMatrixWorld(true);
      box.union(new THREE.Box3().setFromObject(obj));
    };
    for (const it of items) {
      if (it === 'meter') add(app.world.meter);
      else if (it === 'cabinet') add(app.world.cabinet);
      else if (it === 'fieldboard') add(app.world.fieldBoard);
      else if (it.includes(':')) {
        const t = app.view.terminal(c.ref(it));
        if (t) {
          box.expandByPoint(t.world);
          const rec = app.view.models.get(t.compId);
          if (rec) add(rec.model.group);
        }
      } else add(app.view.models.get(c.idOf(it))?.model.group);
    }
    return box;
  }

  // ── Indicatori ────────────────────────────────────────────────────────────────────
  toLocal(obj) {
    obj.updateMatrixWorld(true);
    const p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    return this.app.world.wallRoot.worldToLocal(p);
  }

  refreshMarkers() {
    const m = this.markers;
    const app = this.app;
    const v = app.view;
    m.clear();
    v.flag([], []);
    const s = this.step;
    if (!s) return;
    // i passi di spiegazione mostrano sempre i riquadri; quelli operativi solo finché non sono fatti
    const explain = s.type === 'info' || s.type === 'quiz' || s.type === 'end';
    if (this.done && !explain) return;
    const c = this.ctx();
    if (s.type === 'wire' || s.type === 'measure') {
      const a = v.terminal(c.ref(s.from));
      const b = v.terminal(c.ref(s.to));
      const meas = s.type === 'measure';
      if (a) m.terminal(a, { color: meas ? 0xff3b30 : MARK.start, label: '1' });
      if (b) m.terminal(b, { color: meas ? 0x3a3f46 : MARK.end, label: '2' });
      let next = a;
      if (meas) next = app.interaction.probes.length === 1 ? b : a;
      else {
        const ws = app.interaction.wireStart;
        if (ws && a && ws.key === a.key) next = b;
        else if (ws && b && ws.key === b.key) next = a;
      }
      m.pointAt(next?.screw);
    } else if (s.type === 'clamp') {
      const w = c.wireBetween(s.from, s.to);
      if (w) v.flag([], [w.id]);
    } else if (s.type === 'action') {
      const tg = s.target || {};
      if (tg.power) {
        m.box(app.world.meter, { color: MARK.target });
        m.pointAt(this.toLocal(app.world.meterLever));
      } else if (tg.tag) {
        const rec = v.models.get(c.idOf(tg.tag));
        if (rec) {
          m.box(rec.model.group, { color: MARK.target });
          const part = rec.model.interactive.find((o) => o.userData.action === tg.action);
          m.pointAt(part ? this.toLocal(part) : this.toLocal(rec.model.group));
        }
      }
    }
    for (const f of s.focus || []) {
      if (s.type === 'action' && (f === s.target?.tag || (f === 'meter' && s.target?.power))) continue;
      if (f === 'meter') m.box(app.world.meter);
      else if (f === 'cabinet') m.box(app.world.cabinet, { pad: 0.02 });
      else if (f === 'fieldboard') m.box(app.world.fieldBoard, { pad: 0.02 });
      else {
        const rec = v.models.get(c.idOf(f));
        if (rec) m.box(rec.model.group);
      }
    }
    if (s.wires) v.flag([], s.wires.map(([x, y]) => c.wireBetween(x, y)?.id).filter(Boolean));
  }

  // ── Filtro dei clic ───────────────────────────────────────────────────────────────
  allowHit(hit, phase) {
    const s = this.step;
    if (!s) return false;
    if (this.done) return phase === 'hover' && hit.kind !== 'terminal';
    const c = this.ctx();
    const isRef = (term, r) => term.ref.c === r.c && term.ref.t === r.t;
    switch (s.type) {
      case 'wire':
      case 'measure':
        return hit.kind === 'terminal' && (isRef(hit.term, c.ref(s.from)) || isRef(hit.term, c.ref(s.to)));
      case 'clamp': {
        const w = c.wireBetween(s.from, s.to);
        return hit.kind === 'wire' && !!w && hit.wireId === w.id;
      }
      case 'action': {
        const tg = s.target || {};
        if (tg.power) return hit.kind === 'part' && hit.compId === 'XA' && hit.action === 'power';
        if (!tg.tag) return false;
        if (hit.compId !== c.idOf(tg.tag)) return false;
        if (hit.kind === 'part') return !tg.action || hit.action === tg.action;
        return hit.kind === 'device' && !tg.hold;
      }
      default:
        // spiegazioni e domande: solo i suggerimenti al passaggio del mouse sui componenti
        return phase === 'hover' && hit.kind !== 'terminal' && hit.kind !== 'wire';
    }
  }

  /** Clic sul corpo del componente bersaglio: esegue l'azione anche se la leva è piccola */
  intercept(p, hit) {
    const s = this.step;
    if (!s || s.type !== 'action' || this.done || hit.kind !== 'device') return false;
    const tg = s.target || {};
    const c = this.ctx();
    if (!tg.tag || hit.compId !== c.idOf(tg.tag)) return false;
    if (tg.momentary) c.press(tg.tag, tg.action);
    else c.act(tg.tag, tg.action);
    return true;
  }

  onBlocked(hit) {
    const s = this.step;
    if (!s) return;
    const p = this.app.project;
    let msg = 'Segui l’indicazione nel riquadro: il punto giusto è evidenziato.';
    if (this.done) msg = 'Passo completato: premi Avanti per continuare.';
    else if (s.type === 'info' || s.type === 'end') msg = 'Leggi la spiegazione e premi Avanti quando sei pronto.';
    else if (s.type === 'quiz') msg = 'Scegli una risposta nel riquadro a sinistra.';
    else if (s.type === 'wire' || s.type === 'measure') {
      if (hit.kind === 'terminal') {
        const comp = p.comp(hit.term.compId);
        msg = `Questo è il morsetto ${hit.term.def.label} di ${comp?.tag}. Cerca i cerchi colorati che lampeggiano (1 e 2).`;
      } else msg = 'Clicca proprio sul morsetto: la vite dentro il cerchio colorato.';
    } else if (s.type === 'clamp') msg = 'Clicca sul cavo evidenziato in arancione.';
    else if (s.type === 'action' && s.target?.hold) msg = 'Clicca e tieni premuto proprio il pulsante verde.';
    this.app.toast(msg, 'info', 3800);
  }

  // ── Stato per il tablet VR e la LIM ───────────────────────────────────────────────
  snapshot() {
    const s = this.step;
    if (!s) return null;
    return {
      lesson: this.lesson,
      index: this.i,
      total: this.total,
      step: s,
      done: this.done,
      quiz: this.quiz,
    };
  }
}
