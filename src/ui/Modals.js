// Finestre di dialogo: modelli predefiniti, impostazioni, guida rapida, informazioni sulla VR.
import { h, icon } from './dom.js';
import { PRESETS } from '../presets/index.js';

export class Modals {
  constructor(app) {
    this.app = app;
    this.current = null;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current) {
        e.stopPropagation();
        this.close();
      }
    }, true);
  }

  open(title, body, foot = [], wide = false) {
    this.close();
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) this.close(); } },
      h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'tbtn icon', title: 'Chiudi', onclick: () => this.close() }, icon('close', 18))),
        h('div', { class: 'modal-body' }, body),
        foot.length ? h('div', { class: 'modal-foot' }, foot) : null));
    document.body.append(back);
    this.current = back;
    return back;
  }

  close() {
    this.current?.remove();
    this.current = null;
  }

  presets() {
    const app = this.app;
    const grid = h('div', { class: 'preset-grid' }, PRESETS.map((p) => h('button', {
      class: 'preset',
      onclick: () => {
        this.close();
        app.loadProject(p.make(), { keepHistory: true });
        app.toast(`Caricato: ${p.title}`, 'ok');
      },
    }, icon(p.icon, 22), h('b', {}, p.title), h('p', {}, p.text))));
    this.open('Nuovo progetto', h('div', {},
      h('p', { class: 'help-text', style: { marginTop: 0, marginBottom: '14px' } }, 'Parti da un quadro vuoto oppure da un modello di riferimento completo da esplorare, modificare e analizzare (Fase 1 del laboratorio). Il progetto corrente viene sostituito: se ti serve, salvalo prima.'),
      grid), [], true);
  }

  settings() {
    const app = this.app;
    const s = app.settings;
    const row = (label, control, help) => h('div', { class: 'field' }, h('label', {}, label), control, help ? h('div', { class: 'help' }, help) : null);
    const scaleOut = h('output', {}, `× ${s.scale.toFixed(2).replace('.', ',')}`);
    this.open('Impostazioni', h('div', {},
      row('Scala del banco didattico',
        h('div', { class: 'range-row' }, h('input', { type: 'range', min: 1, max: 1.6, step: 0.05, value: s.scale, oninput: (e) => { scaleOut.textContent = `× ${(+e.target.value).toFixed(2).replace('.', ',')}`; app.setScale(+e.target.value); } }), scaleOut),
        '1 = dimensioni reali. Ingrandire il banco rende più facile collegare i morsetti con il visore.'),
      row('Modalità docente', h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.teacher, onchange: (e) => app.setSetting('teacher', e.target.checked) }), h('span', {}, 'Mostra i comandi per inserire guasti (dispersioni, persona a contatto, cavi interrotti) e le soluzioni delle esercitazioni')),
      ),
      row('Ombre', h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.shadows, onchange: (e) => app.setSetting('shadows', e.target.checked) }), h('span', {}, 'Ombre morbide (disattivale sui PC meno potenti)'))),
      row('Suoni', h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.sound, onchange: (e) => app.setSetting('sound', e.target.checked) }), h('span', {}, 'Scatti, contattori, ronzio dei motori'))),
      row('Coperchio della canalina', h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.trunkCover, onchange: (e) => app.setSetting('trunkCover', e.target.checked) }), h('span', {}, 'Mostra il coperchio trasparente della canalina tra quadro e utenze'))),
      row('Visore emulato', h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!s.xrEmulator, onchange: (e) => { app.setSetting('xrEmulator', e.target.checked); app.toast('Ricarica la pagina per applicare la modifica.', 'info'); } }), h('span', {}, 'Anteprima della modalità VR sul PC senza visore (per mostrare alla classe tablet e comandi)'))),
    ), [h('button', { class: 'btn accent', onclick: () => this.close() }, 'Fatto')]);
  }

  help() {
    const k = (keys, text) => [h('span', {}, ...keys.map((x) => h('kbd', {}, x))), h('span', {}, text)];
    this.open('Guida rapida', h('div', {},
      h('div', { class: 'grid2', style: { gap: '18px' } },
        h('div', {},
          h('div', { class: 'section-title' }, icon('mouse', 13), 'Vista'),
          h('div', { class: 'shortcuts' },
            ...k(['Trascina'], 'ruota la vista'),
            ...k(['Tasto destro'], 'sposta la vista (o annulla)'),
            ...k(['Rotellina'], 'avvicina / allontana'),
            ...k(['Doppio clic'], 'inquadra il componente'),
            ...k(['1', '…', '5'], 'viste: panoramica, quadro, utenze, LIM, aula'),
            ...k(['F'], 'inquadra la selezione')),
          h('div', { class: 'section-title', style: { marginTop: '16px' } }, icon('keyboard', 13), 'Strumenti'),
          h('div', { class: 'shortcuts' },
            ...k(['V'], 'seleziona e aziona'),
            ...k(['W'], 'cabla'),
            ...k(['M'], 'misura (multimetro)'),
            ...k(['Canc'], 'rimuovi la selezione'),
            ...k(['Ctrl', 'Z'], 'annulla · Ctrl+Y ripeti'),
            ...k(['P'], 'alimenta / scollega'),
            ...k(['Esc'], 'annulla l’operazione'))),
        h('div', {},
          h('div', { class: 'section-title' }, icon('book', 13), 'Come si lavora'),
          h('ol', { class: 'goal-list', style: { paddingLeft: '18px' } },
            h('li', {}, 'Scegli un componente nella libreria e posizionalo su una guida DIN del quadro o sul pannello utenze.'),
            h('li', {}, 'Imposta i parametri nel pannello Proprietà (corrente nominale, curva, sensibilità…).'),
            h('li', {}, 'Collega i morsetti: clic sul morsetto di partenza e poi su quello di arrivo. Colori e sezioni seguono le norme (automatico) o li scegli tu.'),
            h('li', {}, 'Alimenta l’impianto con il pulsante in basso o con l’interruttore del contatore e prova il funzionamento.'),
            h('li', {}, 'Controlla la scheda Verifiche, misura con il multimetro, analizza i parametri e scrivi le motivazioni delle tue scelte.'),
            h('li', {}, 'Genera la Scheda tecnica e usa Presenta per illustrare il progetto alla classe.')),
          h('div', { class: 'section-title', style: { marginTop: '16px' } }, icon('vr', 13), 'Realtà virtuale'),
          h('p', { class: 'help-text' }, 'Con un visore Meta Quest apri l’indirizzo del configuratore nel browser del visore e premi “Entra in VR”. Grilletto: seleziona, aziona, collega · Levetta avanti: teletrasporto · Levetta di lato: rotazione · Tablet sul controller sinistro: libreria, strumenti, simulazione.')))), [], true);
  }

  vrInfo() {
    this.open('Realtà virtuale non disponibile', h('div', {},
      h('p', { class: 'help-text', style: { marginTop: 0 } }, 'Questo browser non espone WebXR (è normale su un PC senza visore collegato).'),
      h('ol', { class: 'goal-list' },
        h('li', {}, 'Avvia il configuratore in rete locale: npm run dev:quest (vedi LEGGIMI).'),
        h('li', {}, 'Sul Meta Quest apri il Browser e digita l’indirizzo https://IP-DEL-PC:5190 (accetta il certificato di sviluppo).'),
        h('li', {}, 'Premi “Entra in VR” nella barra in alto.')),
      h('p', { class: 'help-text' }, 'In alternativa, su PC con visore collegato (Quest Link / Steam Link) usa un browser con WebXR attivo.')), [h('button', { class: 'btn accent', onclick: () => this.close() }, 'Ho capito')]);
  }

  confirm(title, text, okLabel = 'Conferma') {
    return new Promise((resolve) => {
      this.open(title, h('p', { class: 'help-text', style: { margin: 0 } }, text), [
        h('button', { class: 'btn', onclick: () => { this.close(); resolve(false); } }, 'Annulla'),
        h('button', { class: 'btn accent', onclick: () => { this.close(); resolve(true); } }, okLabel),
      ]);
    });
  }
}
