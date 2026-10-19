// Modelli predefiniti (Fase 1: introduzione al configuratore e ai modelli di riferimento).
import { build } from './builder.js';
import { blankProject } from '../core/project.js';

export const PRESETS = [
  {
    id: 'vuoto1f',
    title: 'Quadro vuoto monofase',
    text: 'Fornitura 230 V, sistema TT, 3 kW. Si parte dall’arrivo linea e dal collettore di terra.',
    icon: 'house',
    make: () => blankProject({ sys: '1F', title: 'Nuovo impianto monofase' }),
  },
  {
    id: 'vuoto3f',
    title: 'Quadro vuoto trifase',
    text: 'Fornitura 400 V + N, sistema TN-S, 10 kW: per automazione e motori.',
    icon: 'factory',
    make: () => {
      const p = blankProject({ sys: '3F', earth: 'TN-S', title: 'Nuovo impianto trifase' });
      p.components[0].params.Pc = 10;
      p.components[0].params.Icc = 6;
      return p;
    },
  },
  {
    id: 'appartamento',
    title: 'Quadro di un appartamento',
    text: 'Generale magnetotermico-differenziale, contatore di energia, linea luci 10 A e linea prese 16 A con comando da uno e da due punti.',
    icon: 'house',
    make: appartamento,
  },
  {
    id: 'motore',
    title: 'Teleavviamento di un motore',
    text: 'Motore asincrono trifase con contattore, relè termico, pulsantiera marcia-arresto con autoritenuta e spie di segnalazione.',
    icon: 'fan',
    make: motore,
  },
  {
    id: 'domotica',
    title: 'Comandi automatici per l’abitazione',
    text: 'Relè passo-passo da tre punti, luce scale temporizzata, crepuscolare per la luce esterna e rilevatore di presenza.',
    icon: 'sparkles',
    make: domotica,
  },
  {
    id: 'nave-vuoto',
    title: 'Quadro di bordo da configurare',
    text: 'Un gruppo da 50 kVA a 440 V 60 Hz con neutro isolato e il collettore di terra: tutto il resto lo monta lo studente (arrivo, controllo isolamento, partenze, utenze).',
    icon: 'waves',
    make: naveVuota,
  },
  {
    id: 'nave',
    title: 'Centrale elettrica di bordo',
    text: 'Due gruppi da 50 kVA a 440 V 60 Hz con neutro isolato (IT), presa di banchina, gruppo di emergenza con commutatore automatico e UPS, distacco dei carichi non essenziali, elica di manovra e luci di navigazione.',
    icon: 'waves',
    make: nave,
  },
  {
    id: 'traghetto',
    title: 'Traghetto: quadro a due semisbarre',
    text: 'Due gruppi da 100 kVA su due semisbarre unite da un congiuntore; pompe di sentina e antincendio, ventilazione del garage, cucina, aria condizionata e luci.',
    icon: 'waves',
    make: traghetto,
  },
  {
    id: 'cabina',
    title: 'Cabina MT/BT a 20 kV',
    text: 'Consegna a 20 kV, cella di protezione generale (DG) e cella del trasformatore con relè 50/51 e 51N, trasformatore in resina da 400 kVA Dyn11, quadro BT con interruttore generale scatolato L-S-I, motori, prese e luci.',
    icon: 'zap',
    make: cabina,
  },
  {
    id: 'nave-mt',
    title: 'Quadro MT di bordo a 6,6 kV',
    text: 'Grande nave: due gruppi da 2 MVA a 6,6 kV con celle di generatore, sbarra MT in isola, trasformatore di servizio 6,6 kV / 440 V da 630 kVA e quadro BT con neutro isolato (IT), eliche di manovra, pompe e luci.',
    icon: 'waves',
    make: naveMT,
  },
];

/** Cabina MT/BT di utente a 20 kV (CEI 0-16): consegna, DG, cella trasformatore, trasformatore in resina 400 kVA, quadro BT */
export function cabina() {
  return build({ sys: '3F', source: 'none', title: 'Cabina MT/BT a 20 kV', description: 'Cabina di trasformazione di un’utenza industriale: consegna a 20 kV con Icc 12,5 kA, cella di protezione generale (DG) regolata secondo la CEI 0-16, cella di protezione del trasformatore (51 con ritardo selettivo, 50 sopra la corrente di inserzione, 51N), trasformatore in resina da 400 kVA Dyn11 vcc 6 %, quadro BT 400 V TN-S con interruttore generale scatolato da 630 A (L-S-I) e partenze verso un motore da 22 kW, una pompa da 7,5 kW, prese e luci.' }, (b) => {
    // media tensione (pannello, riga A)
    b.add('XM', 'mtin', 'A1', { net: 'mt20', Icc: 12.5, Ig: 50, bt: 'it230', Re: 2 }, 'Consegna del distributore: 20 kV, Icc 12,5 kA, guasto a terra 50 A (CEI 0-16).');
    b.add('QM1', 'mtcb', 'A2', { ruolo: 'dg', In: 100, Icu: 16, I1: 250, t1: 0.5, I2: 600, t2: 0.12, Io: 2, to: 0.17 }, 'Dispositivo generale (DG): regolazioni standard CEI 0-16 — 51 a 250 A/0,5 s, 50 a 600 A/0,12 s, 51N a 2 A/0,17 s.');
    b.add('QM2', 'mtcb', 'A3', { ruolo: 'tr', In: 50, Icu: 16, I1: 15, t1: 0.3, I2: 250, t2: 0.05, Io: 2, to: 0.17 }, 'Protezione del trasformatore: 51 a 1,3 × In1 (11,5 A) con 0,3 s per lasciare intervenire il generale BT; 50 a 250 A, sopra l’inserzione (≈ 115 A) e sopra il cortocircuito BT riportato al primario (≈ 190 A).');
    b.add('T1', 'mtx', 'A4', { Sn: 400, V1: 'mt20', V2: 'it230', vcc: 6, gruppo: 'Dyn11', earthBT: 'TN' }, 'Trasformatore in resina 400 kVA, 20 kV / 400 V, Dyn11, vcc 6 %: In2 = 577 A, Icc al secondario ≈ 9,5 kA.');
    // quadro BT (guida 1: generale; guide 2-3: partenze)
    b.add('QG', 'mccb', 'R1:0', { In: 630, Ir: 0.95, Isd: 6, tsd: 0.1, Ii: 0, Icu: 36 }, 'Generale BT scatolato 630 A: Ir 0,95 (598 A ≈ In2), S a 6 × Ir ritardata di 0,1 s per la selettività con le partenze, istantanea esclusa; Icu 36 kA ≥ 9,5 kA.');
    b.add('Q1', 'mcb3p', 'R2:0', { In: 63, curve: 'D', pdi: 10 }, 'Compressore 22 kW: In 40 A, spunto ≈ 240 A; curva D.');
    b.add('Q2', 'mcb3p', 'R2:3', { In: 32, curve: 'C', pdi: 10 }, 'Pompa 7,5 kW.');
    b.add('Q3', 'rcbo1pn', 'R2:6', { In: 16, curve: 'C', pdi: 10, IDn: 0.03 }, 'Prese: magnetotermico-differenziale 30 mA.');
    b.add('Q4', 'mcb1pn', 'R2:8', { In: 10, curve: 'C', pdi: 10 }, 'Luci del capannone.');
    // utenze
    b.add('M1', 'm3', 'B1', { P: 22, conn: 'Y', load: 80 }, 'Compressore d’aria 22 kW.');
    b.add('M2', 'm3', 'B3', { P: 7.5, conn: 'Y', load: 70 }, 'Pompa di raffreddamento 7,5 kW.');
    b.add('E1', 'lamp', 'B5', { lt: 'led15' }, 'Luci.');
    b.add('XS1', 'xs', 'C1', { carico: 'pc', tipo: 'sch' }, 'Presa dell’ufficio.');
    b.add('XS2', 'xs', 'C2', { carico: 'drill', tipo: 'sch' }, 'Presa dell’officina.');
    // cavi MT (50 mm² in alluminio/rame, isolati a 20 kV) e terre della cabina
    b.wire('XM:L1', 'QM1:1', 50);
    b.wire('XM:L2', 'QM1:3', 50, 'black');
    b.wire('XM:L3', 'QM1:5', 50, 'grey');
    b.wire('QM1:2', 'QM2:1', 50);
    b.wire('QM1:4', 'QM2:3', 50, 'black');
    b.wire('QM1:6', 'QM2:5', 50, 'grey');
    b.wire('QM2:2', 'T1:1', 50);
    b.wire('QM2:4', 'T1:3', 50, 'black');
    b.wire('QM2:6', 'T1:5', 50, 'grey');
    b.wire('XM:PE', 'PE:PE1', 50);
    b.wire('QM1:PE', 'PE:PE2', 50);
    b.wire('QM2:PE', 'PE:PE3', 50);
    b.wire('T1:PE', 'PE:PE4', 50);
    // secondario del trasformatore → generale BT: 2 × 240 mm² per fase (In2 = 577 A)
    b.wire('T1:2', 'QG:1', 240, 'brown', 2);
    b.wire('T1:4', 'QG:3', 240, 'black', 2);
    b.wire('T1:6', 'QG:5', 240, 'grey', 2);
    b.wire('T1:N', 'QG:N1', 240, 'blue', 2);
    // sbarra BT a valle del generale
    b.wire('QG:2', 'Q1:1', 240, 'brown', 2);
    b.wire('QG:4', 'Q1:3', 240, 'black', 2);
    b.wire('QG:6', 'Q1:5', 240, 'grey', 2);
    b.wire('Q1:1', 'Q2:1', 240, 'brown', 2);
    b.wire('Q1:3', 'Q2:3', 240, 'black', 2);
    b.wire('Q1:5', 'Q2:5', 240, 'grey', 2);
    b.wire('Q2:1', 'Q3:1', 240, 'brown', 2);
    b.wire('Q2:3', 'Q4:1', 240, 'black', 2);
    b.wire('QG:N2', 'Q3:N1', 240, 'blue', 2);
    b.wire('Q3:N1', 'Q4:N1', 240, 'blue', 2);
    // utenze
    b.wire('Q1:2', 'M1:U1', 16);
    b.wire('Q1:4', 'M1:V1', 16, 'black');
    b.wire('Q1:6', 'M1:W1', 16, 'grey');
    b.wire('M1:PE', 'PE:PE5', 16);
    b.wire('Q2:2', 'M2:U1', 6);
    b.wire('Q2:4', 'M2:V1', 6, 'black');
    b.wire('Q2:6', 'M2:W1', 6, 'grey');
    b.wire('M2:PE', 'PE:PE6', 6);
    b.wire('Q3:2', 'XS1:L', 2.5);
    b.wire('Q3:N2', 'XS1:N', 2.5);
    b.wire('XS1:PE', 'PE:PE7', 2.5);
    b.wire('XS1:L', 'XS2:L', 2.5);
    b.wire('XS1:N', 'XS2:N', 2.5);
    b.wire('XS1:PE', 'XS2:PE', 2.5);
    b.wire('Q4:2', 'E1:L', 1.5, 'grey');
    b.wire('Q4:N2', 'E1:N', 1.5);
  });
}

/** Quadro MT di bordo di una grande nave: due gruppi da 2 MVA a 6,6 kV, sbarra MT, trasformatore di servizio, quadro BT in IT */
export function naveMT() {
  return build({ sys: '3F', source: 'none', title: 'Quadro MT di bordo a 6,6 kV', description: 'Centrale elettrica di una grande nave (ABB QT12, cap. 4-6): due gruppi diesel-generatore da 2 MVA a 6,6 kV 60 Hz con neutro a terra tramite resistenza, celle di generatore con relè 50/51 e 51N, sbarra MT in isola, cella del trasformatore di servizio e trasformatore 6,6 kV / 440 V da 630 kVA con neutro BT isolato (IT), quadro BT con generale scatolato, controllo dell’isolamento, elica di manovra da 75 kW, pompa antincendio, cucina e luci.' }, (b) => {
    b.add('G1', 'genset', 'A1', { Sn: 2000, net: 'mt66', bt: 'nave440', earth: 'NR', xd: 15, auto: true }, 'Gruppo principale 1: 2 MVA, 6,6 kV 60 Hz, neutro a terra tramite resistenza (guasto a terra limitato a 50 A).');
    b.add('QM1', 'mtcb', 'A3', { ruolo: 'gen', In: 200, Icu: 16, I1: 240, t1: 0.5, I2: 800, t2: 0.1, Io: 5, to: 0.3 }, 'Cella di generatore G1: In 175 A; 51 a 1,4 In, 50 sopra la corrente di cortocircuito dell’altro gruppo riportata… in isola i guasti sono “piccoli”: le soglie sono basse.');
    b.add('QM2', 'mtcb', 'A4', { ruolo: 'gen', In: 200, Icu: 16, I1: 240, t1: 0.5, I2: 800, t2: 0.1, Io: 5, to: 0.3 }, 'Cella di generatore G2.');
    b.add('G2', 'genset', 'C1', { Sn: 2000, net: 'mt66', bt: 'nave440', earth: 'NR', xd: 15, auto: true, standby: true }, 'Gruppo principale 2: parte da solo quando il primo supera l’85 %.');
    b.add('QM3', 'mtcb', 'A5', { ruolo: 'tr', In: 100, Icu: 16, I1: 75, t1: 0.3, I2: 900, t2: 0.05, Io: 5, to: 0.3 }, 'Cella del trasformatore di servizio: In1 = 55 A; 51 a 1,35 In1 con 0,3 s; 50 sopra l’inserzione (≈ 550 A) e sopra il cortocircuito BT riportato al primario.');
    b.add('T1', 'mtx', 'C3', { Sn: 630, V1: 'mt66', V2: 'nave440', vcc: 6, gruppo: 'Dyn11', earthBT: 'IT' }, 'Trasformatore di servizio 630 kVA, 6,6 kV / 440 V, Dyn11: a bordo il neutro BT resta isolato (IT).');
    // quadro BT 440 V
    b.add('QG', 'mccb', 'R1:0', { In: 1000, Ir: 0.8, Isd: 6, tsd: 0.1, Ii: 0, Icu: 36 }, 'Generale BT 1000 A regolato a 800 A (In2 = 827 A); S ritardata 0,1 s.');
    b.add('KI1', 'imd', 'R1:7', { soglia: 50 }, 'Controllo dell’isolamento della rete BT (IT).');
    b.add('Q1', 'mcb3p', 'R2:0', { In: 63, curve: 'D', pdi: 15 }, 'Pompa antincendio 30 kW: In 49 A.');
    b.add('Q2', 'mcb4p', 'R2:3', { In: 80, curve: 'D', pdi: 15 }, 'Elica di manovra 45 kW: In 73 A, spunto ≈ 440 A sotto la soglia D (1200 A).');
    b.add('Q3', 'mcb1pn', 'R2:7', { In: 16, curve: 'C', pdi: 15 }, 'Cucina.');
    b.add('Q4', 'mcb1pn', 'R2:9', { In: 10, curve: 'C', pdi: 15 }, 'Luci.');
    b.add('M1', 'm3', 'B1', { P: 30, conn: 'Y', load: 80 }, 'Pompa antincendio.');
    b.add('M2', 'm3', 'B3', { P: 45, conn: 'Y', load: 70 }, 'Elica trasversale di manovra (bow thruster).');
    b.add('E1', 'lamp', 'B5', { lt: 'led15' }, 'Luci.');
    b.add('XS1', 'xs', 'C5', { carico: 'oven', tipo: 'sch' }, 'Cucina.');
    // generatori → celle → sbarra MT (cavi 95 mm² isolati a 6,6 kV)
    for (const [G, Q] of [['G1', 'QM1'], ['G2', 'QM2']]) {
      b.wire(`${G}:L1`, `${Q}:1`, 95);
      b.wire(`${G}:L2`, `${Q}:3`, 95, 'black');
      b.wire(`${G}:L3`, `${Q}:5`, 95, 'grey');
    }
    b.wire('G1:PE', 'PE:PE1', 50);
    b.wire('G2:PE', 'PE:PE2', 50);
    b.wire('QM1:PE', 'PE:PE3', 50);
    b.wire('QM2:PE', 'QM1:PE', 50);
    b.wire('QM3:PE', 'QM2:PE', 50);
    b.wire('T1:PE', 'PE:PE4', 50);
    // sbarra MT: uscite delle celle di generatore unite, poi cella del trasformatore
    b.wire('QM1:2', 'QM2:2', 95);
    b.wire('QM1:4', 'QM2:4', 95, 'black');
    b.wire('QM1:6', 'QM2:6', 95, 'grey');
    b.wire('QM2:2', 'QM3:1', 95);
    b.wire('QM2:4', 'QM3:3', 95, 'black');
    b.wire('QM2:6', 'QM3:5', 95, 'grey');
    b.wire('QM3:2', 'T1:1', 50);
    b.wire('QM3:4', 'T1:3', 50, 'black');
    b.wire('QM3:6', 'T1:5', 50, 'grey');
    // secondario → generale BT (3 × 240 mm², In2 = 827 A) e sbarra BT
    b.wire('T1:2', 'QG:1', 240, 'brown', 3);
    b.wire('T1:4', 'QG:3', 240, 'black', 3);
    b.wire('T1:6', 'QG:5', 240, 'grey', 3);
    b.wire('T1:N', 'QG:N1', 240, 'blue', 3);
    b.wire('QG:2', 'Q1:1', 240, 'brown', 3);
    b.wire('QG:4', 'Q1:3', 240, 'black', 3);
    b.wire('QG:6', 'Q1:5', 240, 'grey', 3);
    b.wire('Q1:1', 'Q2:1', 240, 'brown', 3);
    b.wire('Q1:3', 'Q2:3', 240, 'black', 3);
    b.wire('Q1:5', 'Q2:5', 240, 'grey', 3);
    b.wire('Q2:1', 'Q3:1', 240, 'brown', 3);
    b.wire('Q2:3', 'Q4:1', 240, 'black', 3);
    b.wire('QG:N2', 'Q3:N1', 240, 'blue', 3);
    b.wire('Q3:N1', 'Q4:N1', 240, 'blue', 3);
    // utenze
    b.wire('Q1:2', 'M1:U1', 16);
    b.wire('Q1:4', 'M1:V1', 16, 'black');
    b.wire('Q1:6', 'M1:W1', 16, 'grey');
    b.wire('M1:PE', 'PE:PE5', 16);
    b.wire('Q2:2', 'M2:U1', 25);
    b.wire('Q2:4', 'M2:V1', 25, 'black');
    b.wire('Q2:6', 'M2:W1', 25, 'grey');
    b.wire('M2:PE', 'PE:PE6', 16);
    b.wire('Q3:2', 'XS1:L', 2.5);
    b.wire('Q3:N2', 'XS1:N', 2.5);
    b.wire('XS1:PE', 'PE:PE7', 2.5);
    b.wire('Q4:2', 'E1:L', 1.5, 'grey');
    b.wire('Q4:N2', 'E1:N', 1.5);
    b.wire('Q4:2', 'KI1:L', 1.5);
    b.wire('Q4:N2', 'KI1:N', 1.5);
    b.wire('KI1:PE', 'PE:PE8', 1.5);
  });
}

/** Impianto di bordo di uno yacht: due gruppi in parallelo, sistema IT, banchina, emergenza con ATS e UPS */
export function nave() {
  return build({ sys: '3F', source: 'none', title: 'Centrale elettrica di bordo', description: 'Yacht con due gruppi diesel-generatore da 50 kVA a 440 V 60 Hz, neutro isolato (IT) con controllo dell’isolamento, presa di banchina per il porto, gruppo di emergenza da 20 kVA con commutatore automatico (ATS) e UPS per le utenze essenziali (elica di manovra, luci di navigazione), distacco automatico dei carichi non essenziali (cucina, aria condizionata).' }, (b) => {
    // generazione
    b.add('G1', 'genset', 'A1', { Sn: 50, net: 'nave440', earth: 'IT', auto: true }, 'Gruppo principale: 50 kVA, 440 V 60 Hz, neutro isolato.');
    b.add('G2', 'genset', 'A3', { Sn: 50, net: 'nave440', earth: 'IT', auto: true, standby: true }, 'Gruppo di riserva: parte da solo quando il primo supera l’85 %.');
    b.add('XB1', 'shore', 'A5', { net: 'nave440', Pmax: 50, seq: 'diretta', ctrl: true, trasf: 'blackout' }, 'Presa di banchina: in porto si spengono i diesel.');
    b.add('G3', 'genset', 'C3', { Sn: 30, net: 'nave440', earth: 'IT', auto: true, emergenza: true }, 'Gruppo di emergenza sul ponte alto: parte da solo al black-out e alimenta timoneria e luci.');
    // quadro principale (guida 1)
    b.add('Q1', 'mcb4p', 'R1:0', { In: 80, curve: 'C', pdi: 6 }, 'Arrivo G1: In 80 A per i 66 A nominali del gruppo, cavi da 25 mm².');
    b.add('Q2', 'mcb4p', 'R1:4', { In: 80, curve: 'C', pdi: 6 }, 'Arrivo G2.');
    b.add('KI1', 'imd', 'R1:8', { soglia: 50 }, 'Obbligatorio con il neutro isolato: segnala il primo guasto a terra.');
    b.add('KL1', 'kls', 'R1:11', { soglia: 90, ritardo: 1 }, 'Stacca cucina e aria condizionata quando la centrale supera il 90 %.');
    // partenze (guida 2)
    b.add('Q3', 'mcb3p', 'R2:0', { In: 32, curve: 'C', pdi: 6 }, 'Elica di manovra 7,5 kW (non essenziale): In 13 A, spunto ≈ 80 A sotto la soglia magnetica (240 A).');
    b.add('Q4', 'mcb1pn', 'R2:3', { In: 10, curve: 'C', pdi: 6 }, 'Luci di navigazione (essenziali) a valle dell’UPS.');
    b.add('Q5', 'mcb1pn', 'R2:5', { In: 16, curve: 'C', pdi: 6 }, 'Cucina: non essenziale, a valle del distacco carichi.');
    b.add('Q6', 'mcb1pn', 'R2:7', { In: 16, curve: 'C', pdi: 6 }, 'Aria condizionata: non essenziale, a valle del distacco carichi.');
    b.add('Q9', 'mcb1pn', 'R2:9', { In: 10, curve: 'C', pdi: 6 }, 'Protezione dell’UPS.');
    b.add('Q10', 'mcb3p', 'R2:11', { In: 16, curve: 'C', pdi: 6 }, 'Timoneria (essenziale) a valle del commutatore ATS.');
    // quadro di emergenza (guida 3)
    b.add('KC1', 'ats', 'R3:0', { ritardo: 1, ritorno: 10 }, 'Commutatore automatico: normale dal quadro principale, emergenza dal gruppo G3.');
    b.add('U1', 'ups', 'R3:8', { Sn: 1, aut: 10 }, 'Copre i secondi di avviamento del gruppo di emergenza (luci e strumenti).');
    b.add('Q7', 'mcb4p', 'R3:14', { In: 40, curve: 'C', pdi: 6 }, 'Arrivo del gruppo di emergenza (In 39 A).');
    b.add('Q8', 'mcb4p', 'R3:18', { In: 80, curve: 'C', pdi: 6 }, 'Interruttore di banchina.');
    // utenze
    b.add('M1', 'm3', 'B1', { P: 7.5, conn: 'Y', load: 80 }, 'Elica trasversale di manovra (bow thruster): serve solo in porto, non è essenziale.');
    b.add('M2', 'm3', 'B3', { P: 4, conn: 'Y', load: 70, essenziale: true }, 'Motore della timoneria: essenziale, alimentato dal quadro di emergenza.');
    b.add('E1', 'lamp', 'B5', { lt: 'led15', essenziale: true }, 'Luci di navigazione (essenziali).');
    b.add('E2', 'lamp', 'C5', { lt: 'led10', essenziale: true });
    b.add('XS1', 'xs', 'C1', { carico: 'oven', tipo: 'sch' }, 'Cucina: utenza non essenziale.');
    b.add('XS2', 'xs', 'C2', { carico: 'aircon', tipo: 'sch' }, 'Aria condizionata: non essenziale.');
    // arrivi dei generatori e della banchina (25 mm², protetti dai propri interruttori da 80 A)
    for (const [G, Q] of [['G1', 'Q1'], ['G2', 'Q2'], ['XB1', 'Q8']]) {
      b.wire(`${G}:L1`, `${Q}:1`, 25);
      b.wire(`${G}:L2`, `${Q}:3`, 25);
      b.wire(`${G}:L3`, `${Q}:5`, 25);
      b.wire(`${G}:N`, `${Q}:N1`, 25);
    }
    for (const [G, Q] of [['G3', 'Q7']]) {
      b.wire(`${G}:L1`, `${Q}:1`, 10);
      b.wire(`${G}:L2`, `${Q}:3`, 10);
      b.wire(`${G}:L3`, `${Q}:5`, 10);
      b.wire(`${G}:N`, `${Q}:N1`, 10);
    }
    b.wire('G1:PE', 'PE:PE1', 16);
    b.wire('G2:PE', 'PE:PE2', 16);
    b.wire('G3:PE', 'PE:PE7', 10);
    b.wire('XB1:PE', 'PE:PE8', 16);
    // sbarra principale: arrivi in parallelo, poi a catena verso il commutatore ATS (ingresso normale) e il distacco carichi
    b.wire('Q1:2', 'Q2:2', 25);
    b.wire('Q1:4', 'Q2:4', 25);
    b.wire('Q1:6', 'Q2:6', 25);
    b.wire('Q1:N2', 'Q2:N2', 25);
    b.wire('Q2:2', 'Q8:2', 25);
    b.wire('Q2:4', 'Q8:4', 25);
    b.wire('Q2:6', 'Q8:6', 25);
    b.wire('Q2:N2', 'Q8:N2', 25);
    b.wire('Q8:2', 'KC1:1', 25);
    b.wire('Q8:4', 'KC1:3', 25);
    b.wire('Q8:6', 'KC1:5', 25);
    b.wire('Q8:N2', 'KC1:N1', 25);
    b.wire('KC1:1', 'Q3:1', 25);
    b.wire('KC1:3', 'Q3:3', 25);
    b.wire('KC1:5', 'Q3:5', 25);
    b.wire('Q3:3', 'KL1:11', 25);
    b.wire('KL1:12', 'Q5:1', 25);
    b.wire('Q5:1', 'Q6:1', 25);
    b.wire('KC1:N1', 'Q5:N1', 25);
    b.wire('Q5:N1', 'Q6:N1', 25);
    // sbarra di emergenza: gruppo G3 → Q7 → ingresso di emergenza dell'ATS
    b.wire('Q7:2', 'KC1:7', 10);
    b.wire('Q7:4', 'KC1:9', 10);
    b.wire('Q7:6', 'KC1:11', 10);
    b.wire('Q7:N2', 'KC1:N3', 10);
    // uscita dell'ATS (quadro di emergenza): timoneria e, tramite Q9 e l'UPS, le luci essenziali
    b.wire('KC1:2', 'Q10:1', 25);
    b.wire('KC1:4', 'Q10:3', 25);
    b.wire('KC1:6', 'Q10:5', 25);
    b.wire('Q10:2', 'M2:U1', 2.5);
    b.wire('Q10:4', 'M2:V1', 2.5);
    b.wire('Q10:6', 'M2:W1', 2.5);
    b.wire('M1:PE', 'M2:PE', 6);
    b.wire('KC1:2', 'Q9:1', 25);
    b.wire('KC1:N2', 'Q9:N1', 25);
    b.wire('Q9:2', 'U1:1', 2.5);
    b.wire('Q9:N2', 'U1:N1', 2.5);
    b.wire('U1:2', 'Q4:1', 2.5);
    b.wire('U1:N2', 'Q4:N1', 2.5);
    // ausiliari alimentati dalla linea luci (sotto UPS): controllo isolamento e relè di distacco
    b.wire('Q4:2', 'KI1:L', 1.5);
    b.wire('Q4:N2', 'KI1:N', 1.5);
    b.wire('KI1:L', 'KL1:L', 1.5);
    b.wire('KI1:N', 'KL1:N', 1.5);
    b.wire('KI1:PE', 'PE:PE3', 1.5);
    // utenze
    b.wire('Q3:2', 'M1:U1', 6);
    b.wire('Q3:4', 'M1:V1', 6);
    b.wire('Q3:6', 'M1:W1', 6);
    b.wire('M1:PE', 'PE:PE4', 6);
    b.wire('Q4:2', 'E1:L', 1.5, 'grey');
    b.wire('E1:L', 'E2:L', 1.5, 'grey');
    b.wire('Q4:N2', 'E1:N', 1.5);
    b.wire('E1:N', 'E2:N', 1.5);
    b.wire('Q5:2', 'XS1:L', 2.5);
    b.wire('Q5:N2', 'XS1:N', 2.5);
    b.wire('XS1:PE', 'PE:PE5', 2.5);
    b.wire('Q6:2', 'XS2:L', 2.5);
    b.wire('Q6:N2', 'XS2:N', 2.5);
    b.wire('XS2:PE', 'PE:PE6', 2.5);
  });
}

export function appartamento() {
  return build({ sys: '1F', title: 'Quadro di un appartamento', supply: { Pc: 3, Icc: 4.5, Re: 20 }, description: 'Impianto monofase di un piccolo appartamento (modello di riferimento).' }, (b) => {
    b.add('Q1', 'rcbo1pn', 'R1:4', { In: 25, curve: 'C', pdi: 6, IDn: 0.03 }, 'Interruttore generale: protegge la linea montante e tutte le persone (30 mA).');
    b.add('P1', 'pm1', 'R1:7');
    b.add('Q2', 'mcb1pn', 'R2:0', { In: 10, curve: 'C', pdi: 6 }, 'Linea luci: cavi da 1,5 mm², quindi In = 10 A.');
    b.add('Q3', 'mcb1pn', 'R2:2', { In: 16, curve: 'C', pdi: 6 }, 'Linea prese: cavi da 2,5 mm², In = 16 A.');
    b.add('SA1', 'sa', 'A1');
    b.add('E1', 'lamp', 'A2', { lt: 'led10', dist: 12 });
    b.add('SA2', 'sd', 'B1');
    b.add('SA3', 'sd', 'B2');
    b.add('E2', 'lamp', 'B3', { lt: 'led15', dist: 14 });
    b.add('XS1', 'xs', 'A4', { carico: 'tv', dist: 15 });
    b.add('XS2', 'xs', 'A5', { carico: 'heater', dist: 18 });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6);
    b.wire('Q1:2', 'P1:Lin', 6);
    b.wire('Q1:N2', 'P1:Nin', 6);
    b.wire('P1:Lout', 'Q2:1', 4);
    b.wire('P1:Lout', 'Q3:1', 4);
    b.wire('P1:Nout', 'Q2:N1', 4);
    b.wire('P1:Nout', 'Q3:N1', 4);
    // luci
    b.wire('Q2:2', 'SA1:L', 1.5);
    b.wire('SA1:1', 'E1:L', 1.5, 'grey');
    b.wire('Q2:N2', 'E1:N', 1.5);
    b.wire('Q2:2', 'SA2:C', 1.5);
    b.wire('SA2:1', 'SA3:1', 1.5, 'black');
    b.wire('SA2:2', 'SA3:2', 1.5, 'black');
    b.wire('SA3:C', 'E2:L', 1.5, 'grey');
    b.wire('Q2:N2', 'E2:N', 1.5);
    // prese (entra-esci)
    b.wire('Q3:2', 'XS1:L', 2.5);
    b.wire('Q3:N2', 'XS1:N', 2.5);
    b.wire('PE:PE1', 'XS1:PE', 2.5);
    b.wire('XS1:L', 'XS2:L', 2.5);
    b.wire('XS1:N', 'XS2:N', 2.5);
    b.wire('XS1:PE', 'XS2:PE', 2.5);
  });
}

export function motore() {
  return build({ sys: '3F', earth: 'TN-S', title: 'Teleavviamento di un motore asincrono trifase', supply: { Pc: 10, Icc: 6, Re: 10 }, description: 'Comando a distanza di un motore con autoritenuta, protezione termica e segnalazioni.' }, (b) => {
    b.add('QG', 'mcb4p', 'R1:5', { In: 16, curve: 'C', pdi: 6 }, 'Interruttore generale del quadro.');
    b.add('QM', 'mcb3p', 'R2:0', { In: 6, curve: 'D', pdi: 6 }, 'Protezione della linea motore dal cortocircuito: curva D per la corrente di spunto.');
    b.add('KM1', 'km3', 'R2:4', { Uc: 230, Ie: 9 });
    b.add('FR1', 'fr3', 'R2:8', { Ir: 2 }, 'Regolato sulla corrente di targa del motore (1,83 A).');
    b.add('Q2', 'mcb1pn', 'R2:13', { In: 6, curve: 'C', pdi: 6 }, 'Protezione del circuito di comando a 230 V.');
    b.add('H1', 'hl', 'R3:0', { color: 'green' });
    b.add('H2', 'hl', 'R3:1', { color: 'amber' });
    b.add('SB1', 'ss', 'A1');
    b.add('M1', 'm3', 'C3', { P: 0.75, conn: 'Y', load: 80 });
    // potenza
    b.wire('XA:L1', 'QG:1', 6);
    b.wire('XA:L2', 'QG:3', 6, 'black');
    b.wire('XA:L3', 'QG:5', 6, 'grey');
    b.wire('XA:N', 'QG:N1', 6);
    b.wire('QG:2', 'QM:1', 2.5);
    b.wire('QG:4', 'QM:3', 2.5, 'black');
    b.wire('QG:6', 'QM:5', 2.5, 'grey');
    b.wire('QM:2', 'KM1:1', 1.5);
    b.wire('QM:4', 'KM1:3', 1.5, 'black');
    b.wire('QM:6', 'KM1:5', 1.5, 'grey');
    b.wire('KM1:2', 'FR1:1', 1.5);
    b.wire('KM1:4', 'FR1:3', 1.5, 'black');
    b.wire('KM1:6', 'FR1:5', 1.5, 'grey');
    b.wire('FR1:2', 'M1:U1', 1.5);
    b.wire('FR1:4', 'M1:V1', 1.5, 'black');
    b.wire('FR1:6', 'M1:W1', 1.5, 'grey');
    b.wire('PE:PE1', 'M1:PE', 1.5);
    // comando
    b.wire('QG:2', 'Q2:1', 2.5);
    b.wire('QG:N2', 'Q2:N1', 2.5);
    b.wire('Q2:2', 'FR1:95', 1, 'red');
    b.wire('FR1:96', 'SB1:1', 1, 'red');
    b.wire('SB1:2', 'SB1:3', 1, 'red');
    b.wire('SB1:4', 'KM1:A1', 1, 'red');
    b.wire('SB1:3', 'KM1:13', 1, 'red');
    b.wire('KM1:14', 'KM1:A1', 1, 'red');
    b.wire('KM1:A2', 'Q2:N2', 1);
    // segnalazioni
    b.wire('KM1:14', 'H1:X1', 1, 'red');
    b.wire('H1:X2', 'Q2:N2', 1, 'blue');
    b.wire('Q2:2', 'FR1:97', 1, 'red');
    b.wire('FR1:98', 'H2:X1', 1, 'red');
    b.wire('H2:X2', 'H1:X2', 1, 'blue');
  });
}

export function domotica() {
  return build({ sys: '1F', title: 'Comandi automatici per l’abitazione', supply: { Pc: 4.5, Icc: 4.5, Re: 20 }, description: 'Comando luci con relè passo-passo, temporizzatore luce scale, crepuscolare e rilevatore di presenza.' }, (b) => {
    b.add('Q1', 'rcbo1pn', 'R1:4', { In: 16, curve: 'C', pdi: 6, IDn: 0.03 });
    b.add('Q2', 'mcb1pn', 'R2:0', { In: 10, curve: 'C', pdi: 6 });
    b.add('KA1', 'kpp', 'R2:3');
    b.add('KT1', 'kt', 'R2:4.5', { T: 20 });
    b.add('KF1', 'kcr', 'R2:6', { lux: 20 });
    b.add('SB1', 'sp', 'A1');
    b.add('SB2', 'sp', 'A2');
    b.add('SB3', 'sp', 'A3');
    b.add('E1', 'lamp', 'A4', { lt: 'led15' });
    b.add('SB4', 'sp', 'B1');
    b.add('E2', 'lamp', 'B2', { lt: 'led10' });
    b.add('E3', 'lamp', 'B4', { lt: 'inc60' }, 'Luce esterna comandata dal crepuscolare.');
    b.add('BG1', 'pir', 'C1');
    b.add('E4', 'lamp', 'C2', { lt: 'led10' });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6);
    b.wire('Q1:2', 'Q2:1', 4);
    b.wire('Q1:N2', 'Q2:N1', 4);
    // relè passo-passo comandato da tre pulsanti in parallelo
    b.wire('Q2:2', 'SB1:3');
    b.wire('SB1:3', 'SB2:3');
    b.wire('SB2:3', 'SB3:3');
    b.wire('SB1:4', 'KA1:A1');
    b.wire('SB1:4', 'SB2:4');
    b.wire('SB2:4', 'SB3:4');
    b.wire('KA1:A2', 'Q2:N2');
    b.wire('Q2:2', 'KA1:11');
    b.wire('KA1:14', 'E1:L', 1.5, 'grey');
    b.wire('E1:N', 'KA1:A2');
    // luce scale
    b.wire('KA1:11', 'KT1:15');
    b.wire('KT1:15', 'SB4:3');
    b.wire('SB4:4', 'KT1:A1');
    b.wire('KT1:A2', 'Q2:N2');
    b.wire('KT1:18', 'E2:L', 1.5, 'grey');
    b.wire('E2:N', 'KT1:A2');
    // crepuscolare
    b.wire('Q1:2', 'KF1:L', 1.5);
    b.wire('Q1:N2', 'KF1:N', 1.5);
    b.wire('KF1:L', 'KF1:15', 1.5);
    b.wire('KF1:18', 'E3:L', 1.5, 'grey');
    b.wire('E3:N', 'KF1:N');
    // rilevatore di presenza
    b.wire('BG1:L', 'SB3:3', 1.5);
    b.wire('BG1:N', 'E2:N');
    b.wire('BG1:OUT', 'E4:L', 1.5, 'grey');
    b.wire('E4:N', 'BG1:N');
  });
}

/** Quadro di bordo da configurare: un gruppo da 50 kVA e il collettore di terra, tutto il resto lo monta lo studente */
export function naveVuota() {
  return build({ sys: '3F', source: 'none', title: 'Quadro di bordo da configurare', description: 'Un gruppo diesel-generatore da 50 kVA a 440 V 60 Hz con neutro isolato: montare l’arrivo, il controllo dell’isolamento, le partenze e le utenze.' }, (b) => {
    b.add('G1', 'genset', 'A1', { Sn: 50, net: 'nave440', earth: 'IT', auto: true }, 'Gruppo principale: 50 kVA, 440 V 60 Hz, neutro isolato.');
  });
}

/** Traghetto: quadro principale a due semisbarre con congiuntore, due gruppi da 100 kVA, pompe e servizi */
export function traghetto() {
  return build({ sys: '3F', source: 'none', title: 'Traghetto: quadro a due semisbarre', description: 'Quadro principale di un piccolo traghetto: due gruppi da 100 kVA a 440 V 60 Hz, ciascuno sulla propria semisbarra, unite da un congiuntore. A sinistra pompa di sentina, ventilazione del garage e luci; a destra pompa antincendio, cucina, aria condizionata e luci. Con il congiuntore aperto le due metà sono indipendenti; chiudendolo i gruppi lavorano in parallelo e un gruppo può alimentare tutta la nave.' }, (b) => {
    b.add('G1', 'genset', 'A1', { Sn: 100, net: 'nave440', earth: 'IT', auto: true }, 'Gruppo della semisbarra sinistra.');
    b.add('G2', 'genset', 'A3', { Sn: 100, net: 'nave440', earth: 'IT', auto: true }, 'Gruppo della semisbarra destra.');
    b.add('Q1', 'mcb4p', 'R1:0', { In: 125, curve: 'C', pdi: 10 }, 'Arrivo G1 (corrente nominale del gruppo 131 A): cavi da 70 mm².');
    b.add('Q2', 'mcb4p', 'R1:4', { In: 125, curve: 'C', pdi: 10 }, 'Arrivo G2.');
    b.add('QC', 'isol4p', 'R1:8', { In: 160 }, 'Congiuntore di sbarra: chiuso, le due semisbarre lavorano in parallelo; aperto, ogni gruppo alimenta la sua metà. Aprilo e prova l’avaria di un gruppo.');
    b.add('KI1', 'imd', 'R1:12', { soglia: 50 }, 'Controllo dell’isolamento (sistema IT).');
    b.add('Q3', 'mcb3p', 'R2:0', { In: 40, curve: 'D', pdi: 10 }, 'Pompa di sentina 15 kW (semisbarra sinistra).');
    b.add('Q4', 'mcb3p', 'R2:3', { In: 32, curve: 'D', pdi: 10 }, 'Ventilazione del garage 11 kW.');
    b.add('Q5', 'mcb1pn', 'R2:6', { In: 10, curve: 'C', pdi: 10 }, 'Luci di sinistra.');
    b.add('Q6', 'mcb3p', 'R3:0', { In: 40, curve: 'D', pdi: 10 }, 'Pompa antincendio 15 kW (semisbarra destra).');
    b.add('Q7', 'mcb1pn', 'R3:3', { In: 16, curve: 'C', pdi: 10 }, 'Cucina.');
    b.add('Q8', 'mcb1pn', 'R3:5', { In: 16, curve: 'C', pdi: 10 }, 'Aria condizionata.');
    b.add('Q9', 'mcb1pn', 'R3:7', { In: 10, curve: 'C', pdi: 10 }, 'Luci di destra.');
    b.add('M1', 'm3', 'B1', { P: 15, conn: 'Y', load: 80 }, 'Pompa di sentina.');
    b.add('M2', 'm3', 'B3', { P: 15, conn: 'Y', load: 80 }, 'Pompa antincendio.');
    b.add('E1', 'lamp', 'B5', { lt: 'led15' }, 'Luci di sinistra.');
    b.add('M3', 'm3', 'C1', { P: 11, conn: 'Y', load: 70 }, 'Ventilazione del garage.');
    b.add('XS1', 'xs', 'C3', { carico: 'oven', tipo: 'sch' }, 'Cucina.');
    b.add('XS2', 'xs', 'C4', { carico: 'aircon', tipo: 'sch' }, 'Aria condizionata.');
    b.add('E2', 'lamp', 'C5', { lt: 'led15' }, 'Luci di destra.');
    for (const [G, Q] of [['G1', 'Q1'], ['G2', 'Q2']]) {
      b.wire(`${G}:L1`, `${Q}:1`, 70);
      b.wire(`${G}:L2`, `${Q}:3`, 70);
      b.wire(`${G}:L3`, `${Q}:5`, 70);
      b.wire(`${G}:N`, `${Q}:N1`, 70);
    }
    b.wire('G1:PE', 'PE:PE1', 35);
    b.wire('G2:PE', 'PE:PE2', 35);
    // semisbarra sinistra (Q1) → congiuntore e partenze
    b.wire('Q1:2', 'QC:1', 50);
    b.wire('Q1:4', 'QC:3', 50);
    b.wire('Q1:6', 'QC:5', 50);
    b.wire('Q1:N2', 'QC:N1', 50);
    b.wire('Q1:2', 'Q3:1', 50);
    b.wire('Q1:4', 'Q3:3', 50);
    b.wire('Q1:6', 'Q3:5', 50);
    b.wire('Q3:1', 'Q4:1', 50);
    b.wire('Q3:3', 'Q4:3', 50);
    b.wire('Q3:5', 'Q4:5', 50);
    b.wire('Q4:1', 'Q5:1', 50);
    b.wire('Q1:N2', 'Q5:N1', 50);
    // semisbarra destra (Q2) → congiuntore e partenze
    b.wire('Q2:2', 'QC:2', 50);
    b.wire('Q2:4', 'QC:4', 50);
    b.wire('Q2:6', 'QC:6', 50);
    b.wire('Q2:N2', 'QC:N2', 50);
    b.wire('Q2:2', 'Q6:1', 50);
    b.wire('Q2:4', 'Q6:3', 50);
    b.wire('Q2:6', 'Q6:5', 50);
    b.wire('Q6:1', 'Q7:1', 50);
    b.wire('Q7:1', 'Q8:1', 50);
    b.wire('Q8:1', 'Q9:1', 50);
    b.wire('Q2:N2', 'Q7:N1', 50);
    b.wire('Q7:N1', 'Q8:N1', 50);
    b.wire('Q8:N1', 'Q9:N1', 50);
    // utenze
    b.wire('Q3:2', 'M1:U1', 10);
    b.wire('Q3:4', 'M1:V1', 10);
    b.wire('Q3:6', 'M1:W1', 10);
    b.wire('M1:PE', 'PE:PE4', 10);
    b.wire('Q4:2', 'M3:U1', 6);
    b.wire('Q4:4', 'M3:V1', 6);
    b.wire('Q4:6', 'M3:W1', 6);
    b.wire('M3:PE', 'PE:PE6', 6);
    b.wire('Q5:2', 'E1:L', 1.5, 'grey');
    b.wire('Q5:N2', 'E1:N', 1.5);
    b.wire('Q5:2', 'KI1:L', 1.5);
    b.wire('Q5:N2', 'KI1:N', 1.5);
    b.wire('KI1:PE', 'PE:PE3', 1.5);
    b.wire('Q6:2', 'M2:U1', 10);
    b.wire('Q6:4', 'M2:V1', 10);
    b.wire('Q6:6', 'M2:W1', 10);
    b.wire('M2:PE', 'PE:PE5', 10);
    b.wire('Q7:2', 'XS1:L', 2.5);
    b.wire('Q7:N2', 'XS1:N', 2.5);
    b.wire('XS1:PE', 'PE:PE7', 2.5);
    b.wire('Q8:2', 'XS2:L', 2.5);
    b.wire('Q8:N2', 'XS2:N', 2.5);
    b.wire('XS2:PE', 'PE:PE8', 2.5);
    b.wire('Q9:2', 'E2:L', 1.5, 'grey');
    b.wire('Q9:N2', 'E2:N', 1.5);
  });
}
