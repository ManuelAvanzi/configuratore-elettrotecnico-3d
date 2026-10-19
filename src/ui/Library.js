// Libreria dei componenti (pannello sinistro): famiglie, ricerca, copertine 3D, posizionamento.
import { h, icon, clear } from './dom.js';
import { DEFS, FAMILIES, modulesOf } from '../catalog/defs/index.js';
import { resolveParams } from '../catalog/defs/common.js';

export class Library {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.query = '';
    this.head = h('div', { class: 'panel-head' }, h('h2', {}, 'Componenti'), h('div', { class: 'grow' }),
      h('button', { class: 'tbtn icon', title: 'Nascondi il pannello', onclick: () => app.togglePanel('left') }, icon('panelLeft', 16)));
    this.search = h('label', { class: 'search' }, icon('search', 15), h('input', { placeholder: 'Cerca un componente…', oninput: (e) => { this.query = e.target.value.toLowerCase(); this.render(); } }));
    this.body = h('div', { class: 'panel-body' });
    el.append(this.head, this.search, this.body);
    this.thumbs = {};
    app.on('tool', () => this.markArmed());
    this.render();
  }

  setThumbs(t) {
    this.thumbs = t;
    this.render();
  }

  render() {
    const b = clear(this.body);
    const q = this.query;
    for (const fam of FAMILIES) {
      const defs = Object.values(DEFS).filter((d) => d.family === fam.id && !d.fixed && (!q || (d.name + ' ' + d.short + ' ' + (d.help || '')).toLowerCase().includes(q)));
      if (!defs.length) continue;
      const cards = h('div', { class: 'cards' });
      for (const d of defs) {
        const p = resolveParams(d, {});
        const size = d.mount === 'din' ? `${String(modulesOf(d, p)).replace('.', ',')} mod. DIN` : d.span > 1 ? `${d.span} posizioni` : 'pannello';
        const img = this.thumbs[d.type];
        const card = h('button', { class: 'card', dataset: { type: d.type }, title: d.help || d.name },
          h('div', { class: 'thumb' }, img ? h('img', { src: img, alt: d.short, draggable: 'false' }) : icon('box', 30)),
          h('div', { class: 'meta' }, h('b', {}, d.short), h('span', {}, `${d.tag} · ${size}`)));
        card.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          this.app.dragFromLibrary = true;
          this.app.interaction.setTool('place', { type: d.type, params: {} });
        });
        card.addEventListener('click', () => {
          this.app.dragFromLibrary = false;
          this.app.toast(`${d.short}: punta ${d.mount === 'din' ? 'una guida DIN del quadro' : 'una posizione libera del pannello utenze'} e fai clic. Maiusc per inserirne più di uno, Esc per annullare.`, 'info', 4500);
        });
        cards.append(card);
      }
      b.append(h('div', { class: 'family' },
        h('div', { class: 'family-title' }, fam.label, h('span', { class: 'where' }, fam.mount === 'din' ? 'quadro' : 'pannello utenze')),
        cards));
    }
    if (!b.children.length) b.append(h('div', { class: 'empty' }, icon('search', 28), 'Nessun componente trovato.'));
    this.markArmed();
  }

  markArmed() {
    const it = this.app.interaction;
    for (const c of this.body.querySelectorAll('.card')) c.classList.toggle('armed', it.tool === 'place' && it.placeType === c.dataset.type);
  }
}
