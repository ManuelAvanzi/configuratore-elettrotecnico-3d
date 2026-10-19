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
];

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
