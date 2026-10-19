// Applicazione: collega scena 3D, progetto, simulatore, interazione e interfaccia.
// Due modalità: 'lab' (configuratore completo) e 'tutorial' (percorso guidato con interfaccia essenziale).
import * as THREE from 'three';
import { Emitter } from '../core/events.js';
import { Stage } from '../scene/Stage.js';
import { World } from '../scene/World.js';
import { ProjectView } from '../scene/ProjectView.js';
import { renderThumbnails } from '../scene/Thumbs.js';
import { Project, blankProject } from '../core/project.js';
import { Simulator } from '../sim/engine.js';
import { DEFS } from '../catalog/defs/index.js';
import { PRESETS } from '../presets/index.js';
import { exerciseById } from '../exercises/index.js';
import { Picker } from '../interaction/Picker.js';
import { Interaction } from '../interaction/Interaction.js';
import { DesktopInput } from '../interaction/DesktopInput.js';
import { TopBar } from '../ui/TopBar.js';
import { Library } from '../ui/Library.js';
import { RightPanel, Inspector } from '../ui/Inspector.js';
import { ChecksPanel } from '../ui/ChecksPanel.js';
import { GuidePanel } from '../ui/GuidePanel.js';
import { Overlays } from '../ui/Overlays.js';
import { Modals } from '../ui/Modals.js';
import { LimBoard } from '../ui/LimBoard.js';
import { Presenter } from '../ui/Presenter.js';
import { openReport } from '../report/Report.js';
import { XRManager } from '../xr/XRManager.js';
import { Sfx } from './Sfx.js';

export const STORE_KEY = 'configuratore-elettrotecnico:progetto';
const SETTINGS_KEY = 'configuratore-elettrotecnico:impostazioni';

export function loadJSON(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
export function saveJSON(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* archiviazione non disponibile: si continua senza */
  }
}

export class App extends Emitter {
  constructor(root, { mode = 'lab' } = {}) {
    super();
    this.root = root;
    this.mode = mode;
    this.simSpeed = 1;
    this.simAcc = 0;
    this.selection = null;
    this.flags = { limiter: false, rcdTrip: false };
    this.settings = {
      scale: 1.25,
      teacher: false,
      shadows: true,
      sound: true,
      trunkCover: true,
      wireMode: 'normal',
      ...(loadJSON(SETTINGS_KEY) || {}),
    };
    this.settings.wireMode = 'normal';
    this.xrActive = false;
  }

  get isLab() {
    return this.mode === 'lab';
  }

  async start({ project } = {}) {
    await document.fonts.ready;
    this.stage = new Stage(document.getElementById('stage'));
    this.world = new World(this.stage.scene);
    this.world.setScale(this.settings.scale);
    this.sfxEngine = new Sfx();
    this.sfxEngine.enabled = this.settings.sound;

    let initial = project;
    let saved = null;
    let preset = null;
    if (!initial && this.isLab) {
      saved = loadJSON(STORE_KEY);
      const params = new URLSearchParams(location.search);
      preset = PRESETS.find((p) => p.id === params.get('modello'));
      initial = preset ? preset.make() : saved || PRESETS.find((p) => p.id === 'appartamento').make();
    }
    this.project = new Project(initial || blankProject());
    this.sim = new Simulator(DEFS);
    this.sim.env.lux = 400;
    this.view = new ProjectView({ world: this.world, project: this.project, sim: this.sim });
    this.picker = new Picker({ view: this.view, world: this.world, camera: this.stage.camera });
    this.interaction = new Interaction(this);
    this.modals = new Modals(this);

    if (this.isLab) {
      this.topbar = new TopBar(this, document.getElementById('topbar'));
      this.library = new Library(this, document.getElementById('left'));
      this.right = new RightPanel(this, document.getElementById('right'));
      this.inspector = new Inspector(this);
      this.checksPanel = new ChecksPanel(this);
      this.guide = new GuidePanel(this);
      this.right.register('props', 'Proprietà', 'sliders', this.inspector);
      this.right.register('checks', 'Verifiche', 'checks', this.checksPanel);
      this.right.register('guide', 'Esercitazioni', 'school', this.guide);
      this.overlays = new Overlays(this, document.getElementById('overlay'));
      this.presenter = new Presenter(this);
    } else {
      this.overlays = new Overlays(this, document.getElementById('overlay'), { minimal: true });
    }
    this.input = new DesktopInput(this);
    this.lim = new LimBoard(this);
    this.xr = new XRManager(this);

    this.project.on('change', (d) => this.onProjectChange(d));
    this.sim.on((e) => this.onSimEvent(e));
    this.onProjectChange({ type: 'load' });
    this.applySettings();
    this.right?.show(this.project.meta.exercise?.id ? 'guide' : 'props');
    this.goView('panoramica', 0);
    this.stage.onFrame((dt, t) => this.frame(dt, t / 1000));

    // copertine 3D dei componenti (dopo il primo fotogramma)
    if (this.isLab) {
      setTimeout(() => {
        try {
          this.library.setThumbs(renderThumbnails(Object.values(DEFS)));
          this.right.refresh();
        } catch (e) {
          console.warn('Copertine non generate', e);
        }
      }, 80);
    }
    document.getElementById('loader')?.classList.add('done');
    if (this.isLab && !saved && !preset) setTimeout(() => this.toast('Benvenuto! Questo è un modello di quadro già pronto: alimentalo con il pulsante in basso e prova gli interruttori. Per iniziare da zero usa “Modelli”.', 'info', 9000), 800);
  }

  // ── Progetto ──────────────────────────────────────────────────────────────────────
  onProjectChange(d = {}) {
    this.view.sync();
    this.sim.sync(this.project.data, (w) => this.project.electricalLength(w));
    this.picker.invalidate();
    if (this.selection?.comp && !this.project.comp(this.selection.comp)) this.selection = null;
    if (this.selection?.wire && !this.project.wire(this.selection.wire)) this.selection = null;
    this.view.setSelected(this.selection?.comp || null);
    this.view.setSelectedWire(this.selection?.wire || null);
    this.checksPanel?.schedule();
    this.scheduleSave();
    if (d.type !== 'meta') this.right?.refresh('props');
    if (d.type === 'load' || d.type === 'project-meta') this.right?.refresh();
    if (d.removedWires) this.toast(`${d.removedWires} collegament${d.removedWires > 1 ? 'i rimossi' : 'o rimosso'}: i morsetti non esistono più con la nuova configurazione.`, 'warn');
    this.emit('project', d);
  }

  loadProject(data, opts = {}) {
    this.select(null);
    this.interaction.setTool('select');
    this.project.load(data, opts);
    this.flags = { limiter: false, rcdTrip: false };
    const sup = this.sim.getInst('XA');
    if (sup) sup.state.on = false;
  }

  startExercise(id) {
    const ex = exerciseById(id);
    const data = ex.start();
    data.meta.exercise = { id, started: new Date().toISOString() };
    data.meta.title = ex.title;
    this.loadProject(data, { keepHistory: true });
    if (this.guide) this.guide.results = null;
    this.right?.show('guide');
    this.goView(id === 'motore' ? 'panoramica' : 'quadro');
  }

  scheduleSave() {
    if (!this.isLab) return; // il tutorial riparte sempre dalla situazione della lezione
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => saveJSON(STORE_KEY, this.project.toJSON()), 500);
  }

  saveFile() {
    const data = JSON.stringify(this.project.toJSON(), null, 2);
    const name = (this.project.meta.title || 'impianto').replace(/[^\w\-àèéìòù ]+/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'impianto';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `${name}.impianto.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.toast('Progetto salvato nella cartella Download.', 'ok');
  }

  openFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data.components) throw new Error('formato non riconosciuto');
        this.loadProject(data, { keepHistory: true });
        this.toast(`Aperto: ${data.meta?.title || f.name}`, 'ok');
      } catch (e) {
        this.toast('Impossibile aprire il file: ' + e.message, 'error');
      }
    };
    inp.click();
  }

  undo() {
    if (!this.isLab) return;
    const l = this.project.undo();
    this.toast(l ? `Annullato: ${l}` : 'Niente da annullare.', 'info', 2000);
  }
  redo() {
    if (!this.isLab) return;
    const l = this.project.redo();
    this.toast(l ? `Ripristinato: ${l}` : 'Niente da ripetere.', 'info', 2000);
  }

  // ── Selezione ─────────────────────────────────────────────────────────────────────
  select(sel, { silent = false } = {}) {
    this.selection = sel;
    if (this.isLab) {
      this.view.setSelected(sel?.comp || null);
      this.view.setSelectedWire(sel?.wire || null);
      this.view.flag([], []);
    }
    if (this.right && (!silent || this.right.tab === 'props')) {
      if (this.right.tab !== 'props' && sel) this.right.show('props');
      else this.right.refresh('props');
    }
    this.emit('selection', sel);
  }

  deleteSelection() {
    if (!this.isLab) return;
    const s = this.selection;
    if (!s) return;
    if (s.comp) {
      const c = this.project.comp(s.comp);
      if (c && DEFS[c.type].fixed) return this.toast('Questo componente fa parte del quadro e non si può rimuovere.', 'warn');
      if (this.project.removeComponent(s.comp)) this.toast(`${c.tag} rimosso (Ctrl+Z per annullare).`, 'info', 2500);
    } else if (s.wire) {
      const w = this.project.wire(s.wire);
      if (w?.fixed) return this.toast('Il conduttore di terra principale è fisso.', 'warn');
      this.project.removeWire(s.wire);
    }
    this.select(null);
  }

  startWireFrom(ref) {
    this.interaction.setTool('wire');
    const t = this.view.terminal(ref);
    if (t) this.interaction.wireClick(t);
  }

  flag(comps, wires) {
    this.view.flag(comps, wires);
  }

  flagCheck(r) {
    this.view.flag(r.comps || [], r.wires || []);
    if (r.comps?.length) this.focusComponent(r.comps[0], true);
  }

  // ── Telecamera ────────────────────────────────────────────────────────────────────
  goView(id, duration = 0.8) {
    const v = this.world.views(this.stage.camera.aspect, this.stage.camera.fov)[id];
    if (!v) return;
    if (this.xrActive) return this.xr.teleportToView(id);
    if (duration === 0) {
      this.stage.camera.position.copy(v.pos);
      this.stage.controls.target.copy(v.target);
    } else this.stage.flyTo(v.pos, v.target, duration);
    this.emit('view', id);
    this.currentView = id;
  }

  /** Inquadra un insieme di punti/scatole (coordinate mondo) adattando la distanza al riquadro */
  frameBox(box, { dir = new THREE.Vector3(0.1, 0.12, 1), minDist = 0.45, margin = 1.35, duration = 0.9 } = {}) {
    if (this.xrActive || box.isEmpty()) return;
    const cam = this.stage.camera;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = Math.max(minDist, ((size.y / 2) * margin) / t, ((size.x / 2) * margin) / (t * cam.aspect)) + size.z / 2;
    this.stage.flyTo(c.clone().addScaledVector(dir.clone().normalize(), dist), c, duration);
    this.emit('view', null);
  }

  focusComponent(id, soft = false) {
    const rec = this.view.models.get(id);
    if (!rec) return;
    const box = new THREE.Box3().setFromObject(rec.model.group);
    const c = box.getCenter(new THREE.Vector3());
    const size = Math.max(0.12, box.getSize(new THREE.Vector3()).length());
    const dir = new THREE.Vector3(0.12, 0.08, 1).normalize();
    const dist = soft ? Math.max(size * 3.2, 0.55) : size * 2.6;
    this.stage.flyTo(c.clone().addScaledVector(dir, dist), c, 0.7);
    this.emit('view', null);
  }

  focusSelection() {
    if (this.selection?.comp) this.focusComponent(this.selection.comp);
  }

  // ── Simulazione ───────────────────────────────────────────────────────────────────
  togglePower() {
    const r = this.sim.interact('XA', 'power');
    if (r?.sound) this.sfx(r.sound);
    if (r?.msg) this.toast(r.msg, 'info');
    this.world.updateMeterDisplay(this.sim.getInst('XA').state);
    this.checksPanel?.schedule();
    this.emit('sim');
  }

  resetAll() {
    let n = 0;
    for (const inst of this.sim.inst.values()) {
      const s = inst.state;
      if (s.tripped && inst.def.interact?.toggle && !s.damaged) {
        s.tripped = false;
        s.on = true;
        s.cause = null;
        s.theta = Math.min(s.theta || 0, 0.5);
        n++;
      }
      if (inst.type === 'fr3' && s.tripped) {
        s.tripped = false;
        s.theta = 0.5;
        n++;
      }
      if (inst.type === 'supply' && s.limiter) {
        s.limiter = false;
        s.on = true;
        n++;
      }
    }
    this.sim.settle();
    this.toast(n ? `Riarmate ${n} protezioni.` : 'Nessuna protezione da riarmare.', 'info', 2200);
    if (n) this.sfx('switch-on');
  }

  setSpeed(k) {
    this.simSpeed = k;
    this.emit('speed', k);
  }

  setWireMode(m) {
    this.settings.wireMode = m;
    this.view.wireView.setMode(m);
    this.emit('wiremode', m);
  }

  setLux(l) {
    this.sim.env.lux = l;
    this.sim.markDirty();
  }

  onSimEvent(e) {
    if (e.sound) this.sfx(e.sound);
    if (e.level === 'trace' || !e.text) return;
    if ((e.level === 'warn' || e.level === 'error') && this.isLab) this.toast(e.text, e.level, 6500);
    if (e.text.includes('Contatore: distacco')) this.flags.limiter = true;
    if (e.text.includes('DIFFERENZIALE')) this.flags.rcdTrip = true;
    this.emit('event', e);
    this.checksPanel?.schedule();
  }

  // ── Impostazioni ──────────────────────────────────────────────────────────────────
  setScale(s) {
    this.settings.scale = s;
    this.world.setScale(s);
    this.view.updateTerminalWorld();
    this.picker.invalidate();
    saveJSON(SETTINGS_KEY, this.settings);
  }

  setSetting(k, v) {
    this.settings[k] = v;
    saveJSON(SETTINGS_KEY, this.settings);
    this.applySettings();
    if (k === 'teacher') this.right?.refresh();
  }

  applySettings() {
    const s = this.settings;
    this.stage.renderer.shadowMap.enabled = s.shadows;
    this.stage.keyLight.castShadow = s.shadows;
    this.sfxEngine.enabled = s.sound;
    this.world.trunkCover.visible = s.trunkCover;
    this.stage.scene.traverse((o) => {
      if (o.material && o.isMesh) o.material.needsUpdate = true;
    });
  }

  togglePanel(side) {
    const cls = side === 'left' ? 'no-left' : 'no-right';
    if (window.innerWidth <= 820) this.root.classList.toggle(side === 'left' ? 'show-left' : 'show-right');
    else this.root.classList.toggle(cls);
    this.emit('panels');
    setTimeout(() => this.stage.resize(), 30);
  }

  // ── Uscite ────────────────────────────────────────────────────────────────────────
  report() {
    openReport(this);
  }

  togglePresentation() {
    this.presenter?.toggle();
  }

  enterVR() {
    this.xr.toggle();
  }

  toast(text, level = 'info', ms) {
    this.overlays?.toast(text, level, ms);
    if (this.xrActive) this.xr.toast(text, level);
  }

  sfx(name) {
    this.sfxEngine?.play(name);
  }

  // ── Ciclo per fotogramma ──────────────────────────────────────────────────────────
  frame(dt, t) {
    this.simAcc += dt * this.simSpeed;
    let n = 0;
    while (this.simAcc >= 1 / 30 && n < 90) {
      this.sim.step(1 / 30);
      this.simAcc -= 1 / 30;
      n++;
    }
    if (n >= 90) this.simAcc = 0;
    this.view.update(dt, t);
    this.meterT = (this.meterT || 0) + dt;
    if (this.meterT > 0.3) {
      this.meterT = 0;
      const sup = this.sim.getInst('XA');
      if (sup) this.world.updateMeterDisplay(sup.state);
      let hum = 0;
      for (const i of this.sim.inst.values()) if (i.type === 'm3' && i.state.mode !== 'stop') hum += i.state.mode === 'stall' ? 1.6 : 1;
      this.sfxEngine.setMotorHum(Math.min(2, hum));
    }
    this.lim.update(dt);
    this.presenter?.update(dt);
    this.emit('frame', { dt, t });
    this.xr.update(dt, t);
  }
}
