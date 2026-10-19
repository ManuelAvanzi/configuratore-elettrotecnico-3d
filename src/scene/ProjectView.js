// Vista 3D del progetto: modelli dei componenti montati, cablaggi instradati, stato visivo dalla simulazione,
// evidenziazioni (selezione, passaggio del puntatore, verifiche) e anteprima di posizionamento.
import * as THREE from 'three';
import { DEFS, modulesOf } from '../catalog/defs/index.js';
import { resolveParams } from '../catalog/defs/common.js';
import { buildModel, disposeModel, ghostify } from '../models/index.js';
import { Router, polylineLength } from './Router.js';
import { WireView } from './WireView.js';

const CORE_COLORS = { L1: '#6b3f24', L2: '#1d1f22', L3: '#8b9096', N: '#1f64c8', PE: '#3fae3a' };

export class ProjectView {
  constructor({ world, project, sim }) {
    this.world = world;
    this.project = project;
    this.sim = sim;
    this.devRoot = new THREE.Group();
    this.devRoot.name = 'devices';
    world.wallRoot.add(this.devRoot);
    this.models = new Map();
    this.router = new Router(world.ductNetwork());
    this.wireView = new WireView(world.wallRoot);
    this.terminals = [];
    this.termByKey = new Map();
    this.selected = null;
    this.hover = null;

    // cornici di selezione / passaggio
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff5900, depthTest: false, transparent: true }));
    this.selBox.renderOrder = 20;
    this.selBox.visible = false;
    this.hovBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.55 }));
    this.hovBox.renderOrder = 20;
    this.hovBox.visible = false;
    world.wallRoot.add(this.selBox, this.hovBox);
    this.flagBoxes = [];

    // indicatore del morsetto
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0058, 0.0011, 8, 28), new THREE.MeshBasicMaterial({ color: 0xff7c3a, depthTest: false, transparent: true }));
    ring.renderOrder = 21;
    ring.visible = false;
    world.wallRoot.add(ring);
    this.termRing = ring;
    const ring2 = ring.clone();
    ring2.material = ring.material.clone();
    ring2.material.color.setHex(0x46d17f);
    world.wallRoot.add(ring2);
    this.termRing2 = ring2;
    this.probeRings = [0xff4d4d, 0xe8edf2].map((c) => {
      const r = ring.clone();
      r.material = ring.material.clone();
      r.material.color.setHex(c);
      r.scale.setScalar(1.25);
      world.wallRoot.add(r);
      return r;
    });

    // cavo in corso di posa
    this.rubber = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x6b3f24, roughness: 0.4, transparent: true, opacity: 0.9 }));
    this.rubber.visible = false;
    world.wallRoot.add(this.rubber);

    // luci delle lampade (numero fisso per non ricompilare gli shader)
    this.lampLights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffe7c2, 0, 2.2, 1.8);
      world.root.add(l);
      return l;
    });
    this.ghost = null;
  }

  // ── Sincronizzazione con il progetto ──────────────────────────────────────────────
  sync() {
    const seen = new Set();
    for (const c of this.project.components) {
      const def = DEFS[c.type];
      if (!def) continue;
      const params = resolveParams(def, c.params);
      const key = JSON.stringify([c.type, params, c.tag]);
      let rec = this.models.get(c.id);
      if (!rec || rec.key !== key) {
        if (rec) this.dispose(rec);
        rec = { model: buildModel(def, params, c), key };
        this.devRoot.add(rec.model.group);
        this.models.set(c.id, rec);
      }
      rec.comp = c;
      rec.def = def;
      rec.params = params;
      rec.model.group.position.copy(this.originOf(def, params, c.mount));
      seen.add(c.id);
    }
    for (const [id, rec] of [...this.models]) {
      if (!seen.has(id)) {
        this.dispose(rec);
        this.models.delete(id);
      }
    }
    this.collectTerminals();
    this.rebuildWires();
    this.updateSupplyCores();
    if (this.selected && !this.models.has(this.selected)) this.selected = null;
    this.refreshBoxes();
  }

  dispose(rec) {
    this.devRoot.remove(rec.model.group);
    disposeModel(rec.model);
  }

  originOf(def, params, mount) {
    if (mount.kind === 'din') return this.world.dinOrigin(mount, modulesOf(def, params));
    if (mount.kind === 'field') return this.world.fieldOrigin(mount, def.span || 1);
    return this.world.fixedOrigin(mount.at);
  }

  collectTerminals() {
    this.terminals = [];
    this.termByKey.clear();
    for (const [id, rec] of this.models) {
      const g = rec.model.group;
      for (const [tid, t] of rec.model.terminals) {
        const item = {
          ref: { c: id, t: tid },
          key: id + '.' + tid,
          def: t.def,
          screw: t.screw.clone().add(g.position),
          entry: t.entry.clone().add(g.position),
          dir: t.dir.clone(),
          zone: rec.def.mount === 'field' ? 'field' : 'panel',
          rail: rec.comp.mount.kind === 'din' ? rec.comp.mount.rail : undefined,
          compId: id,
          world: new THREE.Vector3(),
        };
        this.terminals.push(item);
        this.termByKey.set(item.key, item);
      }
    }
    this.updateTerminalWorld();
  }

  updateTerminalWorld() {
    this.world.wallRoot.updateMatrixWorld(true);
    for (const t of this.terminals) t.world.copy(t.screw).applyMatrix4(this.world.wallRoot.matrixWorld);
  }

  rebuildWires() {
    const list = [];
    let lane = 0;
    for (const w of this.project.wires) {
      const A = this.termByKey.get(w.a.c + '.' + w.a.t);
      const B = this.termByKey.get(w.b.c + '.' + w.b.t);
      if (!A || !B) continue;
      const r = this.router.route({ pos: A.entry, dir: A.dir, zone: A.zone, rail: A.rail }, { pos: B.entry, dir: B.dir, zone: B.zone, rail: B.rail }, lane++);
      this.project.geomLen.set(w.id, polylineLength(r.points));
      list.push({ wire: w, points: r.points, jumper: r.jumper, ends: [{ pos: A.entry, dir: A.dir }, { pos: B.entry, dir: B.dir }] });
    }
    this.wireView.build(list);
    this.wireView.setHighlight(this.flagWires || [], this.selectedWire);
  }

  updateSupplyCores() {
    const sup = this.project.supply();
    const rec = sup && this.models.get(sup.id);
    if (!rec) return;
    const xs = [];
    const cols = [];
    for (const [tid, t] of rec.model.terminals) {
      xs.push(t.entry.x + rec.model.group.position.x);
      cols.push(CORE_COLORS[tid] || '#6b3f24');
    }
    this.world.setSupplyCores(xs, cols);
  }

  terminal(ref) {
    return this.termByKey.get(ref.c + '.' + ref.t);
  }

  // ── Selezione ed evidenziazioni ───────────────────────────────────────────────────
  boxFor(id, box) {
    const rec = this.models.get(id);
    if (!rec) return null;
    const b = new THREE.Box3();
    const inv = new THREE.Matrix4().copy(this.world.wallRoot.matrixWorld).invert();
    rec.model.group.updateMatrixWorld(true);
    rec.model.group.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      b.union(bb);
    });
    if (b.isEmpty()) return null;
    const size = b.getSize(new THREE.Vector3()).addScalar(0.006);
    box.position.copy(b.getCenter(new THREE.Vector3()));
    box.scale.copy(size);
    box.visible = true;
    return b;
  }

  setSelected(id) {
    this.selected = id;
    this.refreshBoxes();
  }
  setHover(id) {
    if (this.hover === id) return;
    this.hover = id;
    this.refreshBoxes();
  }
  refreshBoxes() {
    this.world.wallRoot.updateMatrixWorld(true);
    this.selBox.visible = false;
    this.hovBox.visible = false;
    if (this.selected) this.boxFor(this.selected, this.selBox);
    if (this.hover && this.hover !== this.selected) this.boxFor(this.hover, this.hovBox);
    for (const b of this.flagBoxes) b.visible = false;
    (this.flagComps || []).forEach((id, i) => {
      if (!this.flagBoxes[i]) {
        const fb = this.hovBox.clone();
        fb.material = new THREE.LineBasicMaterial({ color: 0xffc14d, depthTest: false, transparent: true });
        this.world.wallRoot.add(fb);
        this.flagBoxes.push(fb);
      }
      this.boxFor(id, this.flagBoxes[i]);
    });
  }

  /** Evidenzia componenti e cavi (es. dalle verifiche) */
  flag(comps = [], wires = []) {
    this.flagComps = comps;
    this.flagWires = wires;
    this.refreshBoxes();
    this.wireView.setHighlight(wires, this.selectedWire);
  }

  setSelectedWire(id) {
    this.selectedWire = id;
    this.wireView.setHighlight(this.flagWires || [], id);
  }

  showTerminal(ring, t) {
    if (!t) {
      ring.visible = false;
      return;
    }
    ring.visible = true;
    ring.position.copy(t.screw);
    ring.position.z += 0.0012;
  }

  /** Cavo provvisorio dal morsetto di partenza al puntatore */
  showRubber(fromTerm, toLocal, colorHex, radius = 0.0015) {
    if (!fromTerm || !toLocal) {
      this.rubber.visible = false;
      return;
    }
    const a = fromTerm.entry.clone();
    const b = toLocal.clone();
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= Math.min(0.12, a.distanceTo(b) * 0.25);
    mid.z = Math.max(a.z, b.z) + 0.03;
    const curve = new THREE.QuadraticBezierCurve3(a.clone().addScaledVector(fromTerm.dir, 0.01), mid, b);
    this.rubber.geometry.dispose();
    this.rubber.geometry = new THREE.TubeGeometry(curve, 40, radius, 6);
    this.rubber.material.color.set(colorHex);
    this.rubber.visible = true;
  }

  // ── Anteprima di posizionamento ───────────────────────────────────────────────────
  showGhost(type, params, mount, ok) {
    const def = DEFS[type];
    const key = type + JSON.stringify(params);
    if (!this.ghost || this.ghost.key !== key) {
      this.hideGhost();
      const m = buildModel(def, resolveParams(def, params), { id: '__ghost', tag: def.tag + '?' });
      ghostify(m, ok);
      m.group.traverse((o) => {
        o.userData.ghost = true;
        o.raycast = () => {};
      });
      this.ghost = { model: m, key, def };
      this.devRoot.add(m.group);
    }
    const m = this.ghost.model;
    if (!mount) {
      m.group.visible = false;
      return;
    }
    m.group.visible = true;
    m.group.position.copy(this.originOf(def, resolveParams(def, params), mount));
    m.ghostMat.color.setHex(ok ? 0x46d17f : 0xff5d62);
  }

  hideGhost() {
    if (!this.ghost) return;
    this.devRoot.remove(this.ghost.model.group);
    disposeModel(this.ghost.model);
    this.ghost = null;
  }

  // ── Picking ───────────────────────────────────────────────────────────────────────
  pickMeshes() {
    const out = [];
    for (const rec of this.models.values()) {
      rec.model.group.traverse((o) => {
        if (o.isMesh) out.push(o);
      });
    }
    return out;
  }

  // ── Aggiornamento per fotogramma ──────────────────────────────────────────────────
  update(dt, t) {
    const sim = this.sim;
    const lamps = [];
    for (const [id, rec] of this.models) {
      const inst = sim.getInst(id);
      rec.model.update(inst, dt, t);
      if (rec.def.type === 'lamp' && inst && (inst.view.bright || 0) > 0.05) lamps.push({ rec, b: inst.view.bright });
    }
    lamps.sort((a, b) => b.b - a.b);
    this.lampLights.forEach((l, i) => {
      const it = lamps[i];
      if (!it) {
        l.intensity = 0;
        return;
      }
      const p = it.rec.model.light.pos.clone().add(it.rec.model.group.position);
      this.world.wallRoot.localToWorld(p);
      l.position.copy(p);
      l.color.set(it.rec.model.light.color);
      l.intensity = Math.min(1.3, it.b) * 1.6;
    });
    this.wireView.update(sim, dt);
  }
}
