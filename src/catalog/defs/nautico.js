// Componenti per gli impianti di bordo (fase A1 del modulo nautico): gruppo diesel-generatore con
// sincronizzazione e parallelo, dispositivo di controllo dell'isolamento (sistemi IT), relè di distacco
// carichi. Riferimento: ABB, Quaderno di applicazione tecnica n. 12 (sistemi navali), cap. 4, 6 e 7.
import { source, res, sw, T, P, thermalUpdate, clamp } from './common.js';
import { csub, cabs, cmul, cconj, power } from '../../sim/complex.js';
import { SYSTEMS, GEN_K, sysOf, fmtV, fmtA, fmtW, fmt } from '../../sim/norms.js';

const PH = ['L1', 'L2', 'L3'];
const INNER = ['#a', '#b', '#c'];

/** Dati nominali del gruppo: corrente, impedenza interna (X''d), corrente di cortocircuito, potenza attiva */
export function gensetRated(p) {
  const sys = SYSTEMS[p.net] || SYSTEMS.nave440;
  const Sn = p.Sn * 1000;
  const In = Sn / (Math.sqrt(3) * sys.Vll);
  const Zb = (sys.Vll * sys.Vll) / Sn;
  const X = ((p.xd || 15) / 100) * Zb;
  const zs = { re: X * 0.1, im: X };
  const Icc = sys.Vph / Math.hypot(zs.re, zs.im);
  return { sys, Sn, In, zs, Icc, Pn: Sn * 0.8 };
}

function gensetTrip(inst, ctx, cause, text) {
  const s = inst.state;
  s.closed = false;
  s.trip = cause;
  s.closedUnsynced = false;
  ctx.emit({ level: 'error', text, sound: 'trip-short' });
}

// ── Gruppo diesel-generatore ─────────────────────────────────────────────────────────
export const genset = {
  type: 'genset',
  name: 'Gruppo diesel-generatore (genset)',
  short: 'Gruppo elettrogeno',
  family: 'alimentazione',
  mount: 'field',
  span: 2,
  tag: 'G',
  source: true,
  help:
    'Motore diesel + alternatore sincrono trifase: la centrale elettrica di bordo. Si avvia, poi si chiude ' +
    'l’interruttore di macchina sulla sbarra. Se la sbarra è già in tensione (altro gruppo in servizio) la ' +
    'chiusura è permessa solo a sincronismo raggiunto: tensione, frequenza e fase uguali. In parallelo i gruppi ' +
    'si ripartiscono il carico in proporzione alla potenza. Oltre la potenza nominale la frequenza cala e la ' +
    'protezione interviene (1,5 In entro 2 minuti). Non esiste una sbarra a potenza infinita: lo spunto di un ' +
    'motore grande fa calare la tensione.',
  params: [
    P.select('Sn', 'Potenza apparente Sn', [20, 30, 50, 100, 200, 400, 800, 1600], 100, { unit: 'kVA' }),
    P.select('net', 'Tensione e frequenza', Object.values(SYSTEMS).map((s) => ({ value: s.id, label: s.label })), 'nave440'),
    P.select('earth', 'Neutro', [
      { value: 'IT', label: 'IT — neutro isolato da massa (tipico a bordo)' },
      { value: 'TN', label: 'TN — neutro collegato a massa (scafo)' },
    ], 'IT'),
    P.select('xd', 'Reattanza subtransitoria X″d', [12, 15, 20], 15, { unit: '%', help: 'Impedenza interna dell’alternatore: determina la corrente di cortocircuito (≈ 5–8 In) e la caduta di tensione allo spunto dei motori.' }),
    P.bool('auto', 'Sincronizzatore automatico', true, { help: 'Con il sincronizzatore la chiusura su sbarra in tensione avviene solo a sincronismo raggiunto (qualche secondo). Senza, si può chiudere fuori fase: corrente di circolazione e intervento della protezione.' }),
    P.bool('standby', 'Avviamento automatico in base al carico', false, { help: 'Gruppo di riserva: parte da solo quando i gruppi in servizio sulla sbarra superano l’85 % e si ferma sotto il 30 %.' }),
    P.bool('emergenza', 'Gruppo di emergenza', false, { help: 'Parte da solo al black-out (nessun’altra sorgente in servizio), chiude sulla propria sbarra di emergenza e si ferma 30 s dopo il ritorno dell’alimentazione normale. Sta su un ponte alto, sopra la linea di galleggiamento.' }),
    P.number('Rins', 'Resistenza di isolamento della rete', 5, 1000, 5, 200, 'kΩ', { teacher: true, help: 'Isolamento verso massa della rete sana (sistema IT): limita la corrente del primo guasto a terra.' }),
    P.number('Re', 'Resistenza di terra (scafo)', 0.1, 100, 0.1, 1, 'Ω'),
  ],
  terminals: () => [
    T('L1', 'L1', 'L', 'top', 0.1, 'load'), T('L2', 'L2', 'L', 'top', 0.26, 'load'), T('L3', 'L3', 'L', 'top', 0.42, 'load'),
    T('N', 'N', 'N', 'top', 0.62, 'load'), T('PE', 'PE', 'PE', 'top', 0.84, 'load'),
  ],
  init: () => ({ running: false, closed: false, synced: false, phase: 0, busLive: false, trip: null, closedUnsynced: false, theta: 0, tSync: 0, tRp: 0, tStby: 0, tEm: 0, P: 0, Q: 0, S: 0, I: [0, 0, 0], Imax: 0, kWh: 0, hours: 0 }),
  elements(inst) {
    const p = inst.params;
    const s = inst.state;
    const r = gensetRated(p);
    const V = s.running ? r.sys.Vph : 0;
    const off = s.synced ? 0 : s.phase;
    const els = PH.map((t, k) => source('s' + t, INNER[k], '#g', V, -120 * k + off, r.zs));
    PH.forEach((t, k) => els.push(sw('b' + t, INNER[k], t, s.closed)));
    els.push(sw('bN', '#g', 'N', s.closed));
    if (p.earth === 'TN') els.push(res('rn', '#g', 'GND', 1.0));
    else els.push(res('rins', '#g', 'GND', p.Rins * 1000));
    els.push(res('re', 'PE', 'GND', p.Re));
    return els;
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const r = gensetRated(inst.params);
    let P = 0;
    let Q = 0;
    const I = [0, 0, 0];
    PH.forEach((t, k) => {
      const i = ctx.I('s' + t);
      const pw = power(csub(ctx.V(INNER[k]), ctx.V('#g')), i);
      P += pw.P;
      Q += pw.Q;
      I[k] = cabs(i);
    });
    s.P = P;
    s.Q = Q;
    s.S = Math.hypot(P, Q);
    s.I = I;
    s.Imax = Math.max(...I);
    // la sbarra è in tensione? (vista dai morsetti, a interruttore aperto)
    s.busLive = s.closed ? true : cabs(ctx.Vd('L1', 'N')) > 0.5 * r.sys.Vph;
    return false;
  },
  tick(inst, ctx, dt) {
    const p = inst.params;
    const s = inst.state;
    const r = gensetRated(p);
    let ch = false;
    if (s.running) s.hours += dt / 3600;
    if (s.closed) s.kWh += (Math.max(0, s.P) * dt) / 3.6e6;
    // cortocircuito / corrente di circolazione: intervento breve-ritardato (0,25 s) per lasciare agire prima
    // gli interruttori di partenza (selettività), come i relè di generatore a bordo
    if (s.closed && s.running && s.Imax > 3 * r.In) {
      s.tSc = (s.tSc || 0) + dt;
      if (s.tSc >= (s.closedUnsynced ? 0.1 : 0.3) - 1e-9) {
        s.tSc = 0;
        const fuoriFase = s.closedUnsynced;
        gensetTrip(inst, ctx, fuoriFase ? 'parallelo fuori fase' : 'cortocircuito',
          fuoriFase
            ? `${inst.tag}: CHIUSURA FUORI FASE — corrente di circolazione ${fmtA(s.Imax)} (${fmt(s.Imax / r.In, 1)} × In): la protezione apre l’interruttore di macchina. Sincronizza prima di chiudere.`
            : `${inst.tag}: intervento della protezione di generatore — ${fmtA(s.Imax)} (${fmt(s.Imax / r.In, 1)} × In): cortocircuito sulla sbarra non eliminato dalle partenze.`);
        return true;
      }
    } else s.tSc = 0;
    // sincronizzazione: a sbarra morta il gruppo fa da riferimento; a sbarra viva serve il sincronismo
    if (s.running && !s.closed) {
      if (!s.busLive) {
        if (!s.synced) {
          s.synced = true;
          s.phase = 0;
        }
      } else if (!s.synced && p.auto) {
        s.tSync += dt;
        if (s.tSync >= 4) {
          s.synced = true;
          s.phase = 0;
          s.tSync = 0;
          ctx.emit({ level: 'info', text: `${inst.tag}: sincronizzato con la sbarra (tensione, frequenza e fase coincidono): si può chiudere.`, sound: 'click' });
          ch = true;
        }
      }
    }
    // sovraccarico: termica di generatore (registri navali: 1,5 In entro 2 minuti)
    const x = s.closed && s.running ? s.Imax / r.In : 0;
    if (thermalUpdate(s, x, dt, GEN_K, 90) && s.closed) {
      gensetTrip(inst, ctx, 'sovraccarico', `${inst.tag}: intervento per SOVRACCARICO del generatore — ${fmtA(s.Imax)} su In = ${fmtA(r.In)} (${fmt(x, 2)} × In). Riduci i carichi (distacco dei non essenziali) o avvia un altro gruppo.`);
      return true;
    }
    // inversione di potenza (il gruppo viene trascinato dagli altri)
    if (s.closed && s.running && s.P < -0.08 * r.Pn) {
      s.tRp += dt;
      if (s.tRp > 2) {
        gensetTrip(inst, ctx, 'inversione di potenza', `${inst.tag}: INVERSIONE DI POTENZA (${fmtW(s.P)}): il gruppo assorbe energia dalla sbarra invece di fornirla — protezione di generatore intervenuta.`);
        return true;
      }
    } else s.tRp = 0;
    // gruppo di emergenza: parte al black-out, chiude sulla sua sbarra, si ferma quando torna la rete normale
    if (p.emergenza && !s.trip) {
      const others = ctx.sim.anyOtherSourceLive?.(inst.id) ?? false;
      if (!others && !s.running) {
        s.tEm += dt;
        if (s.tEm > 1) {
          s.running = true;
          s.synced = true;
          s.phase = 0;
          s.tEm = 0;
          ctx.emit({ level: 'warn', text: `${inst.tag}: BLACK-OUT — avviamento automatico del gruppo di emergenza.`, sound: 'switch-on' });
          ch = true;
        }
      } else if (!others && s.running && !s.closed && s.synced) {
        s.tEm += dt;
        if (s.tEm > 2) {
          s.closed = true;
          s.tEm = 0;
          ctx.emit({ level: 'info', text: `${inst.tag}: in servizio sulla sbarra di emergenza.`, sound: 'switch-on' });
          ch = true;
        }
      } else if (others && s.running) {
        s.tEm += dt;
        if (s.tEm > 30) {
          s.closed = false;
          s.running = false;
          s.synced = false;
          s.tEm = 0;
          ctx.emit({ level: 'info', text: `${inst.tag}: alimentazione normale tornata — gruppo di emergenza fermato.`, sound: 'switch-off' });
          ch = true;
        }
      } else s.tEm = 0;
    }
    // gruppo di riserva: avviamento e arresto automatici in base al carico della sbarra
    if (p.standby && !s.trip) {
      const bus = ctx.sim.busAt?.(inst.id, 'L1');
      if (!s.running && bus && bus.loading > 0.85) {
        s.tStby += dt;
        if (s.tStby > 3) {
          s.running = true;
          s.synced = false;
          s.phase = 60 + ((ctx.env.time * 37) % 200);
          s.tStby = 0;
          ctx.emit({ level: 'info', text: `${inst.tag}: avviamento automatico — la sbarra è al ${fmt(bus.loading * 100, 0)} % del carico.`, sound: 'switch-on' });
          ch = true;
        }
      } else if (s.running && s.closed && bus && bus.gens.length > 1 && bus.loading < 0.3) {
        s.tStby += dt;
        if (s.tStby > 15) {
          s.closed = false;
          s.running = false;
          s.synced = false;
          s.tStby = 0;
          ctx.emit({ level: 'info', text: `${inst.tag}: arresto automatico — carico della sbarra basso (${fmt(bus.loading * 100, 0)} %).`, sound: 'switch-off' });
          ch = true;
        }
      } else s.tStby = 0;
      if (s.running && !s.closed && s.synced && p.standby && p.auto && bus && bus.loading > 0.85) {
        s.closed = true;
        ctx.emit({ level: 'info', text: `${inst.tag}: in parallelo sulla sbarra.`, sound: 'switch-on' });
        ch = true;
      }
    }
    return ch;
  },
  interact: {
    genStart(inst, ctx) {
      const s = inst.state;
      if (s.running) return { msg: `${inst.tag}: il gruppo è già in moto.` };
      s.running = true;
      s.synced = false;
      s.phase = 60 + ((ctx.env.time * 37) % 200); // fase casuale rispetto alla sbarra
      return { sound: 'switch-on', msg: `${inst.tag}: motore diesel avviato, alternatore in tensione.` };
    },
    genStop(inst) {
      const s = inst.state;
      s.running = false;
      s.closed = false;
      s.synced = false;
      s.closedUnsynced = false;
      return { sound: 'switch-off', msg: `${inst.tag}: gruppo fermato.` };
    },
    sync(inst) {
      const s = inst.state;
      if (!s.running) return { level: 'warn', msg: `${inst.tag}: avvia prima il gruppo.` };
      s.synced = true;
      s.phase = 0;
      return { sound: 'click', msg: s.busLive ? `${inst.tag}: sincronizzato con la sbarra — tensione, frequenza e fase coincidono.` : `${inst.tag}: la sbarra è senza tensione, il gruppo fa da riferimento.` };
    },
    close(inst, ctx) {
      const s = inst.state;
      const p = inst.params;
      if (s.trip) return { level: 'error', msg: `${inst.tag}: protezione intervenuta (${s.trip}). Usa “Ripristina protezione”.` };
      if (!s.running) return { level: 'warn', msg: `${inst.tag}: il gruppo è fermo, avvialo prima di chiudere l’interruttore.` };
      if (s.closed) return { msg: `${inst.tag}: interruttore già chiuso.` };
      if (s.busLive && !s.synced) {
        if (p.auto) return { level: 'warn', msg: `${inst.tag}: sincronizzatore attivo — la chiusura è bloccata finché il gruppo non è in sincronismo con la sbarra (attendi qualche secondo).` };
        s.closedUnsynced = true;
        ctx.emit({ level: 'warn', text: `${inst.tag}: interruttore chiuso con la sbarra in tensione SENZA sincronizzazione.` });
      }
      s.closed = true;
      return { sound: 'switch-on' };
    },
    open(inst) {
      const s = inst.state;
      s.closed = false;
      s.closedUnsynced = false;
      return { sound: 'switch-off' };
    },
    resetTrip(inst) {
      const s = inst.state;
      if (!s.trip) return { msg: `${inst.tag}: nessuna protezione da ripristinare.` };
      if ((s.theta || 0) > 0.6) return { level: 'warn', msg: `${inst.tag}: generatore ancora caldo, attendi prima di ripristinare.` };
      s.trip = null;
      s.closedUnsynced = false;
      return { sound: 'click', msg: `${inst.tag}: protezione ripristinata.` };
    },
  },
  /** Scorciatoia “alimenta/scollega” dell'interfaccia e dei collaudi: avvio + sincronismo + chiusura */
  setPower(inst, on) {
    const s = inst.state;
    if (on && inst.params.emergenza) {
      // il gruppo di emergenza parte solo al black-out: la scorciatoia lo lascia fermo
      s.closed = false;
      s.running = false;
      s.synced = false;
      return;
    }
    if (on) {
      s.running = true;
      s.synced = true;
      s.phase = 0;
      s.trip = null;
      s.closed = true;
    } else {
      s.closed = false;
      s.running = false;
      s.synced = false;
    }
  },
  system: (p) => ({ ...(SYSTEMS[p.net] || SYSTEMS.nave440), earth: p.earth }),
  protection: (p) => {
    const r = gensetRated(p);
    return { kind: 'generator', In: Math.round(r.In), curve: 'C', poles: [['#a', 'L1'], ['#b', 'L2'], ['#c', 'L3']], overcurrent: true };
  },
  paths: () => [],
  readouts(inst, ctx) {
    const s = inst.state;
    const p = inst.params;
    const r = gensetRated(p);
    const bus = ctx.sim.busAt?.(inst.id, 'L1');
    const f = !s.running ? 0 : s.closed && bus ? bus.f : r.sys.f;
    const stato = s.trip ? `SCATTATO (${s.trip})` : !s.running ? (p.emergenza ? 'Fermo (pronto all’avviamento automatico)' : 'Fermo') : s.closed ? 'In servizio sulla sbarra' : s.synced ? 'In moto, sincronizzato — pronto a chiudere' : s.busLive ? 'In moto, NON sincronizzato' : 'In moto, sbarra senza tensione';
    const out = [
      { label: 'Stato', value: stato, level: s.trip ? 'error' : s.closed ? 'ok' : s.running ? 'warn' : 'off' },
      { label: 'Interruttore di macchina', value: s.closed ? 'Chiuso' : 'Aperto', level: s.closed ? 'ok' : 'off' },
      { label: 'Tensione L1-N · L1-L2', value: `${fmtV(cabs(ctx.Vd('L1', 'N')))} · ${fmtV(cabs(ctx.Vd('L1', 'L2')))}` },
      { label: 'Frequenza', value: f ? `${fmt(f, 1)} Hz` : '—', level: f && f < 0.97 * r.sys.f ? 'warn' : undefined },
      { label: 'Carico', value: `${fmt((s.S / r.Sn) * 100, 0)} % di ${p.Sn} kVA`, bar: clamp(s.S / r.Sn, 0, 1), level: s.S > r.Sn ? 'warn' : undefined },
      { label: 'Potenza attiva · reattiva', value: `${fmtW(s.P)} · ${fmtW(s.Q).replace('W', 'var')}` },
      { label: 'Correnti L1 · L2 · L3', value: s.I.map(fmtA).join(' · ') + ` (In ${fmtA(r.In)})` },
      { label: 'Corrente di cortocircuito', value: `${fmtA(r.Icc)} (${fmt(r.Icc / r.In, 1)} × In)` },
      { label: 'Riscaldamento', value: `${fmt(clamp(s.theta || 0, 0, 1) * 100, 0)} %`, bar: clamp(s.theta || 0, 0, 1) },
      { label: 'Ore di moto · energia', value: `${fmt(s.hours, 2)} h · ${fmt(s.kWh, 3)} kWh` },
    ];
    if (bus && s.closed) out.push({ label: 'Sbarra', value: `${bus.gens.length} grupp${bus.gens.length === 1 ? 'o' : 'i'} · carico ${fmt(bus.loading * 100, 0)} %`, level: bus.loading > 1 ? 'warn' : undefined });
    return out;
  },
};

// ── Dispositivo di controllo dell'isolamento (sistema IT) ─────────────────────────────
export const imd = {
  type: 'imd',
  name: 'Dispositivo di controllo dell’isolamento (sistema IT)',
  short: 'Controllo isolamento',
  family: 'segnalazione',
  mount: 'din',
  modules: 3,
  tag: 'KI',
  help:
    'Nei sistemi a neutro isolato (IT) un primo guasto a terra non fa intervenire le protezioni: la corrente è ' +
    'limitata dall’isolamento della rete. Il dispositivo misura in continuo la resistenza di isolamento verso ' +
    'massa e, sotto la soglia, dà allarme (visivo, acustico e con il contatto 11-14) perché il guasto venga ' +
    'rimosso prima che un secondo guasto diventi un cortocircuito. Obbligatorio a bordo (registri navali).',
  params: [
    P.select('soglia', 'Soglia di allarme', [10, 20, 50, 100], 50, { unit: 'kΩ' }),
    P.select('ripristino', 'Ripristino dell’allarme', [
      { value: 'auto', label: 'Automatico al rientro dell’isolamento' },
      { value: 'man', label: 'Manuale (tasto RESET)' },
    ], 'auto'),
  ],
  terminals: () => [
    T('L', 'L', 'L', 'top', 0.2), T('N', 'N', 'N', 'top', 0.5), T('PE', 'PE', 'PE', 'top', 0.8),
    T('11', '11', 'aux', 'bottom', 0.3, 'line'), T('14', '14', 'aux', 'bottom', 0.7, 'load'),
  ],
  init: () => ({ powered: false, Riso: Infinity, Vd: 0, alarm: false, na: false }),
  elements(inst, env) {
    const Vph = sysOf(env).Vph;
    return [res('aux', 'L', 'N', (Vph * Vph) / 2), sw('al', '11', '14', inst.state.alarm)];
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const p = inst.params;
    const Vph = sysOf(ctx.env).Vph;
    s.powered = cabs(ctx.Vd('L', 'N')) > 0.7 * Vph;
    const base = ctx.sim.insulationBase?.() ?? Infinity;
    s.na = !Number.isFinite(base); // rete con neutro a terra: la misura non ha senso
    // spostamento del centro stella rispetto a massa: nullo a rete sana, ≈ Vph con un guasto franco
    s.Vd = cabs(ctx.V('N'));
    s.Riso = !s.powered || s.na ? Infinity : ctx.sim.insulationResistance?.() ?? Infinity;
    const low = s.powered && !s.na && s.Riso < p.soglia * 1000;
    let alarm = s.alarm;
    if (low && !alarm) {
      alarm = true;
      ctx.emit({ level: 'warn', text: `${inst.tag}: ALLARME ISOLAMENTO — resistenza verso massa ${s.Riso < 100 ? fmt(s.Riso, 0) + ' Ω (guasto franco)' : s.Riso < 1000 ? fmt(s.Riso, 0) + ' Ω' : fmt(s.Riso / 1000, 1) + ' kΩ'} sotto la soglia di ${p.soglia} kΩ: primo guasto a terra. L’impianto resta alimentato: trova e rimuovi il guasto.`, sound: 'limiter' });
    } else if (!low && alarm && p.ripristino === 'auto') alarm = false;
    if (alarm !== s.alarm) {
      s.alarm = alarm;
      return true;
    }
    return false;
  },
  interact: {
    reset(inst) {
      const s = inst.state;
      if (!s.alarm) return { msg: `${inst.tag}: nessun allarme.` };
      if (Number.isFinite(s.Riso) && s.Riso < inst.params.soglia * 1000) return { level: 'warn', msg: `${inst.tag}: il guasto è ancora presente, l’allarme non si ripristina.` };
      s.alarm = false;
      return { sound: 'click', msg: `${inst.tag}: allarme ripristinato.` };
    },
  },
  paths: () => [['11', '14']],
  readouts(inst) {
    const s = inst.state;
    const p = inst.params;
    return [
      { label: 'Alimentazione', value: s.powered ? 'Presente' : 'Assente', level: s.powered ? 'ok' : 'off' },
      { label: 'Resistenza di isolamento', value: s.na ? 'Non applicabile (neutro a terra)' : !Number.isFinite(s.Riso) ? '> 1 MΩ' : s.Riso < 100 ? `${fmt(s.Riso, 0)} Ω (guasto franco a massa)` : s.Riso < 1000 ? `${fmt(s.Riso, 0)} Ω` : `${fmt(s.Riso / 1000, 1)} kΩ`, level: s.alarm ? 'error' : s.powered && !s.na ? 'ok' : undefined },
      { label: 'Soglia di allarme', value: `${p.soglia} kΩ` },
      { label: 'Spostamento del neutro verso massa', value: fmtV(s.Vd) },
      { label: 'Allarme (contatto 11-14)', value: s.alarm ? 'ATTIVO — primo guasto a terra' : 'A riposo', level: s.alarm ? 'error' : 'ok' },
    ];
  },
};

// ── Relè di distacco carichi (load shedding) ──────────────────────────────────────────
export const kls = {
  type: 'kls',
  name: 'Relè di distacco carichi (load shedding)',
  short: 'Distacco carichi',
  family: 'comando',
  mount: 'din',
  modules: 2,
  tag: 'KL',
  help:
    'Protegge la centrale dal sovraccarico: quando i generatori in servizio superano la soglia di carico (o la ' +
    'frequenza cala) apre il contatto 11-12 e chiude 11-14. Si usa per staccare le utenze NON essenziali ' +
    '(cucina, aria condizionata, confort) e mantenere alimentate quelle essenziali (timoneria, pompe, luci).',
  params: [
    P.select('mode', 'Criterio', [
      { value: 'carico', label: 'Carico dei generatori sulla sbarra' },
      { value: 'freq', label: 'Frequenza della sbarra' },
    ], 'carico'),
    P.select('soglia', 'Soglia di carico', [80, 85, 90, 95], 90, { unit: '%' }),
    P.select('df', 'Abbassamento di frequenza', [1, 2, 3], 2, { unit: 'Hz' }),
    P.select('ritardo', 'Ritardo di intervento', [0.5, 1, 2, 5], 1, { unit: 's' }),
    P.select('ripristino', 'Ripristino', [
      { value: 'auto', label: 'Automatico quando il carico scende' },
      { value: 'man', label: 'Manuale (tasto RESET)' },
    ], 'auto'),
  ],
  terminals: () => [
    T('L', 'L', 'L', 'top', 0.2), T('N', 'N', 'N', 'top', 0.5), T('11', '11', 'aux', 'top', 0.8, 'line'),
    T('12', '12', 'aux', 'bottom', 0.3, 'load'), T('14', '14', 'aux', 'bottom', 0.7, 'load'),
  ],
  init: () => ({ powered: false, shed: false, t: 0, loading: 0, f: 0 }),
  elements(inst, env) {
    const Vph = sysOf(env).Vph;
    return [res('aux', 'L', 'N', (Vph * Vph) / 1.5), sw('nc', '11', '12', !inst.state.shed), sw('no', '11', '14', inst.state.shed)];
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    s.powered = cabs(ctx.Vd('L', 'N')) > 0.7 * sysOf(ctx.env).Vph;
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    const p = inst.params;
    const sys = sysOf(ctx.env);
    const bus = ctx.sim.busAt?.(inst.id, 'L');
    s.loading = bus ? bus.loading : 0;
    s.f = bus ? bus.f : sys.f;
    if (!s.powered || !bus) {
      s.t = 0;
      return false;
    }
    const over = p.mode === 'freq' ? s.f < sys.f - p.df : s.loading * 100 > p.soglia;
    if (over && !s.shed) {
      s.t += dt;
      if (s.t >= p.ritardo) {
        s.shed = true;
        s.t = 0;
        ctx.emit({ level: 'warn', text: `${inst.tag}: DISTACCO CARICHI — ${p.mode === 'freq' ? `frequenza ${fmt(s.f, 1)} Hz` : `centrale al ${fmt(s.loading * 100, 0)} %`}: aperto il contatto 11-12 delle utenze non essenziali.`, sound: 'relay' });
        return true;
      }
    } else if (!over && s.shed && p.ripristino === 'auto' && s.loading * 100 < p.soglia - 20) {
      s.t += dt;
      if (s.t >= 5) {
        s.shed = false;
        s.t = 0;
        ctx.emit({ level: 'info', text: `${inst.tag}: carico rientrato (${fmt(s.loading * 100, 0)} %), utenze non essenziali ricollegate.`, sound: 'relay' });
        return true;
      }
    } else s.t = 0;
    return false;
  },
  interact: {
    reset(inst) {
      const s = inst.state;
      if (!s.shed) return { msg: `${inst.tag}: nessun distacco in corso.` };
      s.shed = false;
      return { sound: 'click', msg: `${inst.tag}: utenze ricollegate.` };
    },
  },
  paths: () => [['11', '12'], ['11', '14']],
  readouts(inst) {
    const s = inst.state;
    const p = inst.params;
    return [
      { label: 'Alimentazione', value: s.powered ? 'Presente' : 'Assente', level: s.powered ? 'ok' : 'off' },
      { label: 'Carico della sbarra', value: `${fmt(s.loading * 100, 0)} % (soglia ${p.soglia} %)`, bar: clamp(s.loading, 0, 1), level: s.loading * 100 > p.soglia ? 'warn' : undefined },
      { label: 'Frequenza', value: s.f ? `${fmt(s.f, 1)} Hz` : '—' },
      { label: 'Uscita', value: s.shed ? 'DISTACCO (11-12 aperto, 11-14 chiuso)' : 'A riposo (11-12 chiuso)', level: s.shed ? 'error' : 'ok' },
    ];
  },
};

// ── Presa di banchina (shore connection) ─────────────────────────────────────────────
export const shore = {
  type: 'shore',
  name: 'Presa di banchina (shore connection)',
  short: 'Presa di banchina',
  family: 'alimentazione',
  mount: 'field',
  span: 1,
  tag: 'XB',
  source: true,
  help:
    'In porto la nave spegne i diesel e si alimenta dalla banchina: si collega il cavo, si controlla la sequenza ' +
    'delle fasi e si chiude l’interruttore di banchina. Con il trasferimento “a black-out” la chiusura è permessa ' +
    'solo con gli interruttori dei gruppi aperti; con il trasferimento “in parallelo” i gruppi si sincronizzano alla ' +
    'rete di banchina e poi si aprono senza interruzione. Il controllo della sequenza evita che i motori di bordo ' +
    'girino al contrario.',
  params: [
    P.select('net', 'Tensione e frequenza della banchina', Object.values(SYSTEMS).map((s) => ({ value: s.id, label: s.label })), 'nave440'),
    P.select('Pmax', 'Potenza disponibile dalla banchina', [20, 50, 100, 200, 500], 50, { unit: 'kW' }),
    P.select('Icc', 'Corrente di cortocircuito della banchina', [3, 6, 10], 6, { unit: 'kA' }),
    P.select('seq', 'Sequenza delle fasi della banchina', [
      { value: 'diretta', label: 'Diretta (L1-L2-L3)' },
      { value: 'inversa', label: 'Inversa (due fasi scambiate)' },
    ], 'diretta'),
    P.bool('ctrl', 'Controllo della sequenza delle fasi', true, { help: 'Blocca la chiusura se la sequenza della banchina non coincide con quella di bordo.' }),
    P.select('trasf', 'Trasferimento del carico', [
      { value: 'blackout', label: 'A black-out (prima si aprono i gruppi)' },
      { value: 'parallelo', label: 'In parallelo (breve parallelo con i gruppi)' },
    ], 'blackout'),
  ],
  terminals: () => [
    T('L1', 'L1', 'L', 'top', 0.1, 'load'), T('L2', 'L2', 'L', 'top', 0.26, 'load'), T('L3', 'L3', 'L', 'top', 0.42, 'load'),
    T('N', 'N', 'N', 'top', 0.62, 'load'), T('PE', 'PE', 'PE', 'top', 0.84, 'load'),
  ],
  init: () => ({ plugged: false, closed: false, busLive: false, trip: null, P: 0, Q: 0, I: [0, 0, 0], Imax: 0, kWh: 0, tOver: 0, seqBus: null }),
  elements(inst) {
    const p = inst.params;
    const s = inst.state;
    const sys = SYSTEMS[p.net] || SYSTEMS.nave440;
    const V = s.plugged ? sys.Vph : 0;
    const z = sys.Vph / (p.Icc * 1000);
    const zs = { re: z * 0.7071, im: z * 0.7071 };
    const ang = p.seq === 'inversa' ? [0, -240, -120] : [0, -120, -240];
    const els = PH.map((t, k) => source('s' + t, INNER[k], '#s', V, ang[k], zs));
    PH.forEach((t, k) => els.push(sw('b' + t, INNER[k], t, s.closed)));
    els.push(sw('bN', '#s', 'N', s.closed));
    els.push(res('rins', '#s', 'GND', 200000)); // tramite trasformatore di isolamento: il neutro di bordo resta isolato
    els.push(res('re', 'PE', 'GND', 1));
    return els;
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const sys = SYSTEMS[inst.params.net] || SYSTEMS.nave440;
    let P = 0;
    let Q = 0;
    const I = [0, 0, 0];
    PH.forEach((t, k) => {
      const i = ctx.I('s' + t);
      const pw = power(csub(ctx.V(INNER[k]), ctx.V('#s')), i);
      P += pw.P;
      Q += pw.Q;
      I[k] = cabs(i);
    });
    s.P = P;
    s.Q = Q;
    s.I = I;
    s.Imax = Math.max(...I);
    s.busLive = s.closed ? true : cabs(ctx.Vd('L1', 'N')) > 0.5 * sys.Vph;
    // sequenza delle fasi presente sulla sbarra di bordo (se in tensione)
    if (s.busLive) {
      const uv = ctx.Vd('L1', 'L2');
      const vw = ctx.Vd('L2', 'L3');
      s.seqBus = cabs(uv) > 0.5 * sys.Vll ? (cmul(uv, cconj(vw)).im >= 0 ? 'diretta' : 'inversa') : null;
    } else s.seqBus = null;
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    const p = inst.params;
    if (s.closed) s.kWh += (Math.max(0, s.P) * dt) / 3.6e6;
    if (s.closed && s.P > p.Pmax * 1000 * 1.05) {
      s.tOver += dt;
      if (s.tOver > 3) {
        s.closed = false;
        s.trip = 'potenza di banchina superata';
        s.tOver = 0;
        ctx.emit({ level: 'error', text: `${inst.tag}: superata la potenza disponibile dalla banchina (${fmtW(s.P)} > ${p.Pmax} kW): interruttore di banchina aperto. Riduci i carichi o riavvia un gruppo.`, sound: 'trip' });
        return true;
      }
    } else s.tOver = 0;
    return false;
  },
  interact: {
    plug(inst) {
      const s = inst.state;
      if (s.closed) return { level: 'warn', msg: `${inst.tag}: apri prima l’interruttore di banchina, poi scollega il cavo.` };
      s.plugged = !s.plugged;
      return { sound: s.plugged ? 'click' : 'switch-off', msg: s.plugged ? `${inst.tag}: cavo di banchina collegato, tensione presente alla presa.` : `${inst.tag}: cavo scollegato.` };
    },
    close(inst, ctx) {
      const s = inst.state;
      const p = inst.params;
      if (s.trip) return { level: 'error', msg: `${inst.tag}: ${s.trip}. Usa “Ripristina protezione”.` };
      if (!s.plugged) return { level: 'warn', msg: `${inst.tag}: collega prima il cavo di banchina.` };
      if (s.closed) return { msg: `${inst.tag}: interruttore già chiuso.` };
      if (p.ctrl && p.seq === 'inversa') return { level: 'error', msg: `${inst.tag}: SEQUENZA DELLE FASI INVERSA — il controllo di sequenza blocca la chiusura (i motori girerebbero al contrario). Scambia due fasi del cavo di banchina.` };
      if (s.busLive && p.trasf === 'blackout') return { level: 'warn', msg: `${inst.tag}: trasferimento a black-out — apri prima gli interruttori dei gruppi, poi chiudi la banchina.` };
      s.closed = true;
      if (p.seq === 'inversa') ctx.emit({ level: 'error', text: `${inst.tag}: chiuso con la sequenza delle fasi INVERSA — i motori di bordo girano al contrario!` });
      else ctx.emit({ level: 'info', text: `${inst.tag}: nave alimentata dalla banchina${s.busLive ? ' in parallelo con i gruppi: ora si possono aprire' : ''}.` });
      return { sound: 'switch-on' };
    },
    open(inst) {
      inst.state.closed = false;
      return { sound: 'switch-off' };
    },
    resetTrip(inst) {
      const s = inst.state;
      if (!s.trip) return { msg: `${inst.tag}: nessuna protezione da ripristinare.` };
      s.trip = null;
      return { sound: 'click', msg: `${inst.tag}: protezione ripristinata.` };
    },
  },
  setPower(inst, on) {
    if (!on) inst.state.closed = false; // la banchina è una manovra manuale: la scorciatoia la apre soltanto
  },
  system: (p) => ({ ...(SYSTEMS[p.net] || SYSTEMS.nave440), earth: 'IT' }),
  paths: () => [],
  readouts(inst, ctx) {
    const s = inst.state;
    const p = inst.params;
    const sys = SYSTEMS[p.net] || SYSTEMS.nave440;
    return [
      { label: 'Stato', value: s.trip ? `SCATTATO (${s.trip})` : s.closed ? 'In servizio: nave alimentata da terra' : s.plugged ? 'Cavo collegato, interruttore aperto' : 'Cavo scollegato', level: s.trip ? 'error' : s.closed ? 'ok' : s.plugged ? 'warn' : 'off' },
      { label: 'Banchina', value: `${sys.Vph}/${sys.Vll} V · ${sys.f} Hz · ${p.Pmax} kW · sequenza ${p.seq}`, level: p.seq === 'inversa' ? 'warn' : undefined },
      { label: 'Sbarra di bordo', value: s.busLive ? `in tensione (sequenza ${s.seqBus || '—'})` : 'senza tensione' },
      { label: 'Tensione L1-N · L1-L2', value: `${fmtV(cabs(ctx.Vd('L1', 'N')))} · ${fmtV(cabs(ctx.Vd('L1', 'L2')))}` },
      { label: 'Potenza prelevata', value: `${fmtW(s.P)} (max ${p.Pmax} kW)`, bar: clamp(s.P / (p.Pmax * 1000), 0, 1), level: s.P > p.Pmax * 1000 ? 'warn' : undefined },
      { label: 'Correnti L1 · L2 · L3', value: s.I.map(fmtA).join(' · ') },
      { label: 'Energia dalla banchina', value: `${fmt(s.kWh, 3)} kWh` },
    ];
  },
};

// ── Commutatore automatico di rete (ATS) ──────────────────────────────────────────────
export const ats = {
  type: 'ats',
  name: 'Commutatore automatico di rete (ATS)',
  short: 'Commutatore ATS',
  family: 'comando',
  mount: 'din',
  modules: 8,
  tag: 'KC',
  help:
    'Alimenta l’uscita (2-4-6-N2) dalla rete NORMALE (1-3-5-N1); quando manca la tensione commuta sulla rete di ' +
    'EMERGENZA (7-9-11-N3) dopo il ritardo impostato e torna sulla normale quando rientra. Sta tra il quadro ' +
    'principale e il quadro dei carichi essenziali (timoneria, pompe, luci di navigazione).',
  params: [
    P.select('ritardo', 'Ritardo di commutazione', [0.5, 1, 2, 5], 1, { unit: 's' }),
    P.select('ritorno', 'Ritorno alla rete normale dopo', [5, 10, 30, 60], 10, { unit: 's' }),
  ],
  terminals: () => [
    T('1', '1', 'L', 'top', 0.06, 'line'), T('3', '3', 'L', 'top', 0.17, 'line'), T('5', '5', 'L', 'top', 0.28, 'line'), T('N1', 'N1', 'N', 'top', 0.39, 'line'),
    T('7', '7', 'L', 'top', 0.61, 'line'), T('9', '9', 'L', 'top', 0.72, 'line'), T('11', '11', 'L', 'top', 0.83, 'line'), T('N3', 'N3', 'N', 'top', 0.94, 'line'),
    T('2', '2', 'L', 'bottom', 0.2, 'load'), T('4', '4', 'L', 'bottom', 0.4, 'load'), T('6', '6', 'L', 'bottom', 0.6, 'load'), T('N2', 'N2', 'N', 'bottom', 0.8, 'load'),
  ],
  barrier: true, // per le verifiche: i cavi di un ingresso non sono protetti dagli interruttori dell'altro ingresso
  init: () => ({ src: 'normal', vN: 0, vE: 0, okN: false, okE: false, t: 0 }),
  elements(inst) {
    const n = inst.state.src === 'normal';
    return [
      sw('a0', '1', '2', n), sw('a1', '3', '4', n), sw('a2', '5', '6', n), sw('aN', 'N1', 'N2', n),
      sw('e0', '7', '2', !n), sw('e1', '9', '4', !n), sw('e2', '11', '6', !n), sw('eN', 'N3', 'N2', !n),
    ];
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const Vph = sysOf(ctx.env).Vph;
    s.vN = Math.max(cabs(ctx.Vd('1', 'N1')), cabs(ctx.Vd('1', '3')) / Math.sqrt(3));
    s.vE = Math.max(cabs(ctx.Vd('7', 'N3')), cabs(ctx.Vd('7', '9')) / Math.sqrt(3));
    s.okN = s.vN > 0.7 * Vph;
    s.okE = s.vE > 0.7 * Vph;
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    const p = inst.params;
    if (s.src === 'normal') {
      if (!s.okN && s.okE) {
        s.t += dt;
        if (s.t >= p.ritardo) {
          s.src = 'emerg';
          s.t = 0;
          ctx.emit({ level: 'warn', text: `${inst.tag}: manca la rete normale — commutazione sulla rete di EMERGENZA.`, sound: 'relay' });
          return true;
        }
      } else s.t = 0;
    } else if (s.okN) {
      s.t += dt;
      if (s.t >= p.ritorno) {
        s.src = 'normal';
        s.t = 0;
        ctx.emit({ level: 'info', text: `${inst.tag}: rete normale rientrata — ritorno sulla rete normale.`, sound: 'relay' });
        return true;
      }
    } else s.t = 0;
    return false;
  },
  paths: () => [['1', '2'], ['3', '4'], ['5', '6'], ['N1', 'N2'], ['7', '2'], ['9', '4'], ['11', '6'], ['N3', 'N2']],
  readouts(inst) {
    const s = inst.state;
    return [
      { label: 'Uscita alimentata da', value: s.src === 'normal' ? 'Rete NORMALE (1-3-5)' : 'Rete di EMERGENZA (7-9-11)', level: s.src === 'normal' ? 'ok' : 'warn' },
      { label: 'Rete normale', value: s.okN ? `presente (${fmtV(s.vN)})` : 'assente', level: s.okN ? 'ok' : 'error' },
      { label: 'Rete di emergenza', value: s.okE ? `presente (${fmtV(s.vE)})` : 'assente', level: s.okE ? 'ok' : 'off' },
    ];
  },
};

// ── Gruppo di continuità (UPS) ────────────────────────────────────────────────────────
export const ups = {
  type: 'ups',
  name: 'Gruppo di continuità (UPS)',
  short: 'UPS',
  family: 'alimentazione',
  mount: 'din',
  modules: 6,
  tag: 'U',
  help:
    'Alimenta l’uscita (2-N2) dalla rete quando c’è tensione in ingresso (1-N1) e dalla batteria quando manca: ' +
    'copre i secondi di avviamento del gruppo di emergenza per luci, strumenti e comandi (SOLAS: alimentazione ' +
    'di emergenza entro 45 s). Monofase.',
  params: [
    P.select('Sn', 'Potenza', [0.5, 1, 2, 3], 1, { unit: 'kVA' }),
    P.select('aut', 'Autonomia della batteria a pieno carico', [5, 10, 30, 60], 10, { unit: 'min' }),
  ],
  terminals: () => [T('1', '1', 'L', 'top', 0.25, 'line'), T('N1', 'N1', 'N', 'top', 0.75, 'line'), T('2', '2', 'L', 'bottom', 0.25, 'load'), T('N2', 'N2', 'N', 'bottom', 0.75, 'load')],
  init: () => ({ mode: 'spento', batt: 1, P: 0, vin: 0, armed: false }),
  elements(inst, env) {
    const s = inst.state;
    const p = inst.params;
    const Vph = sysOf(env).Vph;
    const els = [res('chg', '1', 'N1', (Vph * Vph) / 60)]; // elettronica e caricabatterie ≈ 60 VA
    if (s.mode === 'rete') els.push(sw('p', '1', '2', true), sw('n', 'N1', 'N2', true));
    else if (s.mode === 'batteria') {
      const z = ((Vph * Vph) / (p.Sn * 1000)) * 0.05;
      els.push(source('s', '2', '#u', Vph, 0, { re: z, im: z * 0.3 }), sw('n', 'N2', '#u', true));
    }
    return els;
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const p = inst.params;
    const Vph = sysOf(ctx.env).Vph;
    s.vin = cabs(ctx.Vd('1', 'N1'));
    const inOk = s.vin > 0.7 * Vph;
    if (inOk) s.armed = true; // l'UPS entra in servizio con la rete: a impianto mai alimentato resta spento
    const mode = inOk ? 'rete' : s.armed && s.batt > 0 ? 'batteria' : 'spento';
    s.P = s.mode === 'batteria' ? power(csub(ctx.V('2'), ctx.V('#u')), ctx.I('s')).P : s.mode === 'rete' ? power(ctx.Vd('1', 'N1'), ctx.I('p')).P : 0;
    if (mode !== s.mode) {
      if (mode === 'batteria') ctx.emit({ level: 'warn', text: `${inst.tag}: manca la rete — uscita alimentata dalla BATTERIA (autonomia ${fmt(p.aut * s.batt, 0)} min a pieno carico).`, sound: 'relay' });
      else if (mode === 'rete' && s.mode === 'batteria') ctx.emit({ level: 'info', text: `${inst.tag}: rete rientrata, batteria in ricarica.`, sound: 'relay' });
      else if (mode === 'spento' && s.mode === 'batteria') ctx.emit({ level: 'error', text: `${inst.tag}: BATTERIA ESAURITA — uscita senza tensione.`, sound: 'trip' });
      s.mode = mode;
      return true;
    }
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    const p = inst.params;
    if (s.mode === 'batteria') {
      const k = Math.max(0.15, Math.abs(s.P) / (p.Sn * 800));
      s.batt = Math.max(0, s.batt - (dt * k) / (p.aut * 60));
      if (s.batt <= 0) return true;
    } else if (s.mode === 'rete' && s.batt < 1) s.batt = Math.min(1, s.batt + dt / 600);
    return false;
  },
  paths: () => [['1', '2'], ['N1', 'N2']],
  readouts(inst) {
    const s = inst.state;
    const p = inst.params;
    return [
      { label: 'Modo', value: s.mode === 'rete' ? 'Da rete (batteria in carica)' : s.mode === 'batteria' ? 'DA BATTERIA' : 'Spento', level: s.mode === 'rete' ? 'ok' : s.mode === 'batteria' ? 'warn' : 'off' },
      { label: 'Batteria', value: `${fmt(s.batt * 100, 0)} %`, bar: clamp(s.batt, 0, 1), level: s.batt < 0.2 ? 'error' : undefined },
      { label: 'Autonomia residua stimata', value: s.mode === 'batteria' ? `${fmt((p.aut * s.batt) / Math.max(0.15, Math.abs(s.P) / (p.Sn * 800)), 1)} min` : `${fmt(p.aut * s.batt, 0)} min a pieno carico` },
      { label: 'Potenza in uscita', value: fmtW(Math.abs(s.P)) },
      { label: 'Tensione in ingresso', value: fmtV(s.vin) },
    ];
  },
};
