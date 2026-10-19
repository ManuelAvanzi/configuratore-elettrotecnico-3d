// Strumenti di lavoro (comuni a mouse e controller VR):
//   select  → seleziona, trascina i componenti, aziona leve e pulsanti, clic su un morsetto = inizia un cavo
//   wire    → posa dei cavi da morsetto a morsetto
//   measure → multimetro (tensione tra due morsetti) e pinza amperometrica (corrente in un cavo)
//   place   → posizionamento di un nuovo componente dalla libreria
import * as THREE from 'three';
import { DEFS } from '../catalog/defs/index.js';
import { resolveParams } from '../catalog/defs/common.js';
import { colorById } from '../sim/norms.js';

const DRAG_PX = 6;
const DRAG_ANGLE = 0.02;

export class Interaction {
  constructor(app) {
    this.app = app;
    this.tool = 'select';
    this.placeType = null;
    this.placeParams = {};
    this.wireStart = null;
    this.probes = [];
    this.clamp = null;
    this.pressed = new Map(); // sorgente → parte premuta
    this.downs = new Map(); // sorgente → stato del clic
    this.hover = null;
    this.wireOpts = { color: 'brown', section: 1.5, auto: true };
    /**
     * Filtro opzionale (usato dal tutorial): { allow(hit, phase) → bool, intercept(p, hit) → bool, onBlocked(hit) }
     * Gli elementi non ammessi non reagiscono al puntatore; il clic su di essi chiama onBlocked.
     */
    this.guard = null;
  }

  filtered(hit, phase) {
    if (!this.guard || !hit.kind) return hit;
    if (this.guard.allow(hit, phase)) return hit;
    return { kind: null, point: hit.point, blocked: hit };
  }

  get view() {
    return this.app.view;
  }
  get picker() {
    return this.app.picker;
  }
  get project() {
    return this.app.project;
  }

  setTool(tool, opts = {}) {
    if (this.tool === 'place' && tool !== 'place') this.view.hideGhost();
    this.tool = tool;
    this.wireStart = null;
    this.view.showRubber(null);
    this.view.showTerminal(this.view.termRing2, null);
    if (tool !== 'measure') this.clearProbes();
    if (tool === 'place') {
      this.placeType = opts.type;
      this.placeParams = opts.params || {};
    } else {
      this.placeType = null;
    }
    this.app.emit('tool', tool);
    this.app.emit('hint');
  }

  clearProbes() {
    this.probes = [];
    this.clamp = null;
    this.view.probeRings.forEach((r) => (r.visible = false));
    this.app.emit('measure');
  }

  cancel() {
    if (this.wireStart) {
      this.wireStart = null;
      this.view.showRubber(null);
      this.view.showTerminal(this.view.termRing2, null);
      this.app.emit('hint');
      return true;
    }
    if (this.tool === 'place') {
      this.setTool('select');
      return true;
    }
    if (this.tool === 'measure' && (this.probes.length || this.clamp)) {
      this.clearProbes();
      return true;
    }
    if (this.tool !== 'select') {
      this.setTool('select');
      return true;
    }
    return false;
  }

  // ── Eventi del puntatore ──────────────────────────────────────────────────────────
  /** @param p { id, ray, screen?, angle? } */
  down(p) {
    const hit = this.filtered(this.picker.pick(p.ray, { screen: p.screen }), 'down');
    const st = { hit, x: p.screen?.x, y: p.screen?.y, dir: p.ray.direction.clone(), moved: false, drag: null };
    this.downs.set(p.id, st);
    const canDrag = this.tool === 'select' && this.app.isLab;
    if (this.tool === 'place') return true;
    if (hit.kind === 'part') {
      if (hit.momentary) {
        this.pressed.set(p.id, hit);
        this.doInteract(hit.compId, hit.action, 'down');
      } else if (canDrag) {
        const c = this.project.comp(hit.compId);
        if (c && !DEFS[c.type].fixed) st.drag = { compId: hit.compId, active: false };
      }
      return true;
    }
    if (hit.kind === 'terminal') return true;
    if (hit.kind === 'device') {
      if (canDrag) {
        const c = this.project.comp(hit.compId);
        if (c && !DEFS[c.type].fixed) st.drag = { compId: hit.compId, active: false };
      }
      return true;
    }
    if (hit.kind === 'wire') return true;
    return !!this.wireStart;
  }

  move(p) {
    const st = this.downs.get(p.id);
    if (st && !st.moved) {
      if (p.screen && st.x !== undefined) st.moved = Math.hypot(p.screen.x - st.x, p.screen.y - st.y) > DRAG_PX;
      else st.moved = st.dir.angleTo(p.ray.direction) > (p.id.startsWith('xr') ? DRAG_ANGLE * 2.5 : DRAG_ANGLE);
    }
    // Trascinamento di un componente
    if (st?.drag && st.moved) {
      st.drag.active = true;
      const c = this.project.comp(st.drag.compId);
      const m = this.computePlacement(p.ray, c.type, c.params, c.id);
      st.drag.mount = m?.ok ? m.mount : null;
      this.view.showGhost(c.type, c.params, m?.mount || null, !!m?.ok);
      this.app.emit('hover', { kind: 'drag', comp: c, ok: !!m?.ok, reason: m?.reason, screen: p.screen });
      return;
    }
    // Posizionamento dalla libreria
    if (this.tool === 'place' && this.placeType) {
      const m = this.computePlacement(p.ray, this.placeType, this.placeParams, null);
      this.lastPlace = m;
      this.view.showGhost(this.placeType, this.placeParams, m?.mount || null, !!m?.ok);
      this.app.emit('hover', { kind: 'place', type: this.placeType, ok: !!m?.ok, reason: m?.reason, screen: p.screen });
      return;
    }
    const hit = this.filtered(this.picker.pick(p.ray, { screen: p.screen }), 'hover');
    this.setHover(hit, p);
    if (this.wireStart) {
      const target = hit.kind === 'terminal' ? hit.term.entry : this.picker.wallPoint(p.ray, 0.09);
      const col = colorById(this.autoColor(this.wireStart, hit.kind === 'terminal' ? hit.term : null)).hex;
      this.view.showRubber(this.wireStart, target, col);
    }
  }

  up(p) {
    const st = this.downs.get(p.id);
    this.downs.delete(p.id);
    const pressed = this.pressed.get(p.id);
    if (pressed) {
      this.pressed.delete(p.id);
      this.doInteract(pressed.compId, pressed.action, 'up');
      return;
    }
    if (!st) {
      // rilascio dopo un trascinamento dalla libreria
      if (this.tool === 'place' && this.app.dragFromLibrary) {
        this.app.dragFromLibrary = false;
        this.click(p, { kind: null });
      }
      return;
    }
    this.app.dragFromLibrary = false;
    if (st.drag?.active) {
      this.view.hideGhost();
      if (st.drag.mount) {
        const ok = this.project.moveComponent(st.drag.compId, st.drag.mount);
        if (ok) this.app.sfx('place');
      } else this.app.toast('Posizione non valida: il componente torna al suo posto.', 'warn');
      this.app.emit('hover', null);
      return;
    }
    if (st.moved && !(this.tool === 'place')) return; // era una rotazione della vista
    this.click(p, st.hit);
  }

  click(p, hit) {
    if (this.guard?.intercept?.(p, hit)) return;
    if (hit.blocked) {
      this.guard?.onBlocked?.(hit.blocked);
      return;
    }
    if (this.tool === 'place') {
      const m = this.computePlacement(p.ray, this.placeType, this.placeParams, null);
      if (m?.ok) {
        const c = this.project.addComponent(this.placeType, m.mount, this.placeParams);
        if (c) {
          this.app.sfx('place');
          this.app.select({ comp: c.id });
          if (!p.keepPlacing) this.setTool('select');
        }
      } else {
        this.app.toast(m?.reason || 'Punta una guida DIN libera del quadro o una posizione del pannello utenze.', 'warn');
      }
      return;
    }
    if (hit.kind === 'part') {
      this.app.select({ comp: hit.compId });
      if (!hit.momentary) this.doInteract(hit.compId, hit.action, 'click');
      return;
    }
    if (hit.kind === 'terminal') {
      if (this.tool === 'measure') return this.addProbe(hit.term);
      return this.wireClick(hit.term);
    }
    if (hit.kind === 'wire') {
      if (this.tool === 'measure') {
        this.clamp = hit.wireId;
        this.probes = [];
        this.view.probeRings.forEach((r) => (r.visible = false));
        this.app.emit('measure');
        return;
      }
      if (this.wireStart) return;
      this.app.select({ wire: hit.wireId });
      return;
    }
    if (hit.kind === 'device') {
      if (this.wireStart) return;
      this.app.select({ comp: hit.compId });
      return;
    }
    if (this.wireStart) {
      this.cancel();
      return;
    }
    this.app.select(null);
  }

  doInteract(compId, action, phase) {
    const r = this.app.sim.interact(compId, action, phase);
    if (r?.sound) this.app.sfx(r.sound);
    if (r?.msg) this.app.toast(r.msg, r.level || 'info');
    this.app.emit('sim');
  }

  // ── Cablaggio ─────────────────────────────────────────────────────────────────────
  wireClick(term) {
    if (!this.wireStart) {
      this.wireStart = term;
      this.view.showTerminal(this.view.termRing2, term);
      this.app.emit('hint');
      this.app.sfx('click');
      return;
    }
    if (this.wireStart.key === term.key) {
      this.cancel();
      return;
    }
    const color = this.autoColor(this.wireStart, term);
    const section = this.wireOpts.auto ? this.autoSection(this.wireStart, term) : this.wireOpts.section;
    const r = this.project.addWire(this.wireStart.ref, term.ref, { color, section });
    if (r.error) {
      this.app.toast(r.error, 'warn');
      return;
    }
    this.app.sfx('wire');
    const n = this.project.wiresAt(term.ref).length;
    if (n > 2) this.app.toast(`Sul morsetto ${this.label(term)} ci sono ${n} conduttori: al massimo 2 per morsetto.`, 'warn');
    this.wireStart = null;
    this.view.showRubber(null);
    this.view.showTerminal(this.view.termRing2, null);
    this.app.select({ wire: r.wire.id }, { silent: true });
    this.app.emit('hint');
  }

  autoColor(a, b) {
    if (!this.wireOpts.auto) return this.wireOpts.color;
    const roles = [a?.def.role, b?.def.role];
    if (roles.includes('PE')) return 'yg';
    if (roles.includes('N')) return 'blue';
    if (roles.includes('coil') || roles.includes('aux') || roles.includes('ctrl')) return 'red';
    return this.wireOpts.color === 'yg' || this.wireOpts.color === 'blue' ? 'brown' : this.wireOpts.color;
  }

  autoSection(a, b) {
    const types = [a, b].map((t) => this.project.comp(t.ref.c)?.type);
    const roles = [a.def.role, b.def.role];
    if (types.includes('supply')) return this.project.params('XA').sys === '3F' ? 6 : 6;
    if (types.includes('xs')) return 2.5;
    if (roles.includes('coil') || roles.includes('aux') || roles.includes('ctrl')) return 1;
    return this.wireOpts.section;
  }

  label(t) {
    return `${this.project.comp(t.ref.c)?.tag}:${t.def.label}`;
  }

  // ── Misure ────────────────────────────────────────────────────────────────────────
  addProbe(term) {
    this.clamp = null;
    if (this.probes.length >= 2) this.probes = [];
    this.probes.push(term);
    this.view.probeRings.forEach((r, i) => this.view.showTerminal(r, this.probes[i] || null));
    this.app.sfx('click');
    this.app.emit('measure');
  }

  // ── Posizionamento ────────────────────────────────────────────────────────────────
  computePlacement(ray, type, params, ignoreId) {
    const def = DEFS[type];
    const pl = this.picker.pickPlace(ray);
    if (!pl) return null;
    const pp = resolveParams(def, params);
    if (pl.place.kind !== def.mount) {
      return { mount: null, ok: false, reason: def.mount === 'din' ? `${def.short}: va montato su una guida DIN del quadro.` : `${def.short}: va montato sul pannello utenze.` };
    }
    if (pl.place.kind === 'din') {
      const w = this.project.widthOf(type, pp);
      const raw = this.app.world.dinPosFromX(pl.local.x, w);
      const m = this.project.nearestFreeDin(type, pp, pl.place.rail, raw, ignoreId);
      if (!m || Math.abs(m.pos - raw) > 3) return { mount: m, ok: false, reason: 'Guida occupata: libera spazio o scegli un’altra guida.' };
      return { mount: m, ok: true };
    }
    const span = def.span || 1;
    const col = Math.max(0, Math.min(5 - span, this.app.world.fieldColFromX(pl.local.x, span)));
    const m = { kind: 'field', row: pl.place.row, col };
    const ok = this.project.canPlace(type, pp, m, ignoreId);
    return { mount: m, ok, reason: ok ? null : 'Posizione occupata.' };
  }

  // ── Passaggio del puntatore ───────────────────────────────────────────────────────
  setHover(hit, p) {
    const v = this.view;
    this.hover = hit;
    v.setHover(hit.kind === 'device' || hit.kind === 'part' ? hit.compId : hit.kind === 'terminal' ? hit.term.compId : null);
    v.showTerminal(v.termRing, hit.kind === 'terminal' ? hit.term : null);
    this.app.emit('hover', { ...hit, screen: p.screen });
  }
}
