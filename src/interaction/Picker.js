// Individua cosa c'è sotto il puntatore (mouse o raggio del controller VR):
// morsetti (con tolleranza generosa), parti azionabili (leve, pulsanti), dispositivi, cavi, superfici di posa.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Picker {
  constructor({ view, world, camera }) {
    this.view = view;
    this.world = world;
    this.camera = camera;
    this.ray = new THREE.Raycaster();
    this.ray.far = 30;
    this.extra = []; // pannelli UI in VR
    this.meshCache = null;
  }

  invalidate() {
    this.meshCache = null;
  }

  targets() {
    if (!this.meshCache) this.meshCache = [...this.view.pickMeshes(), ...this.view.wireView.meshes, ...this.world.interactive];
    return this.meshCache;
  }

  /**
   * @param {THREE.Ray} ray
   * @param {{ screen?:{x:number,y:number,w:number,h:number}, place?:boolean, terminals?:boolean, floor?:boolean }} opts
   */
  pick(ray, opts = {}) {
    this.ray.ray.copy(ray);
    const out = { kind: null, point: null };

    // Pannelli UI (VR)
    if (this.extra.length) {
      const ui = this.ray.intersectObjects(this.extra, false)[0];
      if (ui) return { kind: 'ui', hit: ui, point: ui.point, object: ui.object };
    }

    const hits = this.ray.intersectObjects(this.targets(), false).filter((h) => h.object.visible && !h.object.userData.ghost);
    const first = hits[0] || null;

    // Morsetti
    if (opts.terminals !== false) {
      const t = opts.screen ? this.terminalScreen(opts.screen, first) : this.terminalRay(ray, first);
      if (t) return { kind: 'terminal', term: t, point: t.world.clone(), compId: t.compId };
    }

    if (first) {
      const o = first.object;
      out.point = first.point;
      if (o.userData.action && o.userData.interactive !== false && (o.userData.interactive || o.parent)) {
        return { kind: 'part', action: o.userData.action, momentary: !!o.userData.momentary, compId: o.userData.compId, object: o, point: first.point, hint: o.userData.hint };
      }
      if (o.userData.wireId) return { kind: 'wire', wireId: o.userData.wireId, point: first.point, object: o };
      if (o.userData.compId) return { kind: 'device', compId: o.userData.compId, point: first.point, object: o };
    }
    return out;
  }

  /** Superficie di posa (guida DIN o riga del pannello) colpita dal raggio */
  pickPlace(ray) {
    this.ray.ray.copy(ray);
    const h = this.ray.intersectObjects(this.world.pickSurfaces, false)[0];
    if (!h) return null;
    const local = this.world.wallRoot.worldToLocal(h.point.clone());
    return { place: h.object.userData.place, local, point: h.point };
  }

  pickFloor(ray) {
    this.ray.ray.copy(ray);
    return this.ray.intersectObjects(this.world.teleportSurfaces, false)[0] || null;
  }

  /** Punto del raggio sul piano frontale del banco (per il cavo provvisorio) */
  wallPoint(ray, z = 0.1) {
    const m = this.world.wallRoot.matrixWorld;
    const origin = this.world.wallRoot.worldToLocal(ray.origin.clone());
    const dir = ray.direction.clone().transformDirection(new THREE.Matrix4().copy(m).invert());
    if (Math.abs(dir.z) < 1e-4) return null;
    const t = (z - origin.z) / dir.z;
    if (t < 0) return null;
    return origin.addScaledVector(dir, t);
  }

  terminalScreen(screen, first) {
    const cam = this.camera;
    let best = null;
    let bd = 15 * 15;
    const firstDist = first ? first.distance : Infinity;
    for (const t of this.view.terminals) {
      _p.copy(t.world).project(cam);
      if (_p.z > 1) continue;
      const sx = ((_p.x + 1) / 2) * screen.w;
      const sy = ((1 - _p.y) / 2) * screen.h;
      const d = (sx - screen.x) ** 2 + (sy - screen.y) ** 2;
      if (d < bd) {
        const dist = t.world.distanceTo(cam.getWorldPosition(_v));
        if (dist > firstDist + 0.03) continue; // nascosto da qualcosa davanti
        bd = d;
        best = t;
      }
    }
    return best;
  }

  terminalRay(ray, first) {
    const s = this.world.scale;
    const tol = 0.0075 * s;
    let best = null;
    let bd = Infinity;
    const firstDist = first ? first.distance : Infinity;
    for (const t of this.view.terminals) {
      const along = _v.copy(t.world).sub(ray.origin).dot(ray.direction);
      if (along < 0) continue;
      const d = ray.distanceSqToPoint(t.world);
      if (d < tol * tol && along < firstDist + 0.03) {
        const score = d + along * 1e-6;
        if (score < bd) {
          bd = score;
          best = t;
        }
      }
    }
    return best;
  }
}
