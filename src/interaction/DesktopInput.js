// Mouse e tastiera (modalità PC): trasforma gli eventi del puntatore in raggi per gli strumenti
// e gestisce le scorciatoie. La rotazione/zoom della vista resta a OrbitControls.
import * as THREE from 'three';

export class DesktopInput {
  constructor(app) {
    this.app = app;
    this.el = app.stage.renderer.domElement;
    this.ndc = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.activePointer = null;

    this.el.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    this.el.addEventListener('pointerleave', () => {
      if (!this.activePointer) app.emit('hover', null);
    });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('dblclick', (e) => this.onDbl(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  pointer(e) {
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    this.ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.app.stage.camera);
    return { id: 'mouse', ray: this.raycaster.ray.clone(), screen: { x, y, w: r.width, h: r.height }, keepPlacing: e.shiftKey };
  }

  onDown(e) {
    if (this.app.xrActive) return;
    const it = this.app.interaction;
    if (e.button === 2) {
      if (it.cancel()) {
        this.app.stage.controls.enabled = false;
        this.restoreControls = true;
      }
      return;
    }
    if (e.button !== 0) return;
    const p = this.pointer(e);
    const grab = it.down(p);
    if (grab) {
      this.app.stage.controls.enabled = false;
      this.activePointer = e.pointerId;
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* ignora */
      }
    } else {
      // nessun elemento afferrato: la vista ruota (OrbitControls); il clic senza trascinamento resta valido
      this.orbiting = true;
      this.downPos = [e.clientX, e.clientY];
    }
  }

  onMove(e) {
    if (this.app.xrActive) return;
    this.app.interaction.move(this.pointer(e));
  }

  onUp(e) {
    if (this.app.xrActive) return;
    if (this.restoreControls) {
      this.restoreControls = false;
      this.app.stage.controls.enabled = true;
      return;
    }
    if (e.button !== 0) return;
    if (e.target !== this.el && !this.activePointer && !this.orbiting) return;
    const p = this.pointer(e);
    this.app.interaction.up(p);
    this.orbiting = false;
    if (this.activePointer !== null) {
      try {
        this.el.releasePointerCapture(this.activePointer);
      } catch {
        /* ignora */
      }
    }
    this.activePointer = null;
    this.app.stage.controls.enabled = true;
  }

  onDbl(e) {
    const p = this.pointer(e);
    const hit = this.app.picker.pick(p.ray, { screen: p.screen });
    if (hit.kind === 'device' || hit.kind === 'part') this.app.focusComponent(hit.compId);
  }

  onKey(e) {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
    const app = this.app;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (!app.isLab) {
      // tutorial: solo annulla, avanti/indietro e viste
      if (k === 'escape') app.interaction.cancel();
      else if ((k === 'enter' || k === 'arrowright') && app.tutorial) app.tutorial.keyNext();
      else if (k === 'arrowleft' && app.tutorial) app.tutorial.prev();
      else return;
      e.preventDefault();
      return;
    }
    if (ctrl && k === 'z') {
      e.preventDefault();
      app.undo();
    } else if (ctrl && (k === 'y' || (e.shiftKey && k === 'z'))) {
      e.preventDefault();
      app.redo();
    } else if (ctrl && k === 's') {
      e.preventDefault();
      app.saveFile();
    } else if (ctrl) {
      return;
    } else if (k === 'escape') {
      if (!app.interaction.cancel()) app.select(null);
    } else if (k === 'delete' || k === 'backspace') {
      app.deleteSelection();
    } else if (k === 'w') app.interaction.setTool(app.interaction.tool === 'wire' ? 'select' : 'wire');
    else if (k === 'v' || k === 's') app.interaction.setTool('select');
    else if (k === 'm') app.interaction.setTool(app.interaction.tool === 'measure' ? 'select' : 'measure');
    else if (k === 'f') app.focusSelection();
    else if (k === 'p') app.togglePower();
    else if (k === 'c') app.checksPanel?.show();
    else if (k === 'h' || k === '?') app.modals.help();
    else if (['1', '2', '3', '4', '5'].includes(k)) app.goView(['panoramica', 'quadro', 'utenze', 'lim', 'aula'][+k - 1]);
    else return;
    e.preventDefault();
  }
}
