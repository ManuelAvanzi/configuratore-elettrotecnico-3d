// Copertine dei componenti per la libreria: render dei modelli 3D veri su un canvas dedicato.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildModel, disposeModel } from '../models/index.js';
import { resolveParams } from '../catalog/defs/common.js';

export function renderThumbnails(defs, { w = 320, h = 240 } = {}) {
  const out = {};
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.05;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1, 2, 3);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.3));
  const cam = new THREE.PerspectiveCamera(28, w / h, 0.001, 10);

  for (const def of defs) {
    if (def.fixed) continue;
    const params = resolveParams(def, def.thumbParams || {});
    let m;
    try {
      m = buildModel(def, params, { id: 'thumb', tag: def.tag + '1' });
    } catch (e) {
      console.warn('copertina', def.type, e);
      continue;
    }
    scene.add(m.group);
    m.update?.(null, 0, 0);
    const box = new THREE.Box3().setFromObject(m.group);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = size.length() / 2;
    const dir = new THREE.Vector3(0.42, 0.26, 1).normalize();
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.82;
    cam.position.copy(c).addScaledVector(dir, dist);
    cam.lookAt(c);
    cam.near = dist / 50;
    cam.far = dist * 5;
    cam.updateProjectionMatrix();
    r.render(scene, cam);
    out[def.type] = r.domElement.toDataURL('image/png');
    scene.remove(m.group);
    disposeModel(m);
  }
  pm.dispose();
  scene.environment?.dispose();
  r.dispose();
  r.forceContextLoss();
  return out;
}
