// Serigrafie, dotazioni e animazioni di ciascun tipo di dispositivo DIN.
import * as THREE from 'three';
import { MAT } from '../scene/materials.js';
import { buildModular, animateLever, setEmissive, drawLCD, LENS_COLORS } from './din.js';
import { modulesOf } from '../catalog/defs/index.js';
import { fmt } from '../sim/norms.js';

const INK = '#23272c';
const it = (n, d = 2) => fmt(n, d);

function tagBox(p, tag, y, w) {
  p.rect(0, y, Math.min(w - 2.4, 22), 5.6, '#ffffff', 0.8);
  p.strokeRect(0, y, Math.min(w - 2.4, 22), 5.6, '#c9ccd0', 0.25, 0.8);
  p.text(tag, 0, y + 0.1, 3.9, { weight: 800, color: '#111' , maxW: w - 3.5 });
}

function leverSlot(p, w, y = 0, h = 15) {
  p.rect(0, y, w - 3.2, h, '#d9dad6', 1.2);
  p.rect(0, y, w - 5.2, h - 3, '#2a2d31', 0.8);
}

const ON_OFF = (p, w) => {
  p.text('I', -w / 2 + 2.6, 10.3, 2.6, { weight: 800, color: '#c0392b' });
  p.text('O', -w / 2 + 2.6, -10.3, 2.6, { weight: 800, color: '#2e7d32' });
};

// ── Specifiche per tipo ──────────────────────────────────────────────────────────────
const SPECS = {
  imd(def, p, comp) {
    return {
      led: { x: 0.012, y: 0.006, color: '#ff4d4d' },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.text('CONTROLLO', 0, 11.5, 2.4, { weight: 800 });
        pt.text('ISOLAMENTO', 0, 8.3, 2.4, { weight: 800 });
        pt.rect(-6, 1, 17, 7, '#1d2227', 0.8);
        pt.text('kΩ', -6, 0.2, 2.6, { weight: 700, color: '#7fe3a0' });
        pt.text(`soglia ${p.soglia} kΩ`, 0, -6.5, 2.1, { weight: 600 });
        pt.text('IT · 11-14 allarme', 0, -11, 2, { weight: 600, color: '#555' });
        pt.symEarth(d.w / 2 - 5, -15.5, 0.8);
      },
    };
  },

  ats(def, p, comp) {
    return {
      led: { x: -0.018, y: 0.004, color: '#35d46a' },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.text('COMMUTATORE AUTOMATICO', 0, 11.5, 2.4, { weight: 800 });
        pt.text('ATS', 0, 7.2, 3.4, { weight: 800, color: '#0f3d80' });
        pt.rect(-24, 0, 26, 8, '#e4e5e1', 1);
        pt.text('NORMALE', -24, -0.2, 2.2, { weight: 800, color: '#1c7a47' });
        pt.rect(24, 0, 26, 8, '#e4e5e1', 1);
        pt.text('EMERGENZA', 24, -0.2, 2.2, { weight: 800, color: '#b3262c' });
        pt.text(`commuta dopo ${p.ritardo} s · ritorno ${p.ritorno} s`, 0, -7, 2, { weight: 600 });
        pt.text('1-3-5-N1 · 7-9-11-N3  →  2-4-6-N2', 0, -11.5, 2, { weight: 700, color: '#333' });
        pt.text('Quadro di emergenza', 0, -16, 2, { weight: 600, color: '#555' });
      },
    };
  },

  ups(def, p, comp) {
    return {
      led: { x: 0.012, y: 0.006, color: '#35d46a' },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.text('UPS', 0, 10.5, 4, { weight: 800, color: '#0f3d80' });
        pt.text(`${p.Sn} kVA · ${p.aut} min`, 0, 5, 2.4, { weight: 700 });
        pt.rect(0, -2, 30, 7, '#1d2227', 0.8);
        pt.text('BATTERIA', 0, -2.4, 2.4, { weight: 700, color: '#7fe3a0' });
        pt.text('1-N1 rete · 2-N2 uscita', 0, -9.5, 2, { weight: 700, color: '#333' });
        pt.text('Gruppo di continuità', 0, -14.5, 2, { weight: 600, color: '#555' });
      },
    };
  },

  kls(def, p, comp) {
    return {
      led: { x: 0.008, y: 0.005, color: '#ffb020' },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.text('DISTACCO', 0, 11.5, 2.4, { weight: 800 });
        pt.text('CARICHI', 0, 8.3, 2.4, { weight: 800 });
        pt.text(p.mode === 'freq' ? `f < fn − ${p.df} Hz` : `> ${p.soglia} %`, 0, 1, 2.6, { weight: 800, color: '#0f3d80' });
        pt.text(`ritardo ${p.ritardo} s`, 0, -4.5, 2.1, { weight: 600 });
        pt.text('11-12 NC · 11-14 NA', 0, -10, 2, { weight: 700 });
        pt.text('Load shedding', 0, -15, 2, { weight: 600, color: '#555' });
      },
    };
  },

  supply(def, p, comp, terms) {
    const tri = p.sys === '3F';
    return {
      bodyMat: MAT.plasticGrey,
      bg: '#c3c7cb',
      paint(pt, d) {
        tagBox(pt, comp.tag, 16.5, d.w);
        pt.text('ARRIVO LINEA', 0, 8.5, 3.2, { weight: 800 });
        pt.text(tri ? '3~ 400 V + N' : '1~ 230 V', 0, 3, 3.1, { weight: 700, color: '#0f3d80' });
        pt.text('50 Hz · sistema ' + p.earth, 0, -2.4, 2.3, { weight: 600 });
        pt.text(`Pc ${it(p.Pc, p.Pc % 1 ? 1 : 0)} kW · Icc ${it(p.Icc, 1)} kA`, 0, -7.5, 2.2, { weight: 600 });
        pt.symEarth(d.w / 2 - 5, -15, 0.9);
        pt.text('dal contatore', -4, -15.5, 2, { weight: 600, color: '#555' });
        // morsetti di arrivo (in alto)
        for (const t of terms) pt.text(t.label, (t.x - 0.5) * d.w, d.noseH / 2 + 3.2, 2.6, { weight: 800 });
      },
      topDecor: true,
    };
  },

  term(def, p, comp) {
    const col = { L: '#8d949b', N: '#2e6fd3', PE: '#3aa845' }[p.func];
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
    return {
      profile: 'terminal',
      bodyMat: mat,
      bg: p.func === 'PE' ? '#3aa845' : col,
      termLabels: false,
      paint(pt, d) {
        if (p.func === 'PE') {
          for (let y = -28; y < 28; y += 4) pt.rect(0, y, d.w, 1.6, '#f2d21b');
        }
        pt.rect(0, 0, d.w - 1.2, 16, '#ffffff', 0.6);
        const g = pt.g;
        g.save();
        g.translate(pt.X(0), pt.Y(0));
        g.rotate(-Math.PI / 2);
        g.fillStyle = '#111';
        g.font = `800 ${3.4 * pt.k}px Manrope, Arial`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(comp.tag, 0, 0);
        g.restore();
      },
    };
  },

  isol2p: isolSpec,
  isol4p: isolSpec,
  mcb1pn: mcbSpec,
  mcb3p: mcbSpec,
  mcb4p: mcbSpec,
  rcd2p: rcdSpec,
  rcd4p: rcdSpec,

  rcbo1pn(def, p, comp) {
    return {
      lever: { color: 'dark' },
      test: true,
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.text(`${p.curve}${p.In}`, -5, 12.2, 4.4, { weight: 800 });
        pt.text(`${fmt(p.IDn * 1000, 0)} mA`, 7.5, 12.3, 2.6, { weight: 800, color: '#0f3d80' });
        leverSlot(pt, d.w, 0, 14);
        ON_OFF(pt, d.w);
        pt.strokeRect(-7, -13.2, 11, 4.2, INK, 0.3);
        pt.text(String(p.pdi * 1000), -7, -13.2, 2.4, { weight: 700 });
        pt.text('T', d.w / 2 - 5.2, -11.2, 2.2, { weight: 800 });
        pt.text(`tipo ${p.rtype}`, 0, -19.3, 1.9, { weight: 600, color: '#555' });
        pt.symBreaker(4, -14.5, 0.55, { rcd: true });
      },
    };
  },

  fr3(def, p, comp) {
    return {
      profile: 'industrial',
      bodyMat: MAT.industrialGrey,
      bg: '#9aa1a8',
      dials: [{ x: -0.0135, y: 0.008, r: 0.0055, color: 'blue', angle: -0.6 + (Math.log(p.Ir) / Math.log(10)) * 1.2 }],
      windowInd: { x: -0.0135, y: -0.012, w: 0.008, h: 0.0045 },
      extraButtons: [
        { x: 0.012, y: 0.011, r: 0.0042, mat: MAT.plasticBlue, action: 'reset', hint: 'Ripristino (RESET)' },
        { x: 0.012, y: -0.002, r: 0.0036, mat: MAT.plasticRed, action: 'trip', hint: 'Prova di intervento (STOP/TEST)' },
      ],
      paint(pt, d) {
        tagBox(pt, comp.tag, 23, d.w);
        pt.text(`Ir ${it(p.Ir, p.Ir < 10 ? 2 : 1)} A`, -13.5, 16.3, 2.3, { weight: 800 });
        pt.circle(-13.5, 8, 6.8, { fill: '#e8eaec' });
        for (let i = 0; i < 7; i++) {
          const a = -2 + (i * 4) / 6;
          pt.line([[-13.5 + Math.sin(a) * 6.2, 8 + Math.cos(a) * 6.2], [-13.5 + Math.sin(a) * 7.2, 8 + Math.cos(a) * 7.2]], '#333', 0.3);
        }
        pt.text('RESET', 12, 16.5, 1.9, { weight: 800 });
        pt.text('STOP', 12, -7.3, 1.9, { weight: 800 });
        pt.text('95-96 NC · 97-98 NO', 0, -21, 2, { weight: 700 });
        pt.text('Relè termico', 0, -17.2, 2.1, { weight: 600, color: '#222' });
      },
    };
  },

  km3(def, p, comp) {
    return {
      profile: 'industrial',
      bodyMat: MAT.industrialGrey,
      bg: '#9aa1a8',
      windowInd: { x: 0, y: 0.004, w: 0.014, h: 0.0065 },
      paint(pt, d) {
        tagBox(pt, comp.tag, 23, d.w);
        pt.text(`Uc ${p.Uc} V~`, 0, 15.3, 2.8, { weight: 800, color: '#0f3d80' });
        pt.rect(0, 4, 17, 9.5, '#3b3f44', 1);
        pt.text(`AC-3  ${p.Ie} A`, 0, -7, 2.7, { weight: 800 });
        pt.text('13-14 NA   21-22 NC', 0, -13, 2, { weight: 700 });
        pt.symCoil(-17, -19, 0.55);
        pt.text('Contattore', 3, -19.5, 2.1, { weight: 600, color: '#222' });
      },
    };
  },

  km2m(def, p, comp) {
    return {
      windowInd: { x: 0, y: 0.003, w: 0.01, h: 0.005 },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.text(`Uc ${p.Uc} V~`, 0, 11.6, 2.6, { weight: 800, color: '#0f3d80' });
        pt.rect(0, 3, 13, 8, '#3b3f44', 1);
        pt.text('2 NA · 25 A', 0, -8, 2.6, { weight: 800 });
        pt.symCoil(-9, -16, 0.5);
        pt.text('AC-1', 5, -16, 2.2, { weight: 700 });
      },
    };
  },

  kpp(def, p, comp) {
    return {
      lever: { color: 'black', width: 0.0068, y: 0.001 },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.text('PP', 0, 12, 2.6, { weight: 800 });
        leverSlot(pt, d.w, 1, 12);
        pt.text(`${p.Uc} V~`, 0, -9.5, 2.1, { weight: 700, color: '#0f3d80' });
        pt.symCoil(0, -16, 0.45);
      },
    };
  },

  kt(def, p, comp) {
    return {
      dials: [{ x: 0, y: 0.005, r: 0.0045, angle: -2.3 + (Math.log(p.T) / Math.log(180)) * 4.2 }],
      led: { x: 0, y: -0.0075, color: '#35d46a' },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.circle(0, 5, 6, { fill: '#e4e5e1', stroke: '#9a9da1', lw: 0.25 });
        pt.text(`${p.T}s`, 0, 12.2, 2.2, { weight: 800 });
        pt.symClock(0, -13.5, 0.7);
        pt.text('T', 5.6, -7.5, 2, { weight: 800 });
      },
    };
  },

  kcr(def, p, comp) {
    return {
      dials: [{ x: -0.006, y: 0.004, r: 0.0048, angle: -2.3 + (Math.log(p.lux) / Math.log(200)) * 4.2 }],
      led: { x: 0.009, y: -0.009, color: '#35d46a' },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.circle(-6, 4, 6.5, { fill: '#e4e5e1', stroke: '#9a9da1', lw: 0.25 });
        pt.text(`${p.lux} lx`, -6, 12, 2.2, { weight: 800 });
        pt.symSun(9, 4, 1);
        pt.text('Crepuscolare', 0, -16, 2.2, { weight: 700 });
      },
    };
  },

  hl(def, p, comp) {
    return {
      lens: LENS_COLORS[p.color],
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.circle(0, 2, 7.6, { fill: '#d8d9d4' });
        pt.text(`${p.Un} V~`, 0, -12.5, 2.2, { weight: 700, color: '#0f3d80' });
        pt.symLamp(0, -18, 0.6);
      },
    };
  },

  sbm(def, p, comp) {
    return {
      button: { color: p.color, y: 0.001 },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        pt.circle(0, 1, 7.8, { fill: '#d8d9d4' });
        pt.text(p.contact === 'NC' ? 'NC' : 'NA', 0, -11.5, 2.4, { weight: 800 });
        pt.text(p.contact === 'NC' ? '11-12' : '13-14', 0, -16.5, 2, { weight: 600 });
      },
    };
  },

  sel(def, p, comp) {
    return {
      lever: { color: 'black', width: 0.0075 },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.3, d.w);
        leverSlot(pt, d.w, 0, 14);
        pt.text('I', 0, 11.5, 2.4, { weight: 800, color: '#c0392b' });
        pt.text('0', 0, -11.5, 2.4, { weight: 800 });
        pt.text('16 A', 0, -17, 2, { weight: 700 });
      },
    };
  },

  pm1(def, p, comp) {
    return {
      lcd: { y: 0.006 },
      led: { x: 0.011, y: -0.009, color: '#ff4030' },
      paint(pt, d) {
        tagBox(pt, comp.tag, 18.8, d.w);
        pt.rect(0, 6, 30, 14, '#50565c', 1.2);
        pt.text('kWh', -9, -9, 2.8, { weight: 800 });
        pt.text('1000 imp/kWh', -3, -15, 1.9, { weight: 600 });
        pt.text('230 V · 40 A', -3, -19.3, 1.9, { weight: 600 });
      },
    };
  },
};

function isolSpec(def, p, comp) {
  return {
    lever: { color: 'red' },
    paint(pt, d) {
      tagBox(pt, comp.tag, 18.3, d.w);
      pt.text(`${p.In} A`, 0, 12, 3.6, { weight: 800 });
      leverSlot(pt, d.w, 0, 14);
      ON_OFF(pt, d.w);
      pt.text('SEZIONATORE', 0, -13, 2.1, { weight: 800 });
      pt.text('EN 60947-3', 0, -18.5, 1.8, { weight: 600, color: '#555' });
    },
  };
}

function mcbSpec(def, p, comp) {
  return {
    lever: { color: 'dark' },
    paint(pt, d) {
      tagBox(pt, comp.tag, 18.3, d.w);
      pt.text(`${p.curve}${p.In}`, 0, 12, 4.6, { weight: 800 });
      leverSlot(pt, d.w, 0, 14);
      ON_OFF(pt, d.w);
      pt.strokeRect(-4.5, -13.2, 11, 4.2, INK, 0.3);
      pt.text(String(p.pdi * 1000), -4.5, -13.2, 2.4, { weight: 700 });
      pt.symBreaker(7.5, -14, 0.55);
      pt.text('EN 60898-1', -2, -19.5, 1.8, { weight: 600, color: '#555' });
    },
  };
}

function rcdSpec(def, p, comp) {
  return {
    lever: { color: 'blue' },
    test: true,
    paint(pt, d) {
      tagBox(pt, comp.tag, 18.3, d.w);
      pt.text(`IΔn ${fmt(p.IDn, p.IDn < 0.1 ? 2 : 1)} A`, 0, 12.1, 3.1, { weight: 800, color: '#0f3d80' });
      leverSlot(pt, d.w, 0, 14);
      ON_OFF(pt, d.w);
      pt.text(`In ${p.In} A`, -4, -12.5, 2.5, { weight: 800 });
      pt.strokeRect(-4, -17.3, 5, 3.6, INK, 0.3);
      pt.text(p.rtype, -4, -17.3, 2.3, { weight: 800 });
      pt.text('T', d.w / 2 - 5.2, -11.2, 2.2, { weight: 800 });
      pt.symBreaker(4.5, -16, 0.5, { rcd: true, thermal: false });
    },
  };
}

// ── Costruzione + aggiornamento ──────────────────────────────────────────────────────
export function buildDinModel(def, params, comp) {
  const terms = def.terminals(params);
  const specFn = SPECS[def.type];
  const spec = specFn ? specFn(def, params, comp, terms) : {};
  const modules = modulesOf(def, params);
  const m = buildModular({ modules, terminals: terms, profile: def.style === 'industrial' ? 'industrial' : 'modular', ...spec });
  m.type = def.type;
  const parts = m.parts;
  let t0 = 0;

  m.update = (inst, dt, time) => {
    if (!inst) return;
    const s = inst.state;
    switch (def.type) {
      case 'isol2p': case 'isol4p': case 'mcb1pn': case 'mcb3p': case 'mcb4p': case 'rcd2p': case 'rcd4p': case 'rcbo1pn':
        animateLever(parts, s.on, dt, s.tripped);
        if (parts.test) parts.test.position.z += ((s.test ? -0.0015 : 0) + 0.0672 + 0.0012 - parts.test.position.z) * Math.min(1, dt * 30);
        break;
      case 'sel':
        animateLever(parts, s.on, dt);
        break;
      case 'kpp':
        animateLever(parts, s.out, dt);
        break;
      case 'km3': case 'km2m':
        if (parts.window) {
          parts.window.position.z = parts.windowZ - (s.coil ? 0.0012 : 0);
          parts.window.material.emissiveIntensity = s.coil ? 1.4 : 0;
          parts.window.material.color.setHex(s.coil ? 0x5c1d12 : 0x2b5d33);
        }
        break;
      case 'fr3':
        if (parts.window) {
          parts.window.material.emissiveIntensity = s.tripped ? 1.6 : 0;
          parts.window.material.color.setHex(s.tripped ? 0x7a3a0a : 0x2b5d33);
        }
        break;
      case 'hl':
        setEmissive(parts.lens, (inst.view.bright || 0) * 3.2);
        break;
      case 'sbm':
        if (parts.button) parts.button.position.z = parts.buttonZ - (s.pressed ? 0.003 : 0);
        break;
      case 'kt':
        setEmissive(parts.led, s.remaining > 0 ? (s.remaining < 3 ? (Math.sin(time * 12) > 0 ? 2.5 : 0.2) : 2.5) : 0);
        break;
      case 'kcr':
        setEmissive(parts.led, s.out ? 2.5 : 0);
        break;
      case 'pm1': {
        t0 += dt;
        if (t0 > 0.25 && parts.lcd) {
          t0 = 0;
          const P = s.P || 0;
          drawLCD(parts.lcd, [P >= 1000 ? fmt(P / 1000, 2) : fmt(P, 0), P >= 1000 ? 'kW' : 'W', fmt(s.kWh || 0, 3) + ' kWh']);
        }
        const rate = Math.max(0, s.P || 0) / 400;
        setEmissive(parts.led, rate > 0.01 && Math.sin(time * Math.PI * 2 * Math.min(8, rate)) > 0.85 ? 3 : 0);
        break;
      }
      default:
        break;
    }
  };
  return m;
}

/** Terminali del collettore di terra (la barra è parte del quadro) */
export function buildPebarModel(def, params) {
  const group = new THREE.Group();
  const terms = def.terminals(params);
  const W = 0.3;
  const terminals = new Map();
  const screwGeo = new THREE.CylinderGeometry(0.0034, 0.0034, 0.004, 16);
  screwGeo.rotateX(Math.PI / 2);
  for (const t of terms) {
    const x = t.x * W;
    const sc = new THREE.Mesh(screwGeo, MAT.metalScrew);
    sc.position.set(x, 0, 0.0005);
    group.add(sc);
    terminals.set(t.id, {
      screw: new THREE.Vector3(x, 0, 0.003),
      entry: new THREE.Vector3(x, 0.006, -0.002),
      dir: new THREE.Vector3(0, 1, 0),
      def: t,
    });
  }
  // numerazione
  return { group, parts: {}, interactive: [], terminals, update() {}, type: 'pebar', W, H: 0.012, D: 0.004 };
}
