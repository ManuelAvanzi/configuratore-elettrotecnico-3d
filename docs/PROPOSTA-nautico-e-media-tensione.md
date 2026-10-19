# Proposta: impianti di bordo (nautico) e media tensione nel configuratore

Bozza del 19/10/2026 per i colleghi CarraroLab. Fonte di partenza indicata dai colleghi: ABB, *Quaderni di
applicazione tecnica n. 12 — Generalità sui sistemi navali e sulle installazioni di bordo*
(<https://library.e.abb.com/public/9b381983ffa4c133c12578780049cf9a/QT12_ITA.pdf>). Di seguito: che cosa dice il
quaderno, come si traduce in due moduli del configuratore, che cosa c'è già nel software e che cosa va costruito,
un piano per fasi e le domande aperte.

---

## 1. Che cosa dice il quaderno ABB (in breve)

Il QT12 descrive l'impianto elettrico di una nave, con l'occhio di chi deve scegliere gli interruttori di bassa
tensione. I punti che contano per noi:

1. **A bordo l'energia si produce.** Non c'è il distributore: una *centrale elettrica di bordo* con più gruppi
   diesel-alternatore (genset, da 1 a 10 MW ciascuno sulle grandi navi) alimenta tutto. I generatori lavorano al
   meglio al 75 % del nominale, si mettono in parallelo con un dispositivo di sincronizzazione (stessa tensione,
   frequenza e fase) e un ripartitore di carico distribuisce la potenza; l'automazione avvia e ferma i gruppi in
   base al carico. La potenza installata tiene conto di ampliamenti futuri e dell'avaria di un gruppo (cap. 4).
2. **Rete in isola, senza "sbarra a potenza infinita".** La potenza dei generatori è paragonabile a quella dei
   carichi e un grosso motore è paragonabile a un singolo generatore: avviare un motore con pochi gruppi in
   servizio provoca cadute di tensione sensibili. Le correnti di cortocircuito sono alte, con fattori di picco
   superiori a quelli standard, perché generatori grandi e cavi corti stanno in uno spazio confinato (cap. 6, 7.1.2).
3. **Livelli di tensione.** Navi grandi: generazione e distribuzione primaria in media tensione, 6,6 kV (10–20 MW)
   o 11 kV (oltre 20 MW, motori oltre 400 kW). Yacht e navi piccole (fino a circa 12 MW): tutto in bassa tensione a
   **440 V** o **690 V**; la distribuzione finale a 400/230 V tramite trasformatori BT/BT; frequenza 50 o 60 Hz
   secondo il cantiere; corrente continua 24/48/110/125 V per batterie e ausiliari (cap. 4, 6).
4. **Schema del quadro principale.** Due semisbarre, ciascuna con il proprio gruppo di generatori, unite da un
   **congiuntore**; distribuzione radiale con sottoquadri, **doppia alimentazione** dei quadri importanti tramite
   commutatore o interruttori interbloccati, eventuale **anello di riserva**. Obiettivo: continuità di servizio e
   **selettività** spinta, così che un guasto metta fuori servizio solo la sua utenza (cap. 6).
5. **Neutro isolato (sistema IT).** La distribuzione a bordo è normalmente trifase con neutro non collegato alla
   massa (o a terra tramite resistenza): un primo guasto a terra non è pericoloso e non fa intervenire le
   protezioni, ma deve essere **segnalato da un dispositivo di controllo dell'isolamento** (allarme visivo e
   acustico) e rimosso subito, perché un secondo guasto a terra sarebbe un cortocircuito. I conduttori connessi a
   terra non vanno mai interrotti; le protezioni stanno su ogni conduttore attivo (cap. 6, 7.2).
6. **Carichi essenziali e non essenziali.** Propulsione, timoneria, pompe antincendio, luci di emergenza, allarmi,
   comunicazioni e navigazione devono funzionare anche in emergenza: una **centrale di emergenza** separata, su un
   ponte alto sopra la linea di galleggiamento, con gruppo diesel autonomo (440/690 V) avviato dall'UPS e batterie
   che coprono il tempo di avviamento; una sequenza automatica commuta i carichi privilegiati sul quadro di
   emergenza (cap. 6).
7. **In porto: alimentazione da terra** (shore connection, oggi anche HVSC in media tensione con convertitore
   50/60 Hz): i diesel si spengono e la nave si collega alla banchina. Servono il controllo della sequenza delle
   fasi sull'interruttore della presa da terra e un trasferimento di carico senza perturbare la rete (cap. 6, 8).
8. **Scelta degli interruttori secondo i registri navali** (RINA, Lloyd's, DNV, ABS, BV, GL): corrente di
   cortocircuito calcolata con la IEC 61363 (valore a T/2 e picco); potere di interruzione **Icu o Ics ≥ Iac(T/2)**,
   potere di chiusura **Icm ≥ Ip**, fattore di picco adeguato; **non è ammessa la protezione di back-up**; per i
   generatori e per le linee senza alimentazione duplicata si usa la Ics; per la selettività conta la Icw.
   Condizioni ambientali: 45 °C in spazi chiusi, umidità 95 %, vibrazioni, tensione +6/−10 %, frequenza ±5 %,
   armoniche limitate (cap. 7.1).
9. **Protezione dei componenti.** Generatori: cortocircuito istantaneo sotto la corrente di regime, sovraccarico
   tra il 10 e il 50 % oltre In, intervento entro 2 minuti a 1,5 In; funzioni dedicate: inversione di potenza,
   minima/massima tensione e frequenza, cortocircuito direzionale per i congiuntori. Motori: termica adatta
   all'avviamento, magnetica che lascia passare lo spunto. Trasformatori: protezione al primario, selettiva verso
   il secondario, tenuta 2 s al guasto secondario. Timoneria: sola protezione da cortocircuito. Versioni estraibili
   per manutenzione in spazi angusti; sganciatori elettronici regolabili (L-S-I-G, selettività di zona) (cap. 7.2, 8).
10. **Propulsione elettrica** (grandi navi): genset in MT → quadro principale MT → convertitori di frequenza
    (synchroconverter) → motori sincroni di propulsione a 6,6 kV, eliche trasversali di manovra (bow thruster),
    Azipod. È contesto da spiegare, non da far cablare: la simulazione sta nella distribuzione (cap. 5).

---

## 2. Modulo A — "Impianti di bordo": la centrale elettrica e il quadro principale di una nave in bassa tensione

**Taglio didattico.** Lo yacht o la nave piccola del quaderno (qualche MW, tutto in BT a 440 V, 60 Hz): è il caso
in cui lo studente può cablare davvero il quadro, e dove si vedono tutte le differenze con l'impianto terrestre che
già conosce dal configuratore (generatori al posto del contatore, neutro isolato al posto del TT, continuità di
servizio al posto del semplice "protezione e comando").

### 2.1 Ambiente 3D

Un nuovo banco, "Sala quadri di bordo", selezionabile accanto all'aula attuale:

- **Quadro elettrico principale** con due semisbarre (sinistra/destra) e congiuntore al centro, arrivi dei
  generatori in alto, partenze verso i quadri secondari in basso;
- **Quadro di emergenza** separato (più piccolo, "sul ponte alto") con gruppo diesel di emergenza, UPS e batterie;
- **Presa da terra** (shore connection) con cavo avvolto e pannello di connessione;
- **Pannello utenze di bordo** con le utenze tipiche: pompa di sentina, pompa antincendio, timoneria (motore
  idraulico), luci di navigazione e di emergenza, verricello/argano, elica trasversale di manovra, cucina, aria
  condizionata, caricabatterie; ogni utenza è marcata **essenziale** o **non essenziale**;
- LIM della sala con il sinottico della centrale: generatori in servizio, carico per sbarra, frequenza.

### 2.2 Componenti nuovi (catalogo)

| Componente | Parametri | Comportamento simulato |
|---|---|---|
| **Gruppo diesel-generatore** (genset) | Sn (kVA), tensione (440/690), frequenza (50/60), stato fermo/avviato, regolatore | Sorgente trifase con impedenza interna; tensione e frequenza che calano con il sovraccarico; rendimento ottimo al 75 % |
| **Interruttore di generatore** con protezione dedicata | In, Ics, Icm, inversione di potenza, UV/OV, UF/OF | Apre su cortocircuito istantaneo, su 1,5 In entro 2 min, su potenza inversa |
| **Sincronizzatore / dispositivo di parallelo** | automatico o manuale (sincronoscopio) | Consente la chiusura solo se tensione, frequenza e fase coincidono; altrimenti blocca e segnala |
| **Congiuntore di sbarra** | In, Icw, ritardo | Unisce le due semisbarre; selettività direzionale |
| **Ripartitore di carico** | automatico/manuale, percentuali | Distribuisce la potenza tra i generatori in parallelo; avvio/arresto del secondo gruppo per soglia di carico |
| **Dispositivo di controllo dell'isolamento** (IT) | soglia kΩ | Misura la resistenza verso massa; allarme visivo e acustico al primo guasto |
| **Trasformatore BT/BT** 440/230 V | Sn, gruppo, protezione primaria | Già previsto dal motore (elemento XF) |
| **Presa da terra** (shore connection) | tensione/frequenza della banchina, sequenza fasi | Interruttore con controllo della sequenza ciclica; trasferimento con o senza interruzione |
| **Commutatore automatico di rete** (ATS) per i carichi essenziali | tempo di commutazione | Passa al quadro di emergenza in caso di mancanza tensione |
| **Gruppo di emergenza + UPS/batterie** | Sn, autonomia, tempo di avviamento | Alimenta i carichi privilegiati; le batterie coprono il tempo di avviamento |
| **Interruttore con sganciatore elettronico** (L-S-I-G) | soglie e ritardi | Selettività cronometrica e di zona tra i livelli del quadro |
| **Utenze di bordo** | potenza, essenziale sì/no, tipo di avviamento | Motori con spunto (pompe, thruster), luci, resistivi |

### 2.3 Simulazione: che cosa cambia nel motore

Il simulatore attuale (analisi nodale a fasori) già calcola tensioni, correnti, cortocircuiti, guasti a terra,
trasformatori e motori. Per il modulo servono quattro estensioni:

1. **Più sorgenti**: oggi c'è un solo "arrivo linea" (XA) a potenza infinita; servono generatori multipli con
   impedenza interna e un vincolo di parallelo (la chiusura è permessa solo con sincronismo verificato: non si
   simula la dinamica dell'alternatore, si simula la *regola*);
2. **Rete in isola**: tensione e frequenza di sbarra dipendono dal rapporto carico/potenza generata; lo spunto di
   un motore grande con un solo gruppo in servizio produce una caduta visibile; distacco dei carichi non
   essenziali (load shedding) per soglia;
3. **Sistema IT** accanto a TT e TN-S: neutro isolato o a resistenza, primo guasto a terra senza intervento ma con
   allarme, doppio guasto come cortocircuito; verifica "nessun interruttore sui conduttori a terra";
4. **Parametri di rete variabili**: tensione 440/690 V e frequenza 60 Hz al posto delle costanti 230/400 V 50 Hz
   (oggi fisse nel codice), tabelle delle portate anche per cavi navali.

### 2.4 Verifiche automatiche "da registro navale"

Si aggiunge una famiglia di verifiche *Nave* alle attuali (CEI 64-8): potenza generata sufficiente con un gruppo in
avaria (n−1); generatori attorno al 75 % in navigazione; Icu/Ics ≥ Iac(T/2) e Icm ≥ Ip con la corrente di
cortocircuito "da generatori" (IEC 61363, semplificata); nessuna protezione di back-up; Ics per gli interruttori di
generatore; carichi essenziali con doppia alimentazione o sul quadro di emergenza; controllo isolamento presente
sulle reti IT; nessun interruttore sui conduttori a terra; protezione del generatore regolata (1,5 In entro 2
min); derating a 45 °C; caduta di tensione allo spunto del motore più grande con il numero minimo di generatori.

### 2.5 Esercitazioni (nello schema delle cinque della scheda)

1. **Configurazione base di un impianto di bordo** — un generatore, il quadro principale, tre utenze (luci,
   pompa, cucina): si avvia il gruppo, si dà tensione alla sbarra, si leggono tensione e frequenza.
2. **Montaggio del quadro con collegamenti logici** — due generatori, sincronizzazione e parallelo, congiuntore,
   ripartizione del carico; prova: avaria di un generatore, il congiuntore e il secondo gruppo tengono la nave
   alimentata (black-out parziale e load shedding).
3. **Automazione di bordo** (al posto del "domotico civile") — black-out simulato: UPS, avviamento del gruppo di
   emergenza, commutazione automatica dei carichi essenziali entro 45 s; in porto: collegamento alla presa da
   terra con controllo della sequenza delle fasi e trasferimento del carico.
4. **Analisi dei parametri con il docente** — neutro isolato: primo guasto a terra (allarme, nave in servizio),
   secondo guasto (intervento) e confronto con un impianto TN; corrente di cortocircuito con 1, 2, 3 generatori e
   scelta Icu/Ics/Icm; spunto dell'elica di manovra con un solo gruppo: caduta di tensione.
5. **Presentazione** — lo studente presenta la centrale configurata e giustifica: quanti generatori e perché,
   quali carichi sono essenziali, come ha ottenuto la selettività.

Tutto il resto (tutorial guidato, scheda tecnica, presentazione, VR) si riusa com'è.

---

## 3. Modulo B — "Media tensione": cabina MT/BT e quadro principale MT di bordo

**Taglio didattico.** In media tensione lo studente non cabla morsetti: *manovra in sicurezza, dimensiona e
coordina*. Il valore della VR qui è massimo, perché le manovre in una cabina MT reale non si fanno fare a uno
studente. Due contesti con gli stessi componenti:

- **Cabina MT/BT terrestre** (consegna a 20 kV, norma CEI 0-16): è la media tensione che gli istituti conoscono e
  che compare nei programmi;
- **Quadro principale MT di una grande nave** (6,6 o 11 kV, due semisbarre con generatori MT e congiuntore): è il
  ponte con il modulo A e il contesto del quaderno ABB.

### 3.1 Ambiente e componenti

- Locale cabina con le **celle MT** affiancate: arrivo linea, misure (TA/TV), protezione generale, protezione
  trasformatore; sul retro i cavi MT, a fianco il **trasformatore MT/BT in resina** e il quadro BT;
- in ogni cella: **sezionatore di linea**, **interruttore MT** (vuoto o SF6) estraibile, **sezionatore di terra**,
  indicatori di presenza tensione, **interblocchi** meccanici e a chiave;
- **relè di protezione** con funzioni ANSI 50/51 (sovracorrente), 51N (guasto a terra), 27/59 (minima/massima
  tensione), 81 (frequenza), 67 (direzionale) per il congiuntore;
- **fusibili MT** per i trasformatori piccoli; **generatore MT** e **motore sincrono di propulsione** con
  convertitore come oggetti esplorabili (schema di principio animato: genset → sbarra MT → synchroconverter →
  motore → elica), **HVSC** come variante della presa da terra;
- DPI e attrezzi (guanti, fioretto, cartelli) come oggetti della procedura in VR.

### 3.2 Attività

1. **Sequenza di manovra in sicurezza** (la più adatta alla VR): mettere fuori servizio una cella per lavorare sul
   trasformatore — apri l'interruttore, apri il sezionatore, verifica assenza tensione, chiudi il sezionatore di
   terra, apponi i cartelli: gli interblocchi impediscono l'ordine sbagliato e il configuratore spiega perché
   (le "cinque regole", CEI 11-27);
2. **Dimensionamento della cabina**: potenza del trasformatore dai carichi BT, corrente nominale MT, protezione al
   primario selettiva verso il secondario, corrente di cortocircuito MT e BT a valle del trasformatore;
3. **Guasto a terra in MT** con neutro a resistenza (nave) o compensato: corrente di guasto limitata, 51N, confronto
   con la BT;
4. **Selettività MT/BT**: taratura dei relè perché intervenga solo la protezione più vicina al guasto, curve
   tempo-corrente sulla LIM;
5. **Nave grande**: due semisbarre MT, congiuntore con protezione direzionale, trasformatori MT/BT verso le
   sottostazioni, continuità con un gruppo fuori servizio; HVSC in porto.

### 3.3 Che cosa serve nel motore

Il risolutore lavora in volt generici: la media tensione è un cambio di scala, non di metodo. Servono: tensione di
sistema parametrica (già necessaria per il modulo A), relè di protezione a curve ANSI (oggi ci sono solo curve B/C/D
e termica), un modello di **interblocco/sequenza** (macchina a stati per cella: aperto/chiuso/sezionato/a terra, con
regole di transizione) e la verifica delle sequenze come "prove di funzionamento". I modelli 3D delle celle MT e del
trasformatore in resina vanno fatti da zero (quelli attuali sono tutti modulari DIN).

---

## 4. Che cosa c'è già e che cosa va costruito

| Già nel configuratore | Da costruire |
|---|---|
| Risolutore a fasori trifase con cortocircuiti, sovraccarichi, guasti a terra, motori, trasformatori (XF) | Sorgenti multiple con parallelo, rete in isola (tensione/frequenza dipendenti dal carico), load shedding |
| Sistemi TT e TN-S con Re, differenziali, tensione di contatto | Sistema IT con controllo dell'isolamento e primo/secondo guasto |
| 230/400 V 50 Hz fissi nel codice | Tensione e frequenza di sistema parametriche (440/690 V, 60 Hz, MT) |
| Curve B/C/D, termica, relè termico motore, limitatore del contatore | Protezioni di generatore (RP, UV/OV, UF/OF), sganciatori elettronici L-S-I-G, relè ANSI per la MT |
| Verifiche CEI 64-8 semplificate | Verifiche "registro navale" (IEC 61363, Icu/Ics/Icm, n−1, essenziali) e CEI 0-16 |
| 31 modelli DIN e di campo, banco d'aula | Sala quadri di bordo, quadro a due semisbarre, genset, presa da terra, celle MT, trasformatore in resina |
| Esercitazioni, tutorial, scheda tecnica, presentazione, VR | Nuove esercitazioni e lezioni; procedura di manovra MT come tipo di passo |

---

## 5. Piano per fasi e ordine di grandezza

| Fase | Contenuto | Stima |
|---|---|---|
| **A1** | Motore: tensione/frequenza parametriche, sistema IT, sorgenti multiple con regola di parallelo, rete in isola | 4–5 giorni |
| **A2** | Banco "Sala quadri di bordo" e componenti nautici (modelli 3D procedurali, catalogo, verifiche nave) | 5–6 giorni |
| **A3** | Le 5 esercitazioni di bordo, 2–3 lezioni del tutorial, modelli predefiniti ("yacht", "traghetto piccolo") | 3–4 giorni |
| **B1** | Cabina MT/BT: celle, interblocchi, relè ANSI, sequenza di manovra in VR | 6–8 giorni |
| **B2** | Quadro MT di bordo, propulsione elettrica esplorabile, HVSC, esercitazioni MT | 4–5 giorni |

Le stime sono di lavoro di sviluppo con collaudo, senza grafica esterna: i modelli restano procedurali come oggi.
Proposta di ordine: **A1 → A2 → A3**, poi **B1 → B2**. A1 è prerequisito di tutto; A3 è già un laboratorio nautico
completo e mostrabile.

---

## 6. Domande per i colleghi

1. **Taglio del modulo nautico**: yacht/nave piccola tutta in BT (come proposto, cablabile) o grande nave da
   crociera (MT, solo esplorabile)? La proposta fa la prima e tiene la seconda nel modulo MT.
2. **Media tensione**: interessa più la cabina terrestre a 20 kV (CEI 0-16, programmi degli istituti) o il quadro
   MT di bordo? Si possono fare entrambi con gli stessi componenti.
3. **Frequenza di riferimento** per il nautico: 60 Hz (navi) o 50 Hz (cantieri italiani, continuità con il resto
   del laboratorio)? Proposta: parametro, default 60 Hz nel preset nave.
4. **Registro di riferimento** per le verifiche: RINA (italiano) con le prescrizioni comuni agli altri (tabella 2
   del quaderno)?
5. Ci sono altri documenti (programmi ITS, schede di laboratorio, quaderni ABB n. 1 sulla selettività, n. 2
   sulle cabine MT/BT) da usare come riferimento? Il quaderno n. 2 ABB "Cabine MT/BT" sarebbe il naturale
   compagno del QT12 per il modulo B.

---

*Il quaderno ABB è un documento commerciale: i capitoli 8–9 sono catalogo prodotti e non entrano nel laboratorio;
le prescrizioni dei registri (cap. 7) sono riportate in forma semplificata a scopo didattico, come già fatto per la
CEI 64-8.*
