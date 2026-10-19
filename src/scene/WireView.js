// Resa 3D dei conduttori: tubi lungo il percorso instradato, puntalini, evidenziazioni,
// animazione della corrente (corrente alternata “al rallentatore”) e mappa termica I/Iz.
import * as THREE from 'three';
import { smoothCurve, polylineLength } from './Router.js';
import { colorById, wireOuterDiameter, iz } from '../sim/norms.js';
import { flowTexture, MAT } from './materials.js';
import { cabs, carg } from '../sim/complex.js';

const baseMats = new Map();
function baseMat(colorId) {
  if (!baseMats.has(colorId)) {
    const c = colorById(colorId);
    let map = null;
    if (c.stripe) {
      const cv = document.createElement('canvas');
      cv.width = 64;
      cv.height = 16;
      const g = cv.getContext('2d');
      g.fillStyle = c.hex;
      g.fillRect(0, 0, 64, 16);
      g.fillStyle = c.stripe;
      g.fillRect(0, 0, 64, 6);
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
    }
    baseMats.set(colorId, new THREE.MeshStandardMaterial({ color: map ? 0xffffff : c.hex, map, roughness: 0.38, metalness: 0 }));
  }
  return baseMats.get(colorId);
}

const FERRULE_GEO = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 10);
  return g;
})();

export class WireView {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'wires';
    parent.add(this.group);
    this.items = new Map(); // id → { mesh, curve, length, wire }
    this.mode = 'normal';
    this.ferrules = null;
    this.flowTime = 0;
  }

  clear() {
    for (const it of this.items.values()) {
      it.mesh.geometry.dispose();
      if (it.ownMat) it.mesh.material.dispose();
      this.group.remove(it.mesh);
    }
    this.items.clear();
    if (this.ferrules) {
      this.group.remove(this.ferrules);
      this.ferrules.dispose();
      this.ferrules = null;
    }
  }

  /**
   * @param list [{ wire, points, jumper, ends:[{pos,dir},{pos,dir}] }]
   */
  build(list) {
    this.clear();
    const fer = [];
    for (const r of list) {
      const w = r.wire;
      const radius = (wireOuterDiameter(w.section) / 2) / 1000;
      const curve = smoothCurve(r.points, r.jumper ? 0.005 : 0.011);
      const len = polylineLength(r.points);
      const segs = Math.max(8, Math.min(520, Math.round(len / (len < 1.2 ? 0.005 : 0.009))));
      const geo = new THREE.TubeGeometry(curve, segs, radius, 7, false);
      const mat = baseMat(w.color);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.wireId = w.id;
      if (mat.map) {
        mat.map.repeat.set(Math.max(1, len / 0.05), 1);
      }
      this.group.add(mesh);
      this.items.set(w.id, { mesh, curve, length: len, wire: w, radius, ownMat: false });
      for (const e of r.ends) fer.push({ pos: e.pos, dir: e.dir, r: radius * 0.72 });
    }
    // puntalini (istanziati: un'unica chiamata di disegno)
    if (fer.length) {
      const im = new THREE.InstancedMesh(FERRULE_GEO, MAT.metalScrew, fer.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      fer.forEach((f, i) => {
        q.setFromUnitVectors(up, f.dir.clone().normalize());
        const p = f.pos.clone().addScaledVector(f.dir, 0.002);
        m.compose(p, q, new THREE.Vector3(f.r, 0.009, f.r));
        im.setMatrixAt(i, m);
      });
      im.castShadow = false;
      this.ferrules = im;
      this.group.add(im);
    }
    this.applyMode();
  }

  get meshes() {
    return [...this.items.values()].map((i) => i.mesh);
  }

  setHighlight(ids = [], selected = null) {
    const set = new Set(ids);
    for (const [id, it] of this.items) {
      const on = set.has(id) || id === selected;
      if (on && !it.hl) {
        this.ensureOwn(it);
        it.hl = true;
      } else if (!on && it.hl) it.hl = false;
    }
    this.selected = selected;
    this.highlighted = set;
    this.applyMode();
  }

  ensureOwn(it) {
    if (it.ownMat) return;
    const m = it.mesh.material.clone();
    if (m.map) m.map = m.map.clone();
    it.mesh.material = m;
    it.ownMat = true;
  }

  setMode(mode) {
    this.mode = mode;
    this.applyMode();
  }

  applyMode() {
    const flowT = flowTexture();
    for (const it of this.items.values()) {
      const needOwn = this.mode !== 'normal' || it.hl;
      if (needOwn) this.ensureOwn(it);
      if (!it.ownMat) continue;
      const m = it.mesh.material;
      if (this.mode === 'flow') {
        if (!m.emissiveMap || m.emissiveMap.source !== flowT.source) {
          m.emissiveMap = flowT.clone();
          m.emissiveMap.wrapS = m.emissiveMap.wrapT = THREE.RepeatWrapping;
          m.emissiveMap.repeat.set(Math.max(1, it.length / 0.035), 1);
          m.needsUpdate = true;
        }
      } else if (m.emissiveMap) {
        m.emissiveMap = null;
        m.needsUpdate = true;
      }
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 1;
      if (it.hl) {
        m.emissive.setHex(it.wire.id === this.selected ? 0xff6a1a : 0xffa04d);
        m.emissiveIntensity = it.wire.id === this.selected ? 0.9 : 0.55;
      }
    }
  }

  /**
   * Aggiorna animazioni in base alla soluzione del simulatore.
   * @param sim simulatore  @param dt passo  @param refPhase fase di riferimento (L1)
   */
  update(sim, dt) {
    if (this.mode === 'normal' || !sim) return;
    this.flowTime += dt;
    const w = Math.PI * 2 * 0.45; // 50 Hz mostrati a 0,45 Hz
    for (const it of this.items.values()) {
      const m = it.mesh.material;
      const I = sim.wireCurrent(it.wire.id);
      const mag = cabs(I);
      if (this.mode === 'flow') {
        if (!m.emissiveMap) continue;
        const on = mag > 0.002;
        const k = on ? Math.min(1, 0.25 + Math.log10(1 + mag * 10) / 2.2) : 0;
        if (!it.hl) {
          m.emissive.setHex(on ? 0xfff3b0 : 0x000000);
          m.emissiveIntensity = on ? 0.55 + k * 0.9 : 0;
        }
        // spostamento dei trattini: segue il valore istantaneo della corrente alternata
        const phase = carg(I);
        const amp = 0.9 * k;
        m.emissiveMap.offset.x = -amp * Math.sin(w * this.flowTime + phase) * 1.4;
      } else if (this.mode === 'heat') {
        const ratio = mag / Math.max(1e-3, iz(it.wire.section, 2));
        const col = new THREE.Color();
        if (ratio < 0.02) col.setRGB(0, 0, 0);
        else if (ratio < 0.5) col.setRGB(0.1, 0.6 * ratio * 2, 1 - ratio);
        else if (ratio < 1) col.setRGB((ratio - 0.5) * 2, 0.9, 0.1);
        else col.setRGB(1, Math.max(0, 1 - (ratio - 1) * 2), 0);
        if (!it.hl) {
          m.emissive.copy(col);
          m.emissiveIntensity = ratio < 0.02 ? 0 : 0.9;
        }
      }
    }
  }
}
