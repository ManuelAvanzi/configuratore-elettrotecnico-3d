# Dispositivi elettrotecnici — Configuratore 3D

Laboratorio immersivo **web + WebXR** per gli istituti tecnici a indirizzo *Elettronica ed Elettrotecnica*
(CarraroLab / ITS). Riferimento: scheda del catalogo
[Dispositivi elettrotecnici: configuratore 3D](https://education.carraro-lab.com/catalogo-dei-laboratori-didattici/elettronica-ed-elettrotecnica,istituti-tecnici/dispositivi-elettrotecnici-configuratore-3d/).

Non è un'app per visori: è una pagina web. Funziona da **PC/Mac** (mouse e tastiera), su **proiettore/LIM**
e, dal browser del visore (Meta Quest), in **realtà virtuale** con il pulsante *Entra in VR*.

## Le tre pagine

| Pagina | File | Per chi |
|---|---|---|
| **Homepage** | `index.html` | presenta il laboratorio e fa scegliere come iniziare (due pulsanti) |
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
- **Esercitazioni guidate** con passi verificati in automatico e *prove di funzionamento* simulate:
  punto luce, quadro di un appartamento, relè passo-passo, luce scale e presenza, teleavviamento motore,
  valutazione dei carichi, guasto a terra (con il docente).
- **Modalità docente**: inserimento di guasti (dispersioni, massa franca, persona a contatto, cavo interrotto,
  morsetto allentato) e caricamento delle soluzioni.
- **Scheda tecnica** stampabile/PDF (output finale del laboratorio): immagini del banco, dati di fornitura,
  distinta, elenco collegamenti, verifiche, misure, motivazioni delle scelte, esito dell'esercitazione.
- **Presentazione guidata** per proiettore/LIM: la telecamera accompagna la classe componente per componente.
- **Realtà virtuale (WebXR)**: raggi dei controller, teletrasporto e rotazione a scatti, tablet sul controller
  sinistro (strumenti, libreria, simulazione, proprietà), etichette fluttuanti, vibrazione dei controller.

Le 4 fasi della scheda del laboratorio corrispondono a: *Modelli* (Fase 1) → configurazione e cablaggio (Fase 2) →
simulazione, misure e *Verifiche* (Fase 3) → *Scheda tecnica* e *Presenta* (Fase 4).

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
| `npm test` | tutti i collaudi: simulatore e verifiche (67 prove) + lezioni del tutorial (70 prove) |

### Provarlo sul visore (Meta Quest)

WebXR richiede HTTPS (tranne su `localhost`).

1. Sul PC: `npm run dev:quest` (PC e visore sulla stessa rete Wi-Fi).
2. Nel browser del Quest apri `https://IP-DEL-PC:5190` (l'IP lo stampa Vite) e accetta il certificato di sviluppo.
3. Premi **Entra in VR**.

In produzione basta pubblicare `dist/` su un qualunque hosting HTTPS (es. Cloudflare Pages, server della scuola):
il visore apre l'indirizzo e si entra in VR dal browser, senza installare nulla.

**Comandi in VR** — grilletto: seleziona / aziona / collega / trascina · levetta destra avanti: teletrasporto ·
levetta destra di lato: rotazione a scatti · levetta sinistra: camminata · A: cambia strumento ·
B: annulla operazione · Y: mostra/nascondi il tablet.

**Anteprima VR sul PC**: in *Impostazioni* attiva “Visore emulato” (o aggiungi `#xr=emula` all'indirizzo) e ricarica:
un Meta Quest 3 simulato (libreria IWER di Meta) permette di mostrare alla classe tablet e comandi.

### Indirizzi utili

- `?modello=appartamento` · `?modello=motore` · `?modello=domotica` · `?modello=vuoto1f` · `?modello=vuoto3f` — apre
  direttamente un modello predefinito.
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
  catalog/defs/  definizione elettrica dei componenti (parametri, morsetti, elementi di circuito, logiche)
  models/        modelli 3D procedurali (DIN modulari e industriali, dispositivi di campo, serigrafie)
  scene/         palcoscenico, aula e banco, instradamento cavi, vista del progetto, copertine, ottimizzazione
  interaction/   puntamento, strumenti (seleziona, cabla, misura, posiziona), mouse e tastiera
  ui/            interfaccia: barra, libreria, proprietà, verifiche, esercitazioni, LIM, presentazione
  xr/            realtà virtuale: sessione, controller, teletrasporto, tablet su canvas
  exercises/     esercitazioni guidate del laboratorio completo (passi, prove, domande)
  presets/       modelli predefiniti
  report/        scheda tecnica stampabile
  styles/        app.css (laboratorio), tutorial.css, home.css
public/img/      immagini della homepage e copertine delle lezioni (ricavate dal 3D)
tests/           collaudo in Node: simulatore (sim.test.mjs) e lezioni del tutorial (lessons.test.mjs)
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

- Regime sinusoidale a 50 Hz con fasori (valori efficaci); rete del distributore con impedenza ricavata dalla Icc
  presunta; neutro a terra in cabina (1 Ω); dispersore dell'utente Re impostabile.
- Resistività del rame a 70 °C (0,0214 Ω·mm²/m). Portate Iz: CEI-UNEL 35024/1, posa B1, PVC, 30 °C.
- Curve di intervento **didattiche** (non di catalogo): magnetico a soglia fissa (B 4·In, C 7,5·In, D 15·In),
  termico a tempo inverso; limitatore del contatore oltre il 10% dopo alcuni secondi. La simulazione si può
  accelerare (×5, ×20) per osservare gli interventi termici.
- Carichi a impedenza costante; motore con impedenza di rotore bloccato all'avviamento (≈ 6·In).
- Le verifiche seguono CEI 64-8, CEI EN 60898-1, CEI EN 61008/61009 in forma semplificata: sono uno strumento
  didattico, non sostituiscono il progetto di un impianto reale.

---

## Prossimi passi (proposta)

- Modalità **multiutente**: docente e studenti sullo stesso banco (visore + PC + LIM sincronizzati).
- **Schema unifilare/multifilare** generato automaticamente dal cablaggio, anche nella scheda tecnica.
- Nuovi componenti: trasformatore di sicurezza 230/24 V, alimentatore 24 V c.c., temporizzatore ritardato,
  avviamento stella-triangolo, inversione di marcia con interblocco, fusibili, SPD, PLC/domotica bus.
- **Realtà aumentata** su tablet (WebXR AR) per il laboratorio gemello “Manuale aumentato”.
- Mani (hand tracking) in VR, modelli glTF da catalogo, esportazione verso LMS/registro, integrazione come
  progetto nella piattaforma MetaReality.
