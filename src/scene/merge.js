// Ottimizzazione delle chiamate di disegno: unisce le mesh statiche di un gruppo in un'unica mesh per materiale.
// Le parti azionabili o animate (userData.action / userData.dynamic, e i loro discendenti) restano separate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function isDynamic(o, stopAt) {
  for (let p = o; p && p !== stopAt; p = p.parent) {
    if (p.userData.action || p.userData.dynamic || p.userData.place || p.userData.teleport) return true;
  }
  return false;
}

export function mergeStatic(root, { exclude = [] } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skip = new Set(exclude);
  const buckets = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
    if (!o.visible || skip.has(o) || isDynamic(o, root)) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (skip.has(p)) return;
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    g.clearGroups();
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, geos: [] });
    buckets.get(key).geos.push(g);
    victims.push(o);
  });
  if (victims.length < 2) return 0;
  for (const o of victims) {
    o.parent.remove(o);
    o.geometry.dispose();
  }
  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (b.geos.length > 1) b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.renderOrder = b.order;
    m.name = 'merged';
    root.add(m);
  }
  return victims.length - buckets.size;
}

/** Rimuove i gruppi vuoti rimasti dopo l'unione */
export function pruneEmpty(root) {
  const empty = [];
  root.traverse((o) => {
    if (o !== root && o.type === 'Group' && o.children.length === 0 && !o.userData.dynamic) empty.push(o);
  });
  for (const o of empty) o.parent?.remove(o);
}
