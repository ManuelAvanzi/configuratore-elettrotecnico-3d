// Componenti in media tensione (modulo B): consegna MT del distributore, cella MT con sezionatore, interruttore,
// sezionatore di terra e relè di protezione (ANSI 50/51 e 51N) con gli interblocchi di manovra, trasformatore
// MT/BT in resina (gruppo Dyn11, vcc %, corrente di inserzione) e interruttore generale BT scatolato con
// sganciatore elettronico L-S-I. Riferimenti: CEI 0-16 (connessione alle reti MT), CEI 11-27 (lavori elettrici),
// ABB Quaderno di applicazione tecnica n. 2 (cabine MT/BT) e n. 12 (sistemi navali, cap. 5-6).
import { source, res, imp, impPolar, sw, xfmr, T, P, thermalUpdate, clamp } from './common.js';
import { csub, cabs, cadd, power } from '../../sim/complex.js';
import { SYSTEMS, BT_SYSTEMS, MT_SYSTEMS, sysOptions, mtSysOf, fmtV, fmtKV, fmtA, fmtW, fmt } from '../../sim/norms.js';

const PH = ['L1', 'L2', 'L3'];

/** Sistema MT “di riferimento” per una cella: quello a monte dichiarato dalla sorgente, altrimenti 20 kV */
const mtSys = (env) => mtSysOf(env) || SYSTEMS.mt20;

// ── Consegna MT dal distributore ─────────────────────────────────────────────────────
export const mtin = {
  type: 'mtin',
  name: 'Consegna MT dal distributore (arrivo linea 20 kV)',
  short: 'Consegna MT',
  family: 'mt',
  mount: 'field',
  span: 1,
  tag: 'XM',
  source: true,
  help:
    'Il punto di consegna in media tensione: la linea del distributore arriva a 20 kV nel locale consegna e da lì ' +
    'passa alla cabina dell’utente (CEI 0-16). Il distributore comunica la corrente di cortocircuito trifase e la ' +
    'corrente di guasto monofase a terra, piccola perché la rete MT ha il neutro compensato o isolato: la rileva la ' +
    'protezione 51N. Le utenze stanno in bassa tensione a valle del trasformatore MT/BT.',
  params: [
    P.select('net', 'Tensione e frequenza di consegna', sysOptions(MT_SYSTEMS), 'mt20'),
    P.select('Icc', 'Corrente di cortocircuito trifase presunta', [6.3, 8, 10, 12.5, 16], 12.5, { unit: 'kA', help: 'Comunicata dal distributore (CEI 0-16, tipicamente 12,5 kA a 20 kV): fissa il potere di interruzione delle celle MT e, attraverso il trasformatore, la Icc in BT.' }),
    P.select('Ig', 'Corrente di guasto monofase a terra', [20, 40, 50, 100, 200], 50, { unit: 'A', help: 'Rete MT con neutro compensato o isolato: il guasto a terra è una corrente piccola, che le protezioni di fase non vedono. La rileva la 51N e determina la tensione totale di terra della cabina (Re · Ig).' }),
    P.select('bt', 'Rete BT a valle del trasformatore', sysOptions(BT_SYSTEMS), 'it230', { help: 'Il sistema di distribuzione visto dalle utenze: con la cabina propria il neutro è a terra in cabina (TN-S).' }),
    P.number('Re', 'Resistenza di terra della cabina', 0.5, 50, 0.5, 2, 'Ω', { help: 'Dispersore unico MT/BT della cabina (CEI 99-3): la tensione totale di terra Re · Ig deve restare sotto il limite ammesso per il tempo di eliminazione del guasto.' }),
  ],
  terminals: () => [
    T('L1', 'L1', 'L', 'top', 0.15, 'load'), T('L2', 'L2', 'L', 'top', 0.38, 'load'), T('L3', 'L3', 'L', 'top', 0.61, 'load'),
    T('PE', 'PE', 'PE', 'top', 0.85, 'load'),
  ],
  init: () => ({ on: false, P: 0, Q: 0, I: [0, 0, 0], Ie: 0, kWh: 0 }),
  elements(inst) {
    const p = inst.params;
    const s = inst.state;
    const sys = SYSTEMS[p.net] || SYSTEMS.mt20;
    const V = s.on ? sys.Vph : 0;
    const z = sys.Vph / (p.Icc * 1000);
    const zs = { re: z * 0.3, im: z * 0.954 }; // rete MT: X/R ≈ 3
    const els = PH.map((t, k) => source('s' + t, t, '#s', V, -120 * k, zs));
    els.push(res('rn', '#s', 'GND', sys.Vph / p.Ig)); // neutro del distributore: limita il guasto a terra a Ig
    els.push(res('re', 'PE', 'GND', p.Re)); // dispersore della cabina
    return els;
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    let P = 0;
    let Q = 0;
    PH.forEach((t, k) => {
      const i = ctx.I('s' + t);
      const pw = power(csub(ctx.V(t), ctx.V('#s')), i);
      P += pw.P;
      Q += pw.Q;
      s.I[k] = cabs(i);
    });
    s.P = P;
    s.Q = Q;
    s.Ie = cabs(ctx.I('rn'));
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    if (s.on) s.kWh += (Math.max(0, s.P) * dt) / 3.6e6;
    return false;
  },
  interact: {
    power(inst) {
      const s = inst.state;
      s.on = !s.on;
      return { sound: s.on ? 'switch-on' : 'switch-off', msg: s.on ? `${inst.tag}: consegna in tensione (${fmtKV((SYSTEMS[inst.params.net] || SYSTEMS.mt20).Vll)}).` : `${inst.tag}: consegna fuori tensione.` };
    },
  },
  setPower(inst, on) {
    inst.state.on = on;
  },
  system: (p) => ({ ...(SYSTEMS[p.bt] || SYSTEMS.it230), earth: 'TN-S', mtSys: SYSTEMS[p.net] || SYSTEMS.mt20 }),
  paths: () => [],
  readouts(inst, ctx) {
    const p = inst.params;
    const s = inst.state;
    const sys = SYSTEMS[p.net] || SYSTEMS.mt20;
    const S = Math.hypot(s.P, s.Q);
    return [
      { label: 'Stato', value: s.on ? 'In tensione' : 'Fuori tensione', level: s.on ? 'ok' : 'off' },
      { label: 'Consegna', value: `${sysShortLabel(sys)} · Icc ${fmt(p.Icc, 1)} kA · guasto a terra ${p.Ig} A` },
      { label: 'Tensione L1-L2', value: fmtV(cabs(ctx.Vd('L1', 'L2'))) },
      { label: 'Correnti L1 · L2 · L3', value: s.I.map(fmtA).join(' · ') },
      { label: 'Potenza prelevata', value: `${fmtW(s.P)} · cosφ ${S > 1 ? fmt(s.P / S, 2) : '—'}` },
      { label: 'Corrente verso terra', value: fmtA(s.Ie), level: s.Ie > 1 ? 'warn' : undefined },
      { label: 'Tensione totale di terra Re · Ig', value: `${fmt(p.Re * p.Ig, 0)} V`, level: p.Re * p.Ig > 220 ? 'warn' : undefined },
      { label: 'Energia prelevata', value: `${fmt(s.kWh, 2)} kWh` },
    ];
  },
};

const sysShortLabel = (sys) => `${fmtKV(sys.Vll)} ${sys.f} Hz`;

// ── Cella MT: sezionatore, interruttore, sezionatore di terra, relè 50/51 e 51N ──────
export const mtcb = {
  type: 'mtcb',
  name: 'Cella MT con interruttore e relè di protezione (50/51, 51N)',
  short: 'Cella MT',
  family: 'mt',
  mount: 'field',
  span: 1,
  tag: 'QM',
  help:
    'Scomparto di un quadro MT: in alto il sezionatore di linea, al centro l’interruttore in vuoto (o SF6) con il ' +
    'relè di protezione, in basso il sezionatore di terra sul lato cavo. Gli interblocchi impediscono le manovre ' +
    'pericolose: non si apre il sezionatore sotto carico, non si chiude il sezionatore di terra con il sezionatore ' +
    'di linea chiuso o con tensione sul cavo. Il relè apre l’interruttore per sovracorrente (51, a tempo), per ' +
    'cortocircuito (50, rapida) e per guasto a terra (51N, misura della corrente omopolare 3Io).',
  params: [
    P.select('ruolo', 'Funzione della cella', [
      { value: 'dg', label: 'Protezione generale (DG, CEI 0-16)' },
      { value: 'tr', label: 'Protezione del trasformatore MT/BT' },
      { value: 'gen', label: 'Interruttore di generatore MT' },
      { value: 'arr', label: 'Arrivo / partenza linea' },
    ], 'tr'),
    P.select('In', 'Corrente nominale (TA del relè)', [50, 100, 200, 400, 630, 1250], 100, { unit: 'A' }),
    P.select('Icu', 'Potere di interruzione Icu', [12.5, 16, 20, 25, 31.5], 16, { unit: 'kA', help: 'Deve essere ≥ Icc presunta sulla sbarra MT.' }),
    P.number('I1', '51 — soglia di sovracorrente I>', 5, 2000, 5, 150, 'A', { help: 'Sovraccarico e guasti lontani: interviene dopo il ritardo t>. Per un trasformatore ≈ 1,2–1,5 × In primaria.' }),
    P.number('t1', '51 — ritardo t>', 0.1, 3, 0.05, 0.5, 's', { help: 'Deve lasciare il tempo all’interruttore generale BT di eliminare i guasti a valle (selettività cronometrica).' }),
    P.number('I2', '50 — soglia di cortocircuito I>>', 50, 6000, 10, 600, 'A', { help: 'Deve stare SOPRA la corrente di inserzione del trasformatore (≈ 10 × In) e sopra il cortocircuito BT riportato al primario, altrimenti scatta per guasti che spettano al generale BT.' }),
    P.number('t2', '50 — ritardo t>>', 0.05, 1, 0.01, 0.12, 's'),
    P.number('Io', '51N — soglia di guasto a terra Io>', 0.5, 200, 0.5, 2, 'A', { help: 'Corrente omopolare 3Io: deve stare sotto la corrente di guasto monofase a terra della rete (≈ 40 % di Ig).' }),
    P.number('to', '51N — ritardo to>', 0.1, 2, 0.05, 0.17, 's'),
  ],
  terminals: () => [
    T('1', '1', 'L', 'top', 0.18, 'line'), T('3', '3', 'L', 'top', 0.38, 'line'), T('5', '5', 'L', 'top', 0.58, 'line'), T('PE', 'PE', 'PE', 'top', 0.84),
    T('2', '2', 'L', 'bottom', 0.18, 'load'), T('4', '4', 'L', 'bottom', 0.38, 'load'), T('6', '6', 'L', 'bottom', 0.58, 'load'),
  ],
  // la cella parte in servizio (sezionatore e interruttore chiusi), come gli altri apparecchi di manovra del banco
  init: () => ({ sez: true, int: true, terra: false, tripped: false, cause: null, I: [0, 0, 0], Imax: 0, Io: 0, vLine: 0, vCable: 0, t1: 0, t2: 0, to: 0, ops: 0, lastTrip: 0 }),
  elements(inst) {
    const s = inst.state;
    const els = [];
    ['1', '3', '5'].forEach((t, k) => {
      els.push(sw('s' + k, t, '#' + k, s.sez)); // sezionatore di linea
      els.push(sw('p' + k, '#' + k, ['2', '4', '6'][k], s.int)); // interruttore
      els.push(sw('e' + k, ['2', '4', '6'][k], 'GND', s.terra)); // sezionatore di terra (lato cavo)
    });
    return els;
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const I = [0, 1, 2].map((k) => ctx.I('p' + k));
    s.I = I.map(cabs);
    s.Imax = Math.max(...s.I);
    s.Io = cabs(cadd(cadd(I[0], I[1]), I[2]));
    s.vLine = Math.max(cabs(ctx.Vd('1', '3')), cabs(ctx.Vd('3', '5')), cabs(ctx.Vd('5', '1')));
    s.vCable = Math.max(cabs(ctx.Vd('2', '4')), cabs(ctx.Vd('4', '6')), cabs(ctx.Vd('6', '2')));
    const Vll = mtSys(ctx.env).Vll;
    s.vpisLine = s.vLine > 0.3 * Vll; // indicatori di presenza tensione
    s.vpisCable = s.vCable > 0.3 * Vll;
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    const p = inst.params;
    if (!s.int) {
      s.t1 = s.t2 = s.to = 0;
      return false;
    }
    const trip = (cause, text) => {
      s.int = false;
      s.tripped = true;
      s.cause = cause;
      s.ops++;
      s.lastTrip = s.Imax;
      s.t1 = s.t2 = s.to = 0;
      ctx.emit({ level: 'error', text, sound: 'trip-short' });
      return true;
    };
    if (s.Imax >= p.I2) {
      s.t2 += dt;
      if (s.t2 >= p.t2 - 1e-9) return trip('50 — cortocircuito', `${inst.tag}: intervento 50 (I>>) — ${fmtA(s.Imax)} ≥ ${fmtA(p.I2)} per ${fmt(p.t2, 2)} s: cortocircuito (o corrente di inserzione del trasformatore se la soglia è troppo bassa).`);
    } else s.t2 = 0;
    if (s.Imax >= p.I1) {
      s.t1 += dt;
      if (s.t1 >= p.t1 - 1e-9) return trip('51 — sovracorrente', `${inst.tag}: intervento 51 (I>) — ${fmtA(s.Imax)} ≥ ${fmtA(p.I1)} per ${fmt(p.t1, 2)} s: sovraccarico o guasto non eliminato a valle.`);
    } else s.t1 = Math.max(0, s.t1 - dt);
    if (s.Io >= p.Io) {
      s.to += dt;
      if (s.to >= p.to - 1e-9) return trip('51N — guasto a terra', `${inst.tag}: intervento 51N — corrente omopolare ${fmtA(s.Io)} ≥ ${fmtA(p.Io)} per ${fmt(p.to, 2)} s: guasto a terra in media tensione.`);
    } else s.to = 0;
    return false;
  },
  interact: {
    sez(inst, ctx) {
      const s = inst.state;
      if (s.sez) {
        if (s.int) return { level: 'error', msg: `${inst.tag}: INTERBLOCCO — non si apre il sezionatore di linea con l’interruttore chiuso (aprirebbe sotto carico, con l’arco). Apri prima l’interruttore.` };
        s.sez = false;
        return { sound: 'switch-off', msg: `${inst.tag}: sezionatore di linea aperto — la cella è sezionata dalla sbarra.` };
      }
      if (s.terra) return { level: 'error', msg: `${inst.tag}: INTERBLOCCO — il sezionatore di terra è chiuso: aprilo prima di richiudere il sezionatore di linea (chiuderebbe un cortocircuito verso terra).` };
      s.sez = true;
      return { sound: 'switch-on', msg: `${inst.tag}: sezionatore di linea chiuso${s.vLine > 0.3 * mtSys(ctx.env).Vll ? ' — tensione presente fino all’interruttore' : ''}.` };
    },
    int(inst) {
      const s = inst.state;
      if (s.int) {
        s.int = false;
        s.ops++;
        return { sound: 'switch-off', msg: `${inst.tag}: interruttore aperto.` };
      }
      if (s.tripped) return { level: 'error', msg: `${inst.tag}: relè intervenuto (${s.cause}). Elimina la causa e usa “Ripristina protezione”.` };
      if (!s.sez) return { level: 'warn', msg: `${inst.tag}: INTERBLOCCO — chiudi prima il sezionatore di linea, poi l’interruttore.` };
      if (s.terra) return { level: 'error', msg: `${inst.tag}: INTERBLOCCO — sezionatore di terra chiuso: non si può chiudere l’interruttore.` };
      s.int = true;
      s.ops++;
      return { sound: 'switch-on', msg: `${inst.tag}: interruttore chiuso.` };
    },
    terra(inst, ctx) {
      const s = inst.state;
      if (s.terra) {
        s.terra = false;
        return { sound: 'switch-off', msg: `${inst.tag}: sezionatore di terra aperto.` };
      }
      if (s.sez || s.int) return { level: 'error', msg: `${inst.tag}: INTERBLOCCO — il sezionatore di terra si chiude solo con interruttore e sezionatore di linea aperti (regole 1 e 2: sezionare e assicurare contro la richiusura).` };
      if (s.vCable > 0.2 * mtSys(ctx.env).Vll) return { level: 'error', msg: `${inst.tag}: TENSIONE PRESENTE sul lato cavo (${fmtV(s.vCable)}): la messa a terra non si fa senza aver verificato l’assenza di tensione (regola 3). C’è un’alimentazione dal lato utenza?` };
      s.terra = true;
      return { sound: 'switch-on', msg: `${inst.tag}: sezionatore di terra chiuso — lato cavo messo a terra e in cortocircuito (regola 4): si può lavorare.` };
    },
    resetTrip(inst) {
      const s = inst.state;
      if (!s.tripped) return { msg: `${inst.tag}: nessuna protezione da ripristinare.` };
      s.tripped = false;
      s.cause = null;
      return { sound: 'click', msg: `${inst.tag}: relè ripristinato (interruttore aperto: richiudilo quando la causa è stata rimossa).` };
    },
  },
  protection: (p) => ({ kind: 'mtcb', mt: true, In: p.In, pdi: p.Icu, poles: [['1', '2'], ['3', '4'], ['5', '6']], overcurrent: true, ruolo: p.ruolo, relay: { I1: p.I1, t1: p.t1, I2: p.I2, t2: p.t2, Io: p.Io, to: p.to } }),
  paths: () => [['1', '2'], ['3', '4'], ['5', '6']],
  readouts(inst, ctx) {
    const s = inst.state;
    const p = inst.params;
    const Vll = mtSys(ctx.env).Vll;
    const pos = s.terra ? 'A TERRA (lato cavo)' : s.int ? 'IN SERVIZIO' : s.sez ? 'Sezionatore chiuso, interruttore aperto' : 'SEZIONATA';
    return [
      { label: 'Stato', value: s.tripped ? `SCATTATO (${s.cause})` : pos, level: s.tripped ? 'error' : s.int ? 'ok' : s.terra ? 'warn' : 'off' },
      { label: 'Sezionatore · interruttore · terra', value: `${s.sez ? 'chiuso' : 'aperto'} · ${s.int ? 'chiuso' : 'aperto'} · ${s.terra ? 'CHIUSO' : 'aperto'}` },
      { label: 'Presenza tensione (VPIS)', value: `linea ${s.vLine > 0.3 * Vll ? '● ● ●' : '○ ○ ○'} · cavo ${s.vCable > 0.3 * Vll ? '● ● ●' : '○ ○ ○'}`, level: s.vCable > 0.3 * Vll && !s.int ? 'warn' : undefined },
      { label: 'Tensione lato linea · lato cavo', value: `${fmtV(s.vLine)} · ${fmtV(s.vCable)}` },
      { label: 'Correnti L1 · L2 · L3', value: s.I.map(fmtA).join(' · ') + ` (In ${p.In} A)`, level: s.Imax > p.I1 ? 'warn' : undefined },
      { label: 'Corrente omopolare 3Io', value: fmtA(s.Io), level: s.Io > p.Io ? 'error' : undefined },
      { label: 'Relè 51 · 50 · 51N', value: `I> ${fmtA(p.I1)} / ${fmt(p.t1, 2)} s · I>> ${fmtA(p.I2)} / ${fmt(p.t2, 2)} s · Io> ${fmtA(p.Io)} / ${fmt(p.to, 2)} s` },
      { label: 'Icu', value: `${fmt(p.Icu, 1)} kA` },
      { label: 'Manovre dell’interruttore', value: String(s.ops) },
    ];
  },
};

// ── Trasformatore MT/BT in resina ────────────────────────────────────────────────────
/** Dati nominali del trasformatore: correnti, impedenza di cortocircuito, Icc al secondario (anche con rete MT finita) */
export function mtxRated(p, IccMT = null) {
  const s1 = SYSTEMS[p.V1] || SYSTEMS.mt20;
  const s2 = SYSTEMS[p.V2] || SYSTEMS.it230;
  const Sn = p.Sn * 1000;
  const In1 = Sn / (Math.sqrt(3) * s1.Vll);
  const In2 = Sn / (Math.sqrt(3) * s2.Vll);
  const vcc = p.vcc / 100;
  const zcc = (vcc * s2.Vll * s2.Vll) / Sn; // per fase, riportata al secondario
  const Icc2inf = In2 / vcc; // rete MT a potenza infinita
  const Scc = IccMT ? Math.sqrt(3) * s1.Vll * IccMT * 1000 : Infinity;
  const Icc2 = Number.isFinite(Scc) ? In2 / (vcc + Sn / Scc) : Icc2inf;
  const delta = (p.gruppo || 'Dyn11').startsWith('D');
  const n = delta ? s1.Vll / s2.Vph : s1.Vph / s2.Vph;
  return { s1, s2, Sn, In1, In2, vcc, zcc, Icc2, Icc2inf, n, delta, Icc2ref: (Icc2 * s2.Vll) / s1.Vll, inrush: 10 * In1 };
}

export const mtx = {
  type: 'mtx',
  name: 'Trasformatore MT/BT in resina',
  short: 'Trasformatore MT/BT',
  family: 'mt',
  mount: 'field',
  span: 2,
  tag: 'T',
  help:
    'Abbassa la tensione dalla media tensione alla bassa tensione delle utenze. Gruppo Dyn11: primario a triangolo, ' +
    'secondario a stella con il neutro disponibile (a terra in cabina: sistema TN-S). La tensione di cortocircuito ' +
    'vcc fissa la corrente di cortocircuito in BT (Icc ≈ In / vcc) e la caduta di tensione interna. All’inserzione ' +
    'assorbe per un decimo di secondo circa 10 volte la corrente nominale: la soglia rapida del relè MT deve ' +
    'starci sopra. Sovraccaricato si scalda: le sonde di temperatura danno allarme.',
  params: [
    P.select('Sn', 'Potenza nominale Sn', [100, 160, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000], 400, { unit: 'kVA' }),
    P.select('V1', 'Tensione primaria', sysOptions(MT_SYSTEMS), 'mt20'),
    P.select('V2', 'Tensione secondaria (rete BT)', sysOptions(BT_SYSTEMS), 'it230'),
    P.select('vcc', 'Tensione di cortocircuito vcc', [4, 6, 8], 6, { unit: '%', help: 'Bassa: Icc in BT alta e poca caduta di tensione. Alta: il contrario. Per le macchine in resina 6 % è il valore tipico.' }),
    P.select('gruppo', 'Gruppo vettoriale', [
      { value: 'Dyn11', label: 'Dyn11 — primario a triangolo, secondario a stella con neutro (standard di cabina)' },
      { value: 'Dyn5', label: 'Dyn5 — come Dyn11 con sfasamento di 150°' },
      { value: 'Yyn0', label: 'Yyn0 — stella-stella (sconsigliato con carichi squilibrati)' },
    ], 'Dyn11'),
    P.select('earthBT', 'Neutro BT', [
      { value: 'TN', label: 'A terra in cabina — sistema TN-S (cabina propria)' },
      { value: 'IT', label: 'Isolato — sistema IT (bordo nave, continuità di servizio)' },
    ], 'TN'),
    P.number('Rins', 'Resistenza di isolamento della rete BT (IT)', 5, 1000, 5, 200, 'kΩ', { teacher: true, help: 'Solo con il neutro BT isolato: isolamento verso massa della rete sana.' }),
  ],
  terminals: () => [
    T('1', '1U', 'L', 'top', 0.12, 'line'), T('3', '1V', 'L', 'top', 0.28, 'line'), T('5', '1W', 'L', 'top', 0.44, 'line'), T('PE', 'PE', 'PE', 'top', 0.86),
    T('2', '2U', 'L', 'bottom', 0.12, 'load'), T('4', '2V', 'L', 'bottom', 0.28, 'load'), T('6', '2W', 'L', 'bottom', 0.44, 'load'), T('N', '2N', 'N', 'bottom', 0.62, 'load'),
  ],
  init: () => ({ live: false, inrush: false, tIn: 0, P: 0, Q: 0, S: 0, I1: 0, I2: [0, 0, 0], I2max: 0, V1: 0, V2: 0, loading: 0, theta: 0, overtemp: false }),
  elements(inst) {
    const p = inst.params;
    const s = inst.state;
    const r = mtxRated(p);
    const prim = r.delta ? [['1', '3'], ['3', '5'], ['5', '1']] : [['1', '#n1'], ['3', '#n1'], ['5', '#n1']];
    const sec = ['#a', '#b', '#c'];
    const els = prim.map(([a, b], k) => xfmr('x' + k, a, b, sec[k], '#n2', r.n));
    ['2', '4', '6'].forEach((t, k) => els.push(imp('z' + k, sec[k], t, r.zcc * 0.2, r.zcc * 0.98))); // impedenza di cortocircuito (X/R ≈ 5)
    els.push(sw('n', '#n2', 'N', true));
    if (p.earthBT === 'IT') els.push(res('rins', '#n2', 'GND', p.Rins * 1000));
    else {
      els.push(sw('npe', '#n2', 'PE', true)); // centro stella collegato al collettore di terra della cabina: origine del TN-S
      els.push(res('rn', '#n2', 'GND', 1.0));
    }
    if (s.inrush) {
      // corrente di magnetizzazione all'inserzione: ≈ 10 In al primario per un decimo di secondo
      const Z = r.s1.Vph / r.inrush;
      ['1', '3', '5'].forEach((t, k) => els.push(impPolar('m' + k, t, '#mg', Z, 1.4)));
    }
    return els;
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const r = mtxRated(inst.params);
    s.V1 = Math.max(cabs(ctx.Vd('1', '3')), cabs(ctx.Vd('3', '5')), cabs(ctx.Vd('5', '1')));
    s.V2 = Math.max(cabs(ctx.Vd('2', '4')), cabs(ctx.Vd('4', '6')), cabs(ctx.Vd('6', '2')));
    let P = 0;
    let Q = 0;
    const I2 = [];
    ['#a', '#b', '#c'].forEach((n, k) => {
      const i = ctx.I('z' + k);
      const pw = power(csub(ctx.V(n), ctx.V('#n2')), i);
      P += pw.P;
      Q += pw.Q;
      I2.push(cabs(i));
    });
    s.P = P;
    s.Q = Q;
    s.S = Math.hypot(P, Q);
    s.I2 = I2;
    s.I2max = Math.max(...I2);
    s.I1 = s.S / (Math.sqrt(3) * r.s1.Vll);
    s.loading = s.S / r.Sn;
    const live = s.V1 > 0.7 * r.s1.Vll;
    if (live && !s.live) {
      s.live = true;
      s.inrush = true;
      s.tIn = 0;
      ctx.emit({ level: 'info', text: `${inst.tag}: inserzione — corrente di magnetizzazione ≈ 10 × In (${fmtA(r.inrush)}) per circa un decimo di secondo.`, sound: 'hum' });
      return true;
    }
    if (!live && s.live) {
      s.live = false;
      s.inrush = false;
      return true;
    }
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    const r = mtxRated(inst.params);
    let ch = false;
    if (s.inrush) {
      s.tIn += dt;
      if (s.tIn >= 0.15) {
        s.inrush = false;
        ch = true;
      }
    }
    // riscaldamento (sonde PT100 negli avvolgimenti): allarme per sovraccarico prolungato
    const x = s.live ? s.I2max / r.In2 : 0;
    if (thermalUpdate(s, x, dt, 400, 600) && !s.overtemp) {
      s.overtemp = true;
      ctx.emit({ level: 'error', text: `${inst.tag}: ALLARME TEMPERATURA — sovraccarico ${fmt(x * 100, 0)} % di In per troppo tempo: le sonde comandano lo sgancio dell’interruttore MT a monte. Riduci il carico.`, sound: 'limiter' });
    } else if (s.overtemp && (s.theta || 0) < 0.5) s.overtemp = false;
    return ch;
  },
  protection: (p) => ({ kind: 'transformer', mt: true, In: mtxRated(p).In2, poles: [['1', '2'], ['3', '4'], ['5', '6']], overcurrent: false }),
  barrier: true, // per le verifiche: i cavi MT a monte non sono protetti dall'interruttore generale BT
  paths: () => [['1', '2'], ['3', '4'], ['5', '6']],
  readouts(inst) {
    const s = inst.state;
    const p = inst.params;
    const r = mtxRated(p);
    return [
      { label: 'Stato', value: s.overtemp ? 'ALLARME TEMPERATURA' : s.inrush ? 'Inserzione (corrente di magnetizzazione)' : s.live ? 'In tensione' : 'Fuori tensione', level: s.overtemp ? 'error' : s.live ? 'ok' : 'off' },
      { label: 'Targa', value: `${p.Sn} kVA · ${fmtKV(r.s1.Vll)} / ${fmtKV(r.s2.Vll)} · ${p.gruppo} · vcc ${p.vcc} %` },
      { label: 'Correnti nominali In1 · In2', value: `${fmtA(r.In1)} · ${fmtA(r.In2)}` },
      { label: 'Tensione primario · secondario', value: `${fmtV(s.V1)} · ${fmtV(s.V2)}` },
      { label: 'Carico', value: `${fmt(s.loading * 100, 0)} % (${fmtW(s.S).replace('W', 'VA')})`, bar: clamp(s.loading, 0, 1), level: s.loading > 1 ? 'warn' : undefined },
      { label: 'Correnti secondario', value: s.I2.map(fmtA).join(' · ') },
      { label: 'Icc al secondario (rete MT infinita)', value: `${fmtA(r.Icc2inf)} (In2 / vcc)` },
      { label: 'Corrente di inserzione', value: `≈ ${fmtA(r.inrush)} al primario (10 × In1)` },
      { label: 'Riscaldamento avvolgimenti', value: `${fmt(clamp(s.theta || 0, 0, 1) * 100, 0)} %`, bar: clamp(s.theta || 0, 0, 1), level: s.overtemp ? 'error' : undefined },
      { label: 'Neutro BT', value: p.earthBT === 'IT' ? 'Isolato (IT)' : 'A terra in cabina (TN-S)' },
    ];
  },
};

// ── Interruttore generale BT scatolato con sganciatore elettronico L-S-I ────────────
const POLES = [['1', '2', 'L'], ['3', '4', 'L'], ['5', '6', 'L'], ['N1', 'N2', 'N']];

export const mccb = {
  type: 'mccb',
  name: 'Interruttore scatolato 4P con sganciatore elettronico L-S-I',
  short: 'Scatolato L-S-I 4P',
  family: 'protezione',
  mount: 'din',
  modules: 6,
  tag: 'Q',
  style: 'industrial',
  help:
    'Interruttore generale del quadro BT a valle del trasformatore (160–1600 A). Lo sganciatore elettronico ha ' +
    'tre funzioni regolabili: L (lungo ritardo, sovraccarico, soglia Ir), S (breve ritardo, cortocircuito con ' +
    'ritardo tsd per la selettività con le partenze) e I (istantanea). Con la S ritardata un guasto su una partenza ' +
    'viene eliminato dalla partenza e non dal generale: selettività cronometrica.',
  params: [
    P.select('In', 'Corrente nominale In (taglia)', [160, 250, 400, 630, 800, 1000, 1250, 1600], 630, { unit: 'A' }),
    P.select('Ir', 'L — regolazione Ir (× In)', [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1], 1, { help: 'Soglia termica: Ir ≈ corrente nominale del secondario del trasformatore e ≤ portata dei cavi.' }),
    P.select('Isd', 'S — soglia Isd (× Ir)', [1.5, 2, 3, 4, 5, 6, 8, 10], 6),
    P.select('tsd', 'S — ritardo tsd', [0.05, 0.1, 0.2, 0.3, 0.5], 0.2, { unit: 's', help: 'Ritardo intenzionale: lascia intervenire prima le partenze (selettività) e precede il relè MT (t> della 51).' }),
    P.select('Ii', 'I — soglia istantanea Ii (× In)', [{ value: 0, label: 'OFF (solo S ritardata)' }, 4, 6, 8, 10, 12], 10),
    P.select('Icu', 'Potere di interruzione Icu', [25, 36, 50, 70, 100], 36, { unit: 'kA', help: 'Deve essere ≥ Icc al secondario del trasformatore.' }),
  ],
  terminals: () => POLES.flatMap(([a, b, role], i) => {
    const x = (i + 0.5) / 4;
    return [T(a, a === 'N1' ? 'N' : a, role, 'top', x, 'line'), T(b, b === 'N2' ? 'N' : b, role, 'bottom', x, 'load')];
  }),
  init: () => ({ on: true, tripped: false, cause: null, theta: 0, damaged: false, I: 0, tS: 0, Ipeak: 0 }),
  elements: (inst) => POLES.map(([a, b], i) => sw('p' + i, a, b, inst.state.on)),
  evaluate(inst, ctx) {
    const s = inst.state;
    const p = inst.params;
    if (!s.on) {
      s.I = 0;
      return false;
    }
    let imax = 0;
    for (let i = 0; i < 3; i++) imax = Math.max(imax, cabs(ctx.I('p' + i)));
    s.I = imax;
    s.Ipeak = Math.max(s.Ipeak || 0, imax);
    if (p.Ii > 0 && imax >= p.Ii * p.In) {
      s.on = false;
      s.tripped = true;
      s.cause = 'istantaneo (I)';
      const damaged = imax > p.Icu * 1000;
      if (damaged) s.damaged = true;
      ctx.emit({ level: 'error', text: damaged ? `${inst.tag}: cortocircuito di ${fmtA(imax)} oltre il potere di interruzione (${p.Icu} kA) — apparecchio danneggiato!` : `${inst.tag}: intervento ISTANTANEO (I) — ${fmtA(imax)} ≥ ${fmtA(p.Ii * p.In)}.`, sound: 'trip-short' });
      return true;
    }
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    const p = inst.params;
    if (!s.on) {
      s.tS = 0;
      return false;
    }
    const Ir = p.Ir * p.In;
    if (s.I >= p.Isd * Ir) {
      s.tS += dt;
      if (s.tS >= p.tsd - 1e-9) {
        s.on = false;
        s.tripped = true;
        s.cause = 'breve ritardo (S)';
        s.tS = 0;
        ctx.emit({ level: 'error', text: `${inst.tag}: intervento S (breve ritardo) — ${fmtA(s.I)} ≥ ${fmtA(p.Isd * Ir)} per ${fmt(p.tsd, 2)} s: cortocircuito non eliminato dalle partenze.`, sound: 'trip-short' });
        return true;
      }
    } else s.tS = 0;
    const x = s.I / Ir;
    if (thermalUpdate(s, x, dt, 170) && s.on) {
      s.on = false;
      s.tripped = true;
      s.cause = 'lungo ritardo (L)';
      ctx.emit({ level: 'warn', text: `${inst.tag}: intervento L (lungo ritardo) per sovraccarico — ${fmtA(s.I)} su Ir = ${fmtA(Ir)} (${fmt(x, 2)} × Ir).`, sound: 'trip' });
      return true;
    }
    return false;
  },
  interact: {
    toggle(inst) {
      const s = inst.state;
      if (s.on) {
        s.on = false;
        s.tripped = false;
        s.cause = null;
        return { sound: 'switch-off' };
      }
      if (s.damaged) return { level: 'error', msg: `${inst.tag}: apparecchio danneggiato dal cortocircuito (potere di interruzione insufficiente). Usa “Sostituisci”.` };
      if ((s.theta || 0) > 0.85) return { level: 'warn', msg: `${inst.tag}: sganciatore ancora caldo, attendi prima di richiudere.` };
      s.on = true;
      s.tripped = false;
      s.cause = null;
      return { sound: 'switch-on' };
    },
    replace(inst) {
      Object.assign(inst.state, inst.def.init(inst.params), { on: false });
      return { msg: `${inst.tag}: apparecchio sostituito.`, sound: 'switch-off' };
    },
  },
  protection: (p) => ({ kind: 'mccb', In: p.Ir * p.In, frame: p.In, curve: 'LSI', pdi: p.Icu, poles: POLES.slice(0, 4).map(([a, b]) => [a, b]), overcurrent: true, lsi: { Ir: p.Ir * p.In, Isd: p.Isd * p.Ir * p.In, tsd: p.tsd, Ii: p.Ii ? p.Ii * p.In : null } }),
  paths: () => POLES.map(([a, b]) => [a, b]),
  readouts(inst) {
    const s = inst.state;
    const p = inst.params;
    const Ir = p.Ir * p.In;
    return [
      { label: 'Stato', value: s.damaged ? 'DANNEGGIATO' : s.tripped ? `SCATTATO (${s.cause})` : s.on ? 'Chiuso (ON)' : 'Aperto (OFF)', level: s.damaged || s.tripped ? 'error' : s.on ? 'ok' : 'off' },
      { label: 'Corrente (fase)', value: fmtA(s.I || 0) },
      { label: 'Carico rispetto a Ir', value: `${fmt(((s.I || 0) / Ir) * 100, 0)} % (Ir = ${fmtA(Ir)})`, level: (s.I || 0) > 1.13 * Ir ? 'warn' : undefined },
      { label: 'Riscaldamento (L)', value: `${fmt(clamp(s.theta || 0, 0, 1) * 100, 0)} %`, bar: clamp(s.theta || 0, 0, 1) },
      { label: 'Soglie S · I', value: `${fmtA(p.Isd * Ir)} / ${fmt(p.tsd, 2)} s · ${p.Ii ? fmtA(p.Ii * p.In) : 'OFF'}` },
      { label: 'Icu', value: `${p.Icu} kA` },
    ];
  },
};
