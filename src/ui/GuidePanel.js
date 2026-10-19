// Scheda Esercitazioni: percorso guidato con passi verificati automaticamente e prove di funzionamento.
import { h, icon, clear } from './dom.js';
import { DEFS } from '../catalog/defs/index.js';
import { PHASES, TRACKS, exercisesOfTrack, trackById, exerciseById, exerciseContext } from '../exercises/index.js';

export class GuidePanel {
  constructor(app) {
    this.app = app;
    this.results = null;
    this.stepState = [];
    setInterval(() => this.tick(), 800);
  }

  get current() {
    const id = this.app.project.meta.exercise?.id;
    return id ? exerciseById(id) : null;
  }

  badge() {
    const ex = this.current;
    if (!ex) return null;
    const done = this.stepState.filter(Boolean).length;
    return { text: `${done}/${ex.steps.length}`, level: done === ex.steps.length ? '' : '' };
  }

  phaseStrip(active) {
    return h('div', { class: 'phase-strip' }, PHASES.map((p) => h('div', { class: 'phase' + (p.n === active ? ' active' : ''), title: p.text }, h('b', {}, p.title), p.short || p.text)));
  }

  render(el) {
    this.el = el;
    const ex = this.current;
    if (!ex) return this.renderList(el);
    const app = this.app;
    const track = trackById(ex.track);
    el.append(
      h('button', { class: 'btn ghost small', style: { marginBottom: '10px' }, onclick: () => this.exit() }, icon('back', 14), 'Tutte le esercitazioni'),
      h('div', { class: 'insp-head' },
        h('div', { class: 'ex-cover', style: { background: ex.color, width: '48px', height: '48px' } }, icon(ex.icon, 24)),
        h('div', { class: 'insp-title' }, h('div', { class: 'kind' }, `${ex.level} · ${ex.duration}${ex.teacher ? ' · con il docente' : ''}`), h('h3', {}, ex.title))),
      track ? h('div', { class: 'track-tag' }, h('b', {}, `Esercitazione ${track.n}`), track.title) : null,
      this.phaseStrip(ex.phase),
      h('div', { class: 'section-title' }, icon('flag', 13), 'Obiettivi'),
      h('ul', { class: 'goal-list' }, ex.goals.map((g) => h('li', {}, g))));
    this.stepsEl = h('ol', { class: 'steps' });
    el.append(h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('checks', 13), 'Passi'), this.stepsEl));
    this.paintSteps(true);
    const testBtn = h('button', { class: 'btn accent', onclick: () => this.runTests() }, icon('play', 15), 'Verifica il funzionamento');
    this.resEl = h('div', {});
    el.append(h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('activity', 13), 'Prove di funzionamento'),
      h('p', { class: 'help-text', style: { marginTop: 0 } }, 'Il configuratore simula il tuo impianto (senza modificarlo) e controlla che funzioni come richiesto.'),
      testBtn, this.resEl));
    if (this.results?.id === ex.id) this.paintResults();
    if (ex.questions?.length) {
      el.append(h('div', { class: 'section' }, h('div', { class: 'section-title' }, icon('help', 13), 'Analisi dei parametri guidata dal docente'),
        h('ul', { class: 'goal-list' }, ex.questions.map((q) => h('li', {}, q))),
        h('p', { class: 'help-text', style: { fontSize: '11.5px' } }, 'Scrivi le risposte nelle motivazioni dei componenti o nelle giustificazioni del pannello Progetto: finiscono nella scheda tecnica e nella presentazione.')));
    }
    const tools = h('div', { class: 'section btn-row' });
    if (app.settings.teacher && ex.solution) tools.append(h('button', { class: 'btn', onclick: () => this.loadSolution() }, icon('eye', 15), 'Carica la soluzione'));
    tools.append(h('button', { class: 'btn', onclick: () => this.restart() }, icon('refresh', 15), 'Ricomincia'));
    el.append(tools);
  }

  renderList(el) {
    el.append(
      h('p', { class: 'help-text', style: { marginTop: 0 } }, 'Le cinque esercitazioni pratiche della scheda del laboratorio. Ogni percorso parte da un quadro predisposto, controlla i passi in automatico e verifica il funzionamento con la simulazione.'),
      this.phaseStrip(0));
    for (const t of TRACKS) {
      el.append(h('div', { class: 'track-head' }, h('b', {}, `${t.n}. ${t.title}`), h('p', {}, t.text)));
      for (const ex of exercisesOfTrack(t.id)) {
        el.append(h('button', { class: 'ex-card', onclick: () => this.start(ex) },
          h('div', { class: 'ex-cover', style: { background: ex.color } }, icon(ex.icon, 26)),
          h('div', {}, h('b', {}, ex.title), h('p', {}, ex.summary), h('span', { class: 'lvl' }, `${ex.level} · ${ex.duration} · ${PHASES[ex.phase - 1].title}${ex.teacher ? ' · con il docente' : ''}${ex.keep ? ' · sul tuo impianto' : ''}`))));
      }
    }
  }

  async start(ex) {
    if (ex.keep) {
      // lavora sull'impianto attuale: nessuna sostituzione del progetto
      this.app.startExercise(ex.id);
      const n = this.app.project.components.filter((c) => !DEFS[c.type].fixed).length;
      if (n < 3) this.app.toast('Il banco è quasi vuoto: configura un impianto o apri un modello predefinito (pannello Progetto), poi presentalo.', 'info', 7000);
      return;
    }
    const ok = await this.app.modals.confirm(ex.title, 'L’esercitazione parte da un nuovo progetto: quello attuale verrà sostituito (puoi annullare con Ctrl+Z o salvarlo prima). Continuare?', 'Inizia');
    if (!ok) return;
    this.app.startExercise(ex.id);
  }

  exit() {
    this.app.project.setProjectMeta({ exercise: null });
    this.results = null;
    this.app.right.refresh();
  }

  async restart() {
    const ex = this.current;
    const ok = await this.app.modals.confirm('Ricomincia', 'Il progetto torna alla situazione iniziale dell’esercitazione. Continuare?', 'Ricomincia');
    if (ok) this.app.startExercise(ex.id);
  }

  loadSolution() {
    const ex = this.current;
    const data = ex.solution();
    data.meta.exercise = { id: ex.id, solution: true };
    this.app.loadProject(data, { keepHistory: true });
    this.app.toast('Soluzione caricata: confrontala con il lavoro della classe.', 'info');
  }

  tick() {
    const ex = this.current;
    if (!ex) return;
    const c = exerciseContext(this.app);
    const st = ex.steps.map((s) => {
      try {
        return !!s.done(c);
      } catch {
        return false;
      }
    });
    const changed = st.join() !== this.stepState.join();
    this.stepState = st;
    if (changed) {
      this.paintSteps();
      this.app.right?.renderTabs();
      this.app.emit('exercise');
    }
  }

  paintSteps(force) {
    const ex = this.current;
    if (!ex || !this.stepsEl?.isConnected) return;
    if (force) this.tick();
    clear(this.stepsEl);
    const cur = this.stepState.findIndex((d) => !d);
    ex.steps.forEach((s, i) => {
      const done = this.stepState[i];
      this.stepsEl.append(h('li', { class: 'step' + (done ? ' done' : i === cur ? ' current' : '') },
        h('span', { class: 'n' }, done ? icon('check', 13) : String(i + 1)),
        h('div', {}, h('p', {}, s.text), s.hint && i === cur ? h('div', { class: 'step-hint' }, s.hint) : null)));
    });
  }

  runTests() {
    const ex = this.current;
    const c = exerciseContext(this.app);
    this.app.checksPanel.run();
    const out = ex.tests.map((t) => {
      let ok = false;
      try {
        ok = !!t.run(c);
      } catch (e) {
        console.warn(e);
      }
      return { label: t.label, ok };
    });
    this.results = { id: ex.id, out };
    const all = out.every((o) => o.ok);
    this.app.sfx(all ? 'ok' : 'error');
    if (all) {
      this.app.project.setProjectMeta({ exercise: { ...this.app.project.meta.exercise, completed: new Date().toISOString() } });
      this.app.toast('Tutte le prove superate: ottimo lavoro! Ora completa le motivazioni e genera la scheda tecnica.', 'ok', 6000);
    }
    this.paintResults();
  }

  paintResults() {
    if (!this.resEl || !this.results) return;
    const all = this.results.out.every((o) => o.ok);
    clear(this.resEl).append(h('div', { class: 'result ' + (all ? 'ok' : 'error') },
      h('b', {}, all ? 'Prove superate' : 'Alcune prove non sono superate'),
      h('ul', { class: 'goal-list', style: { listStyle: 'none', paddingLeft: 0, marginTop: '6px' } }, this.results.out.map((o) => h('li', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } },
        h('span', { style: { color: o.ok ? 'var(--ok)' : 'var(--error)' } }, icon(o.ok ? 'ok' : 'circleX', 15)), o.label)))));
  }
}
