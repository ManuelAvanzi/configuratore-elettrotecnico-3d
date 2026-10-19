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
    id: 'nave',
    title: 'Centrale elettrica di bordo',
    text: 'Due gruppi da 50 kVA a 440 V 60 Hz con neutro isolato (IT), presa di banchina, gruppo di emergenza con commutatore automatico e UPS, distacco dei carichi non essenziali, elica di manovra e luci di navigazione.',
    icon: 'waves',
    make: nave,
  },
];

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
