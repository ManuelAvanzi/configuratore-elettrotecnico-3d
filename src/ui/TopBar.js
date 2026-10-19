// Barra superiore: marchio, titolo del progetto, strumenti e azioni principali.
import { h, icon } from './dom.js';

export class TopBar {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    const brand = h('a', { class: 'brand', href: './index.html', title: 'Torna alla home' },
      h('div', { class: 'brand-mark' }, icon('zap', 18)),
      h('div', { class: 'brand-text' },
        h('b', {}, 'Configuratore elettrotecnico 3D'),
        h('span', {}, h('span', { class: 'lab' }, 'CarraroLab'), ' · Dispositivi elettrotecnici')));
    this.title = h('input', {
      class: 'project-title',
      value: app.project.meta.title,
      title: 'Nome del progetto',
      onchange: (e) => app.project.setProjectMeta({ title: e.target.value.trim() || 'Impianto' }),
    });
    const tb = (tool, ic, label, key, tip) => h('button', { class: 'tbtn', dataset: { tool }, title: tip, onclick: () => app.interaction.setTool(tool) }, icon(ic, 17), h('span', { class: 'lbl' }, label), h('kbd', {}, key));
    this.tools = h('div', { class: 'tools' },
      tb('select', 'select', 'Seleziona', 'V', 'Seleziona, sposta e aziona i componenti'),
      tb('wire', 'wire', 'Cabla', 'W', 'Collega due morsetti con un conduttore'),
      tb('measure', 'measure', 'Misura', 'M', 'Multimetro e pinza amperometrica'),
      h('div', { class: 'sep' }),
      h('button', { class: 'tbtn icon', title: 'Annulla (Ctrl+Z)', onclick: () => app.undo() }, icon('undo', 17)),
      h('button', { class: 'tbtn icon', title: 'Ripeti (Ctrl+Y)', onclick: () => app.redo() }, icon('redo', 17)));
    const act = (ic, label, fn, tip, cls = '') => h('button', { class: 'tbtn ' + cls, title: tip || label, onclick: fn }, icon(ic, 17), h('span', { class: 'lbl' }, label));
    this.actions = h('div', { class: 'actions' },
      h('a', { class: 'tbtn compact hide-present', href: './tutorial.html', title: 'Tutorial guidato: impara passo passo' }, icon('school', 17), h('span', { class: 'lbl' }, 'Tutorial')),
      act('grid', 'Modelli', () => app.modals.presets(), 'Nuovo progetto da un modello predefinito', 'hide-present'),
      act('open', 'Apri', () => app.openFile(), 'Apri un progetto salvato (.json)', 'hide-present compact'),
      act('save', 'Salva', () => app.saveFile(), 'Salva il progetto sul computer (Ctrl+S)', 'hide-present compact'),
      act('report', 'Scheda tecnica', () => app.report(), 'Documento del progetto: distinta, collegamenti, verifiche e motivazioni', 'hide-present'),
      act('present', 'Presenta', () => app.togglePresentation(), 'Presentazione guidata del progetto (proiettore / LIM)'),
      h('button', { class: 'tbtn icon hide-present', title: 'Impostazioni', onclick: () => app.modals.settings() }, icon('settings', 17)),
      h('button', { class: 'tbtn icon hide-present', title: 'Guida rapida (H)', onclick: () => app.modals.help() }, icon('help', 17)),
      this.vrBtn = h('button', { class: 'tbtn primary', title: 'Entra nel laboratorio con il visore', onclick: () => app.enterVR() }, icon('vr', 17), h('span', { class: 'lbl' }, 'Entra in VR')));
    el.append(brand, h('div', { class: 'sep' }), this.title, this.tools, this.actions);
    app.on('tool', () => this.refresh());
    app.on('project', () => {
      if (document.activeElement !== this.title) this.title.value = app.project.meta.title;
    });
    this.refresh();
  }

  refresh() {
    for (const b of this.tools.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === this.app.interaction.tool);
  }

  setVR(state) {
    // state: 'supported' | 'unsupported' | 'active'
    const b = this.vrBtn;
    b.disabled = state === 'unsupported' && !this.app.xrEmulated;
    b.querySelector('.lbl').textContent = state === 'active' ? 'Esci dalla VR' : 'Entra in VR';
    b.title = state === 'unsupported' ? 'WebXR non disponibile su questo dispositivo: apri il configuratore dal browser del visore (vedi Guida)' : 'Entra nel laboratorio con il visore';
  }
}
