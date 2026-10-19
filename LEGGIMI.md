# Dispositivi elettrotecnici — Configuratore 3D

Laboratorio immersivo **web + WebXR** per gli istituti tecnici a indirizzo *Elettronica ed Elettrotecnica*
(CarraroLab / ITS). Riferimento: scheda del catalogo
[Dispositivi elettrotecnici: configuratore 3D](https://education.carraro-lab.com/catalogo-dei-laboratori-didattici/elettronica-ed-elettrotecnica,istituti-tecnici/dispositivi-elettrotecnici-configuratore-3d/).

Non è un'app per visori: è una pagina web. Funziona da **PC/Mac** (mouse e tastiera), su **proiettore/LIM**
e, dal browser del visore (Meta Quest), in **realtà virtuale** con il pulsante *Entra in VR*.

## Le tre pagine

| Pagina | File | Per chi |
|---|---|---|
| **Homepage** | `index.html` | marchio “ELETTROLAB”, hero fotografico a tutto schermo (tre scene: classe, banco, quadro), “come funziona” in tre punti, “inizia da qui” con tre card (tutorial, laboratorio, esercitazioni), piede con il logo CarraroLab |
| **Tutorial guidato** | `tutorial.html` | chi parte da zero: una spiegazione alla volta, il punto da cliccare evidenziato |
| **Laboratorio completo** | `laboratorio.html` | chi sa già e il docente: configuratore libero con tutte le funzioni |

### Il tutorial guidato

Cinque lezioni brevi (10–15 minuti), ognuna su un'operazione semplice:

1. **La tua prima lampada** — fase e neutro, magnetotermico, interruttore e lampada (si parte da zero).
2. **Il differenziale ti protegge** — conduttore di terra, tasto di prova, guasto simulato su una lavatrice.
3. **Una luce da due punti** — deviatori e navette.
4. **Avvia un motore con un pulsante** — contattore, pulsantiera, autoritenuta.
5. **Misura con il multimetro** — tensione con i puntali, corrente con la pinza, legame tra potenza e corrente.

Ogni passo è di un tipo: *spiegazione* (si legge e si preme Avanti), *collegamento* (due morsetti evidenziati con i
cerchi 1 e 2 e una freccia), *prova tu* (azionare una leva, un pulsante, dare corrente), *misura* e *domanda* (a
risposta multipla con spiegazione). Il configuratore inquadra da solo ciò di cui si parla, lascia cliccare solo il
punto giusto (con un suggerimento gentile se si sbaglia), riconosce quando il passo è fatto e passa al successivo.
**Mostrami come** esegue il passo al posto dello studente. Anche la LIM dell'aula e il tablet in VR mostrano il passo
corrente. A fine lezione l'impianto si può aprire nel laboratorio completo.

---

## Cosa fa il laboratorio completo

- **Aula-laboratorio 3D** con banco didattico: quadro elettrico con 4 guide DIN e canaline, contatore del
  distributore, collettore di terra, pannello utenze a 15 posizioni, canalina di collegamento, LIM con cruscotto.
- **31 componenti reali** modellati in 3D a misura (modulo DIN 17,5 mm): sezionatori, magnetotermici 1P+N/3P/3P+N,
  differenziali 2P/4P, magnetotermico-differenziale, relè termico, contattori, relè passo-passo, temporizzatore
  luce scale, crepuscolare, spie, pulsanti, contatore di energia, morsetti; lampade, prese con apparecchi,
  interruttori, deviatori, invertitori, pulsanti, pulsantiera marcia-arresto, rilevatore di presenza, suoneria,
  motore asincrono trifase.
- **Cablaggio** morsetto → morsetto: i cavi vengono instradati automaticamente nelle canaline (con ponticelli tra
  morsetti vicini), colori e sezioni normalizzati (automatici o a scelta), lunghezza elettrica calcolata.
- **Simulazione elettrica vera** (analisi nodale in corrente alternata con fasori, trifase inclusa):
  tensioni e correnti su ogni morsetto e cavo, cadute di tensione, cortocircuiti (intervento magnetico, potere di
  interruzione), sovraccarichi (intervento termico a tempo inverso), guasti a terra nel sistema TT/TN-S
  (differenziale, tensione di contatto, corrente nel corpo), limitatore del contatore, bobine (autoritenuta,
  interblocchi, bobina bruciata se alimentata alla tensione sbagliata), motore (spunto, senso ciclico, mancanza di
  fase, collegamento stella/triangolo), temporizzatori, crepuscolare, sensori.
- **Verifiche normative automatiche** (semplificate, a scopo didattico): Ib ≤ In ≤ Iz, potere di interruzione,
  differenziale 30 mA sulle prese, Re·IΔn ≤ 50 V, continuità del PE, colori dei conduttori, interruttori sul neutro,
  sezioni minime delle prese, relè termico del motore, potenza contrattuale, cadute di tensione, morsetti con più
  di 2 conduttori.
- **Strumenti di misura**: multimetro (tensione tra due morsetti) e pinza amperometrica (corrente in un cavo).
- **Esercitazioni guidate** con passi verificati in automatico e *prove di funzionamento* simulate, organizzate
  nelle **cinque esercitazioni pratiche della scheda del laboratorio**:
  1. *Configurazione base di un impianto elettrico* — punto luce, quadro di un appartamento;
  2. *Montaggio virtuale di un quadro con collegamenti logici* — relè passo-passo, teleavviamento motore;
  3. *Configurazione di un impianto domotico per uso civile* — luce scale e presenza, la casa automatica
     (passo-passo, temporizzatore, crepuscolare, rilevatore di presenza);
  4. *Analisi dei parametri guidata dal docente* — valutazione dei carichi, distanze/sezioni/protezioni,
     guasto a terra;
  5. *Presentazione dello studente della configurazione adottata* — percorso sull'impianto attuale: dati del
     progetto, motivazione di ogni protezione, quattro domande di giustificazione, verifiche, presentazione e
     scheda tecnica.
- **Modalità docente**: inserimento di guasti (dispersioni, massa franca, persona a contatto, cavo interrotto,
  morsetto allentato) e caricamento delle soluzioni.
- **Giustificazione delle scelte** (pannello Progetto): quattro domande — fornitura e potenza, protezioni,
  conduttori, varianti scartate — le cui risposte finiscono nella presentazione e nella scheda tecnica.
- **Scheda tecnica** stampabile/PDF (output finale del laboratorio insieme all'impianto esplorabile): immagini
  del banco, dati di fornitura, distinta, elenco collegamenti, verifiche, misure, motivazioni delle scelte,
  giustificazioni, esito dell'esercitazione.
- **Presentazione guidata** per proiettore/LIM: progetto → le scelte (giustificazioni) → componente per
  componente con la sua motivazione → verifiche. È lo strumento della Fase 4.
- **Realtà virtuale (WebXR)**: raggi dei controller, teletrasporto e rotazione a scatti, tablet sul controller
  sinistro (strumenti, libreria, simulazione, proprietà), etichette fluttuanti, vibrazione dei controller.
- **Impianti di bordo (modulo nautico, fase A1 — motore)**: sistema di rete parametrico (230/400 V 50 Hz,
  254/440 V 60 Hz, 400/690 V 60 Hz, scelto dalla sorgente), sistema **IT a neutro isolato** accanto a TT e TN-S
  (primo guasto a terra senza intervento, secondo guasto = cortocircuito), **gruppo diesel-generatore** con
  interruttore di macchina, sincronizzatore automatico o manuale, parallelo di più gruppi con ripartizione del
  carico, chiusura fuori fase, protezione di generatore (cortocircuito breve-ritardato, sovraccarico 1,5 In in
  2 min, inversione di potenza), gruppo di riserva ad avviamento automatico, **rete in isola** (caduta di tensione
  allo spunto dei motori, frequenza che cala oltre la potenza nominale), **dispositivo di controllo
  dell'isolamento** (misura con il metodo dell'iniezione, allarme sotto soglia, contatto 11-14), **relè di
  distacco carichi** (per carico o per frequenza), verifiche di centrale (potenza installata, riserva n−1,
  controllo isolamento obbligatorio in IT). Modello predefinito “Centrale elettrica di bordo” (`?modello=nave`).
  Cavi fino a 120 mm², motori fino a 75 kW, interruttori modulari fino a 125 A.
- **Impianti di bordo, fase A2**: **sala quadri di bordo** in 3D (paratie in acciaio con rinforzi, ponte in lamiera
  mandorlata, oblò, tubazioni e passerelle cavi, consolle, porta stagna, salvagente) che compare da sola quando
  l'energia viene dai gruppi; **presa di banchina** (shore connection) con controllo della sequenza delle fasi,
  interblocco a black-out o trasferimento in parallelo, limite di potenza della banchina; **gruppo di emergenza**
  ad avviamento automatico al black-out (si ferma 30 s dopo il rientro); **commutatore automatico ATS** (rete
  normale / rete di emergenza) e **UPS** monofase con batteria per luci e strumenti; utenze marcate **essenziali**;
  verifiche “Impianto di bordo (registri navali)”: Icu ≥ Iac e Icm ≥ Ip senza back-up, utenze essenziali
  alimentate tramite ATS/UPS, presenza di una sorgente di emergenza, controllo di sequenza sulla banchina.
  La proposta completa dei moduli nautico e media tensione è in
  [docs/PROPOSTA-nautico-e-media-tensione.md](docs/PROPOSTA-nautico-e-media-tensione.md).

Le 4 fasi della scheda del laboratorio corrispondono a: *Modelli predefiniti* (Fase 1 — introduzione al
configuratore) → configurazione e cablaggio, anche in VR (Fase 2) → *analisi dei parametri guidata dal docente*
con misure e *Verifiche* (Fase 3) → *Presenta* e *Scheda tecnica* (Fase 4 — verifica e presentazione finale della
configurazione adottata).

---

## Avvio

Serve **Node.js 20** o superiore.

```bash
npm install
npm run dev
```

Poi apri <http://localhost:5190> (homepage).

| Comando | A cosa serve |
|---|---|
| `npm run dev` | sviluppo sul PC (http://localhost:5190) |
| `npm run dev:quest` | come sopra ma in rete locale con HTTPS, per aprirlo dal visore |
| `npm run build` | versione da pubblicare nella cartella `dist/` (sito statico con le tre pagine) |
| `npm run preview` | prova locale della versione `dist/` |
| `npm run pubblica` | pubblica il sito su GitHub Pages (ramo `gh-pages`) |
| `npm test` | tutti i collaudi: simulatore e verifiche (69 prove) + lezioni del tutorial (70 prove) + esercitazioni (46 prove) + modulo nautico (96 prove) |

### Provarlo sul visore (Meta Quest)

WebXR richiede HTTPS (tranne su `localhost`).

1. Sul PC: `npm run dev:quest` (PC e visore sulla stessa rete Wi-Fi).
2. Nel browser del Quest apri `https://IP-DEL-PC:5190` (l'IP lo stampa Vite) e accetta il certificato di sviluppo.
3. Premi **Entra in VR**.

In produzione basta pubblicare `dist/` su un qualunque hosting HTTPS: il visore apre l'indirizzo e si entra in VR
dal browser, senza installare nulla.

### Sito online (GitHub Pages)

Il laboratorio è pubblicato su **<https://manuelavanzi.github.io/configuratore-elettrotecnico-3d/>** (repo
<https://github.com/ManuelAvanzi/configuratore-elettrotecnico-3d>, ramo `gh-pages`). Per aggiornarlo dopo una
modifica:

```bash
npm run pubblica
```

Lo script costruisce `dist/`, lo spinge sul ramo `gh-pages` e il sito si aggiorna in circa un minuto. Servono le
credenziali GitHub salvate sul PC (le stesse del `git push`).

**Comandi in VR** — grilletto: seleziona / aziona / collega / trascina · levetta destra avanti: teletrasporto ·
levetta destra di lato: rotazione a scatti · levetta sinistra: camminata · A: cambia strumento ·
B: annulla operazione · Y: mostra/nascondi il tablet.

**Anteprima VR sul PC**: in *Impostazioni* attiva “Visore emulato” (o aggiungi `#xr=emula` all'indirizzo) e ricarica:
un Meta Quest 3 simulato (libreria IWER di Meta) permette di mostrare alla classe tablet e comandi.

### Indirizzi utili

- `?modello=appartamento` · `?modello=motore` · `?modello=domotica` · `?modello=vuoto1f` · `?modello=vuoto3f` — apre
  direttamente un modello predefinito.
- `?scheda=guide` (oppure `checks`, `props`) — apre il laboratorio con quella scheda del pannello destro già
  selezionata (la card “Esercitazioni in classe” della homepage usa `?scheda=guide`).
- `?modello=nave` — la centrale elettrica di bordo: due gruppi da 50 kVA a 440 V 60 Hz con neutro isolato, presa
  di banchina, gruppo di emergenza da 30 kVA con ATS e UPS, timoneria e luci di navigazione essenziali, elica di
  manovra e cucina non essenziali. Il pulsante “Avvia la centrale” avvia, sincronizza e mette in parallelo i gruppi
  principali (non quello di emergenza, che parte solo al black-out); dal pannello Proprietà di ogni gruppo si
  fanno le singole manovre (avvia, sincronizza, chiudi, apri, ripristina) e dalla presa di banchina si collega il
  cavo e si chiude l'interruttore. Prova del black-out: ferma i due gruppi e guarda UPS, gruppo di emergenza e ATS.
- Il progetto in corso viene salvato automaticamente nel browser; *Salva* / *Apri* usano file `.impianto.json`.

---

## Struttura del codice

```
index.html       homepage              → src/home/main.js      (leggera: non carica il 3D)
tutorial.html    tutorial guidato      → src/tutorial/main.js
laboratorio.html laboratorio completo  → src/main.js
src/
  app/           applicazione 3D condivisa da tutorial e laboratorio (modalità 'lab' / 'tutorial')
  home/          homepage: icone e schede delle lezioni
  tutorial/      lezioni (lessons.js), regia dei passi (Tutorial.js), segnaposti 3D (Markers.js), pannello (CoachUI.js)
  sim/           simulatore: numeri complessi, risolutore MNA, motore degli eventi, tabelle normative, verifiche
  catalog/defs/  definizione elettrica dei componenti (parametri, morsetti, elementi di circuito, logiche);
                 nautico.js = gruppo elettrogeno (anche di riserva e di emergenza), controllo isolamento,
                 relè di distacco carichi, presa di banchina, commutatore ATS, UPS
  models/        modelli 3D procedurali (DIN modulari e industriali, dispositivi di campo, serigrafie)
  scene/         palcoscenico, aula e banco (World.js: tema 'aula' o 'nave' con setTheme), instradamento cavi,
                 vista del progetto, copertine, ottimizzazione
  interaction/   puntamento, strumenti (seleziona, cabla, misura, posiziona), mouse e tastiera
  ui/            interfaccia: barra, libreria, proprietà, verifiche, esercitazioni, LIM, presentazione
  xr/            realtà virtuale: sessione, controller, teletrasporto, tablet su canvas
  exercises/     esercitazioni guidate del laboratorio completo: fasi, i 5 percorsi della scheda (TRACKS),
                 domande di giustificazione (JUSTIFICATIONS), esercitazioni (passi, prove, domande)
  presets/       modelli predefiniti
  report/        scheda tecnica stampabile
  styles/        app.css (laboratorio), tutorial.css, home.css
public/img/      immagini della homepage e copertine delle lezioni (ricavate dal 3D); le tre foto della classe
                 (classe-hero, classe-vr, classe-pc) sono immagini illustrative generate con l'AI (Canva,
                 19/10/2026), non fotografie reali: la homepage lo dichiara nella didascalia dell'hero
tests/           collaudo in Node: simulatore (sim.test.mjs), lezioni del tutorial (lessons.test.mjs),
                 esercitazioni (exercises.test.mjs: struttura, soluzioni che completano passi e prove),
                 modulo nautico (nautico.test.mjs: sistema 440 V, IT, gruppi, parallelo, isola, distacco carichi,
                 banchina, black-out con UPS/emergenza/ATS, verifiche da registro)
```

La parte elettrica (`src/sim`, `src/catalog/defs`, `src/core`) non dipende da Three.js: si collauda in Node e si può
riusare (es. in un server per la modalità multiutente).

### Aggiungere un componente

1. In `src/catalog/defs/` definisci tipo, parametri, morsetti (`terminals`), elementi di circuito (`elements`:
   contatti, impedenze, generatori, trasformatori), logiche (`evaluate` istantanea, `tick` nel tempo), azioni
   (`interact`), letture (`readouts`), eventuale `protection` / `load` / `paths` per le verifiche.
2. Registralo in `src/catalog/defs/index.js`.
3. Per il 3D: i dispositivi DIN si descrivono in `src/models/dinTypes.js` (serigrafia e dotazioni), quelli di campo
   in `src/models/field.js`.
4. Aggiungi uno scenario in `tests/sim.test.mjs`.

### Aggiungere un'esercitazione al laboratorio

Le esercitazioni sono dati in `src/exercises/index.js`:

1. Aggiungi un oggetto a `EXERCISES` con `id`, `track` (uno dei cinque percorsi in `TRACKS`), `title`, `level`,
   `phase` (1–4), `icon`, `color`, `duration`, `summary`, `goals`, `start()` (progetto di partenza) e, se c'è,
   `solution()`; `teacher: true` se è guidata dal docente, `keep: true` se lavora sull'impianto attuale invece di
   sostituirlo (come la presentazione).
2. `steps`: ogni passo ha `text`, facoltativo `hint`, e `done(ctx)` che restituisce vero quando il passo è fatto
   (`ctx` è `exerciseContext`: `has`, `count`, `wired`, `termWired`, `lampFrom`, `checkOk/Err/Warn`, `powered`,
   `seen` per ricordare un evento osservato, `meta`, `just`, `protections`, `noted`…). Un passo che richiede
   un'azione dal vivo (dare corrente, premere) va marcato `live: true`.
3. `tests`: prove di funzionamento con `label` e `run(ctx)`; `ctx.scenario([...])` simula l'impianto in isolamento
   (passi `power`, `set`, `params`, `act`, `env`, `wait`, `check`).
4. `questions`: le domande per l'analisi guidata dal docente (finiscono nella scheda tecnica).
5. `npm run test:esercitazioni` controlla la struttura e che la soluzione completi i passi e superi le prove.

### Aggiungere una lezione al tutorial

Le lezioni sono solo dati, in `src/tutorial/lessons.js`:

1. Scrivi l'impianto di partenza con `build(...)` (come i modelli predefiniti): i componenti già montati e gli
   eventuali cavi già posati.
2. Aggiungi un oggetto a `LESSONS` con `id`, `n`, `title`, `subtitle`, `duration`, `icon`, `color`, `cover`,
   `goals`, `start` e l'elenco `steps`. Ogni passo ha `type`, `title`, `text`, `todo` (cosa fare), facoltativi `why`
   (approfondimento), `focus` (sigle dei componenti o parti del banco da inquadrare ed evidenziare, es. `Q1`,
   `meter`), `schema` (disegno SVG). Poi, secondo il tipo:
   `from`/`to` per *collegamento*, *misura* e *pinza* (`'SIGLA:morsetto'`); `target`, `done(ctx)` e `perform(ctx)` per
   *prova tu*; `options` (una sola `correct`) per *domanda*.
3. `npm test` percorre la nuova lezione con “Mostrami come” e controlla che ogni passo si completi.
4. La copertina (`public/img/lezione-<id>.jpg`) si ricava dal 3D: in sviluppo il server accetta le immagini in POST
   su `/__dev/salva?nome=<file>.jpg` e le scrive in `public/img/` (solo con `npm run dev` sul PC: non c'è con
   `dev:quest` né nella build).

La homepage e l'elenco delle lezioni del tutorial si aggiornano da soli.

---

## Modello di calcolo e semplificazioni

- Regime sinusoidale con fasori (valori efficaci) alla tensione e frequenza del sistema dichiarato dalla sorgente;
  rete del distributore con impedenza ricavata dalla Icc presunta; neutro a terra in cabina (1 Ω) nei sistemi
  TT/TN-S, isolato tramite la resistenza di isolamento della rete (default 200 kΩ) nel sistema IT; dispersore Re
  impostabile.
- Gruppo elettrogeno: sorgente trifase con reattanza subtransitoria X″d (12–20 % sulla base Vll²/Sn), tensione e
  frequenza nominali tenute dai regolatori fino alla potenza nominale; oltre, la frequenza di sbarra cala del 4 %
  per ogni 100 % di sovraccarico (fino a −15 %). I gruppi in parallelo sono fasori allo stesso angolo (il
  sincronismo è una regola, non una dinamica): un gruppo chiuso fuori fase ha un angolo diverso e produce una
  corrente di circolazione che fa intervenire la sua protezione. Ripartizione del carico in proporzione a Sn
  (impedenze interne). Protezioni di generatore semplificate: cortocircuito oltre 3 In con ritardo 0,3 s
  (0,1 s se chiuso fuori fase), sovraccarico a tempo inverso con 1,5 In → ~2 min, inversione di potenza oltre
  l'8 % di Pn per 2 s. Gruppo di emergenza: parte 1 s dopo che nessun'altra sorgente è in servizio, chiude dopo
  altri 2 s, si ferma 30 s dopo il rientro. Presa di banchina: sorgente trifase con l'impedenza della banchina e
  la sequenza delle fasi scelta; l'interblocco e il controllo di sequenza sono regole della manovra. ATS: commuta
  sull'ingresso di emergenza quando il normale scende sotto il 70 % della tensione nominale (ritardo impostabile).
  UPS: passante da rete; da batteria è una sorgente monofase con autonomia proporzionale al carico.
- Resistività del rame a 70 °C (0,0214 Ω·mm²/m). Portate Iz: CEI-UNEL 35024/1, posa B1, PVC, 30 °C.
- Curve di intervento **didattiche** (non di catalogo): magnetico a soglia fissa (B 4·In, C 7,5·In, D 15·In),
  termico a tempo inverso; limitatore del contatore oltre il 10% dopo alcuni secondi. La simulazione si può
  accelerare (×5, ×20) per osservare gli interventi termici.
- Carichi a impedenza costante; motore con impedenza di rotore bloccato all'avviamento (≈ 6·In).
- Le verifiche seguono CEI 64-8, CEI EN 60898-1, CEI EN 61008/61009 in forma semplificata: sono uno strumento
  didattico, non sostituiscono il progetto di un impianto reale. Per gli impianti di bordo le prescrizioni dei
  registri navali (controllo isolamento in IT, riserva n−1, protezione di generatore) sono riportate in forma
  semplificata dal quaderno ABB QT12.

---

## Prossimi passi (proposta)

- **Impianti di bordo (nautico) e media tensione**: proposta dettagliata, con le idee ricavate dal quaderno ABB
  QT12, in [docs/PROPOSTA-nautico-e-media-tensione.md](docs/PROPOSTA-nautico-e-media-tensione.md).

- Modalità **multiutente**: docente e studenti sullo stesso banco (visore + PC + LIM sincronizzati).
- **Schema unifilare/multifilare** generato automaticamente dal cablaggio, anche nella scheda tecnica.
- Nuovi componenti: trasformatore di sicurezza 230/24 V, alimentatore 24 V c.c., temporizzatore ritardato,
  avviamento stella-triangolo, inversione di marcia con interblocco, fusibili, SPD, PLC/domotica bus.
- **Realtà aumentata** su tablet (WebXR AR) per il laboratorio gemello “Manuale aumentato”.
- Mani (hand tracking) in VR, modelli glTF da catalogo, esportazione verso LMS/registro, integrazione come
  progetto nella piattaforma MetaReality.
