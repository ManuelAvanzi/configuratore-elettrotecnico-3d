// Costruzione del modello 3D di un componente a partire da tipo e parametri.
import * as THREE from 'three';
import { buildDinModel, buildPebarModel } from './dinTypes.js';
import { buildFieldModel } from './field.js';

/**
 * @returns {{ group:THREE.Group, terminals:Map, parts:object, interactive:THREE.Mesh[], update:Function }}
 */
export function buildModel(def, params, comp) {
  let m;
  if (def.type === 'pebar') m = buildPebarModel(def, params);
  else if (def.mount === 'din') m = buildDinModel(def, params, comp);
  else m = buildFieldModel(def, params, comp);
  m.group.userData.compId = comp.id;
  m.group.traverse((o) => {
    o.userData.compId = comp.id;
  });
  for (const i of m.interactive) i.userData.interactive = true;
  if (!m.update) m.update = () => {};
  return m;
}

export function disposeModel(m) {
  const seen = new Set();
  m.group.traverse((o) => {
    if (!(o.isMesh || o.isSprite)) return;
    if (o.isMesh) o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat) || mat.userData?.shared) continue;
      seen.add(mat);
      // i materiali condivisi (MAT.*) restano in cache; si liberano quelli propri del modello
      if (mat.map && !mat.map.userData?.shared) mat.map.dispose();
      mat.dispose();
    }
  });
}

/** Materiale semitrasparente per l'anteprima di posizionamento */
export function ghostify(m, ok = true) {
  const mat = new THREE.MeshBasicMaterial({ color: ok ? 0x46d17f : 0xff5d62, transparent: true, opacity: 0.45, depthWrite: false });
  const old = new Set();
  m.group.traverse((o) => {
    if (o.isMesh) {
      if (!o.material.userData?.shared) old.add(o.material);
      o.material = mat;
      o.castShadow = false;
      o.renderOrder = 10;
    }
    if (o.isSprite) o.visible = false;
  });
  for (const o of old) {
    if (o.map && !o.map.userData?.shared) o.map.dispose();
    o.dispose();
  }
  m.ghostMat = mat;
  return m;
}
