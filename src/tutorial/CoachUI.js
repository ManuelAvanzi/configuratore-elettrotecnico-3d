// Interfaccia del tutorial: barra superiore essenziale, colonna “coach” con il passo corrente
// e schermata di scelta delle lezioni.
import { h, icon, clear } from '../ui/dom.js';
import { DEFS } from '../catalog/defs/index.js';

const TYPE_LABEL = {
  info: ['book', 'Spiegazione'],
  wire: ['wire', 'Collegamento'],
  action: ['pointer', 'Prova tu'],
  measure: ['measure', 'Misura'],
  clamp: ['measure', 'Misura'],
  quiz: ['help', 'Domanda'],
  end: ['flag', 'Lezione completata'],
};

const DONE_TEXT = {
  wire: 'Collegamento fatto!',
  action: 'Fatto!',
  measure: 'Misura fatta: leggi il valore sul display in alto a destra.',
  clamp: 'Misura fatta: leggi il valore sul display in alto a destra.',
};

export class CoachUI {
  constructor(app, tutorial) {
    this.app = app;
    this.t = tutorial;
    this.root = document.getElementById('tut-app');
    this.top = document.getElementById('tut-top');
    this.coach = document.getElementById('coach');
    this.picker = document.getElementById('picker');
    this.buildTop();
    app.on('tutorial', (e) => this.onTutorial(e));
    app.on('vr', (s) => this.setVR(s));
    setInterval(() => this.refreshPower(), 400);
    this.showPicker();
  }

  // ── Barra superiore ───────────────────────────────────────────────────────────────
  buildTop() {
    this.lessonInfo = h('div', { class: 'tut-lesson' });
    this.powerPill = h('div', { class: 'pill', title: 'Stato dell’impianto' }, h('i'), h('span', {}, 'Impianto spento'));
    this.vrBtn = h('button', { class: 'tbtn', style: { display: 'none' }, onclick: () => this.app.enterVR() }, icon('vr', 17), h('span', { class: 'lbl' }, 'Entra in VR'));
    this.top.append(
      h('a', { class: 'brand', href: './index.html', title: 'Torna alla home' },
        h('div', { class: 'brand-mark' }, icon('zap', 18)),
        h('div', { class: 'brand-text' }, h('b', {}, 'Configuratore elettrotecnico 3D'), h('span', {}, h('span', { class: 'lab' }, 'Tutorial guidato'), ' · CarraroLab'))),
      this.lessonInfo,
      h('div', { class: 'tut-actions' },
        this.powerPill,
        h('button', { class: 'tbtn', onclick: () => this.showPicker() }, icon('grid', 17), h('span', { class: 'lbl' }, 'Lezioni')),
        h('a', { class: 'tbtn', href: './laboratorio.html', title: 'Il configuratore completo, senza guida' }, icon('cpu', 17), h('span', { class: 'lbl' }, 'Laboratorio completo')),
        this.vrBtn));
  }

  setVR(state) {
    this.vrBtn.style.display = state === 'unsupported' ? 'none' : '';
    this.vrBtn.querySelector('.lbl').textContent = state === 'active' ? 'Esci dalla VR' : 'Entra in VR';
  }

  refreshPower() {
    const on = this.app.sim.powerState().on;
    this.powerPill.className = 'pill' + (on ? ' on' : '');
    this.powerPill.querySelector('span').textContent = on ? 'Impianto alimentato' : 'Impianto spento';
  }

  // ── Scelta della lezione ──────────────────────────────────────────────────────────
  showPicker() {
    this.root.classList.add('picking');
    const p = clear(this.picker);
    p.style.display = '';
    const cards = this.t.lessons.map((l) => {
      const done = this.t.isCompleted(l.id);
      return h('button', { class: 'lesson-card', onclick: () => this.startLesson(l.id) },
        h('div', { class: 'lesson-cover', style: { background: `linear-gradient(135deg, ${l.color}, #14191f)` } },
          h('img', { src: l.cover, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }),
          h('span', { class: 'lesson-n' }, String(l.n)),
          done ? h('span', { class: 'lesson-done' }, icon('check', 14), 'Completata') : null),
        h('div', { class: 'lesson-meta' },
          h('b', {}, l.title),
          h('p', {}, l.subtitle),
          h('div', { class: 'lesson-tags' }, h('span', {}, icon('timer', 13), l.duration), h('span', {}, icon('school', 13), l.level))));
    });
    p.append(h('div', { class: 'picker-inner' },
      h('div', { class: 'kicker' }, 'Tutorial guidato'),
      h('h1', {}, 'Impara l’elettrotecnica un passo alla volta'),
      h('p', { class: 'picker-lead' }, 'Scegli una lezione. Ti spieghiamo che cosa fare, ti indichiamo dove cliccare nel laboratorio 3D e controlliamo insieme che tutto funzioni. Non serve sapere niente: si parte da zero.'),
      h('div', { class: 'lesson-grid' }, cards),
      h('div', { class: 'picker-foot' },
        h('div', { class: 'howto' }, icon('mouse', 16), 'Nel laboratorio: trascina per girare la vista, rotellina per avvicinarti, tasto destro per spostarti.'),
        h('div', { class: 'links' },
          this.t.lesson ? h('button', { class: 'btn', onclick: () => this.hidePicker() }, icon('back', 15), 'Torna alla lezione') : null,
          h('a', { class: 'btn ghost', href: './index.html' }, icon('house', 15), 'Home')))));
    this.renderLessonInfo();
    setTimeout(() => this.app.stage.resize(), 30);
  }

  hidePicker() {
    this.root.classList.remove('picking');
    this.picker.style.display = 'none';
    setTimeout(() => this.app.stage.resize(), 30);
  }

  startLesson(id) {
    this.hidePicker();
    this.t.start(id);
    const url = new URL(location.href);
    url.searchParams.set('lezione', id);
    history.replaceState(null, '', url);
  }

  onTutorial(e) {
    if (e?.type === 'stop' || !this.t.lesson) {
      this.showPicker();
      return;
    }
    if (e?.type === 'start' && this.root.classList.contains('picking')) this.hidePicker();
    this.render();
    this.renderLessonInfo();
  }

  renderLessonInfo() {
    const t = this.t;
    clear(this.lessonInfo);
    if (!t.lesson) return;
    const pct = Math.round((t.i / Math.max(1, t.total - 1)) * 100);
    this.lessonInfo.append(
      h('div', { class: 'tl-title' }, h('span', {}, `Lezione ${t.lesson.n}`), t.lesson.title),
      h('div', { class: 'tl-bar' }, h('i', { style: { width: pct + '%' } })),
      h('div', { class: 'tl-count' }, `${t.i + 1} / ${t.total}`));
  }

  // ── Colonna del coach ─────────────────────────────────────────────────────────────
  render() {
    const t = this.t;
    const s = t.step;
    const c = clear(this.coach);
    if (!s) return;
    const [ic, lab] = TYPE_LABEL[s.type] || TYPE_LABEL.info;
    const body = h('div', { class: 'coach-body' });
    body.append(
      h('div', { class: 'coach-type t-' + s.type }, icon(ic, 15), lab),
      h('h2', {}, s.title),
      s.text ? h('p', { class: 'lead' }, s.text) : null);
    if (s.schema) {
      const d = h('div', { class: 'schema' });
      d.innerHTML = s.schema;
      body.append(d);
    }
    if (s.type === 'wire' || s.type === 'measure' || s.type === 'clamp') body.append(this.chips(s));
    if (s.todo && (!t.done || s.type === 'info')) body.append(h('div', { class: 'todo' }, icon('pointer', 18), h('span', {}, s.todo)));
    if (s.buttons?.length && !t.done) body.append(h('div', { class: 'coach-buttons' }, s.buttons.map((b) => h('button', { class: 'btn big', onclick: () => t.runButton(b) }, icon(b.icon || 'play', 17), b.label))));
    if (s.type === 'quiz') body.append(this.quiz(s));
    if (t.done && DONE_TEXT[s.type]) body.append(h('div', { class: 'done-banner' }, icon('ok', 20), h('span', {}, DONE_TEXT[s.type])));
    if (s.why) body.append(h('details', { class: 'why' }, h('summary', {}, icon('info', 15), 'Perché?'), h('p', {}, s.why)));
    if (s.type === 'end') body.append(this.endBox(s));

    const canShow = !t.done && s.type !== 'info' && s.type !== 'end';
    const foot = h('div', { class: 'coach-foot' },
      h('button', { class: 'btn ghost', disabled: t.i === 0, onclick: () => t.prev() }, icon('left', 16), 'Indietro'),
      canShow ? h('button', { class: 'btn', title: 'Il configuratore esegue il passo al posto tuo', onclick: () => t.showMe() }, icon('eye', 16), 'Mostrami come') : h('span'),
      s.type === 'end'
        ? h('span')
        : h('button', { class: 'btn accent next' + (t.done ? ' ready' : ''), disabled: !t.done, onclick: () => t.next() }, 'Avanti', icon('right', 16)));
    c.append(body, foot);
  }

  label(refStr) {
    const p = this.app.project;
    const r = this.t.ctx().ref(refStr);
    const comp = p.comp(r.c);
    const term = p.terminal(r);
    const name = comp?.type === 'supply' ? 'Arrivo linea' : comp?.type === 'pebar' ? 'Barra di terra' : (DEFS[comp?.type]?.short || '').replace(/\s+\d?P(\+N)?$/, '');
    return { tag: comp?.tag || '', name, term: term?.label || r.t };
  }

  chips(s) {
    const a = this.label(s.from);
    const b = this.label(s.to);
    const isMeas = s.type === 'measure';
    const chip = (x, n, cls) => h('div', { class: 'chip ' + cls }, h('b', {}, n), h('div', {}, h('span', {}, `${x.name} ${x.tag}`), h('strong', {}, `morsetto ${x.term}`)));
    if (s.type === 'clamp') {
      return h('div', { class: 'chips' }, h('div', { class: 'chip clamp' }, icon('measure', 18), h('div', {}, h('span', {}, 'Cavo'), h('strong', {}, `${a.tag}:${a.term} → ${b.tag}:${b.term}`))));
    }
    return h('div', { class: 'chips' },
      chip(a, isMeas ? 'R' : '1', isMeas ? 'probe-r' : 'start'),
      h('div', { class: 'chip-arrow' }, icon('right', 18)),
      chip(b, isMeas ? 'N' : '2', isMeas ? 'probe-b' : 'end'));
  }

  quiz(s) {
    const t = this.t;
    const box = h('div', { class: 'quiz' });
    s.options.forEach((o, k) => {
      const picked = t.quiz.picked === k;
      const cls = picked ? (o.correct ? ' right' : ' wrong') : t.quiz.solved && o.correct ? ' right' : '';
      box.append(h('button', { class: 'quiz-opt' + cls, disabled: t.quiz.solved, onclick: () => t.answer(k) },
        h('span', { class: 'qk' }, String.fromCharCode(65 + k)), h('span', {}, o.text)));
    });
    const pk = t.quiz.picked;
    if (pk !== null && pk !== undefined) {
      const o = s.options[pk];
      box.append(h('div', { class: 'quiz-fb ' + (o.correct ? 'ok' : 'no') }, icon(o.correct ? 'ok' : 'info', 17), h('span', {}, o.feedback)));
    }
    return box;
  }

  endBox(s) {
    const t = this.t;
    const next = t.nextLesson();
    return h('div', { class: 'end-box' },
      h('div', { class: 'section-title' }, 'Cosa hai imparato'),
      h('ul', { class: 'recap' }, (s.recap || []).map((r) => h('li', {}, icon('check', 15), h('span', {}, r)))),
      h('div', { class: 'end-actions' },
        next ? h('button', { class: 'btn accent big', onclick: () => this.startLesson(next.id) }, `Lezione ${next.n}: ${next.title}`, icon('right', 16)) : null,
        h('button', { class: 'btn big', onclick: () => this.showPicker() }, icon('grid', 16), 'Tutte le lezioni'),
        h('button', { class: 'btn ghost', onclick: () => t.openInLab() }, icon('cpu', 16), 'Apri questo impianto nel laboratorio completo')));
  }
}
