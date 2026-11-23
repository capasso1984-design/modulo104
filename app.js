/* Modulo 104 - app telefono. Tutti i dati restano nel telefono (localStorage / IndexedDB). */
"use strict";
const VERSIONE = "3.28";
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const NUMERI = ["zero","uno","due","tre","quattro","cinque","sei","sette","otto","nove","dieci","undici","dodici","tredici","quattordici","quindici","sedici","diciassette","diciotto","diciannove","venti","ventuno","ventidue","ventitré","ventiquattro","venticinque","ventisei","ventisette","ventotto","ventinove","trenta","trentuno"];
const N_PERIODI = 3, N_ORARI = 8;
const ANAG = [
  ["grado","Grado (es. PG)"],["categoria","Categoria / specialità (es. OFPS)"],["cognome","Cognome"],["nome","Nome"],
  ["reparto","Reparto (es. Compagnia Protezione delle Forze)"],["extra1","Altro dato fisso 1 (facoltativo)"],["extra2","Altro dato fisso 2 (facoltativo)"],
  ["motivo_def","Motivo quando non chiedi permessi (va dopo «in quanto»)"]];
const MOTIVO_PREDEFINITO = "allo stato non risultano esigenze di assistenza già definite per il mese di riferimento; sarà cura dello scrivente darne tempestiva comunicazione non appena le stesse saranno note.";
const IMPOST_DEF = {
  a: "", cc: "",
  oggetto: "{grado_nome} - Programmazione permessi L.104/92 {mese_anno} - {periodi}",
  testo: "Buongiorno,\n\nin allegato la programmazione mensile dei permessi L.104/92 relativa al mese di {mese_anno} ({periodi}).\n\nCordiali saluti\n{grado_nome}",
  nomefile: "104 MODULO L104 {cognome} {mese} {anno}"
};

const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

// ---------------------------------------------------------------- memoria
const mem = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast("Memoria del telefono piena o non disponibile"); return false; } }
};
function idb() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open("modulo104", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("dati");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((ok, ko) => { const t = db.transaction("dati").objectStore("dati").get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ko(t.error); });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((ok, ko) => { const t = db.transaction("dati", "readwrite"); t.objectStore("dati").put(v, k); t.oncomplete = () => ok(); t.onerror = () => ko(t.error); });
}

let pacchetto = null;            // modulo in uso
let moduli = { master: null, tuo: null, uso: null };
let ultimo = null; // {blob, nome, oggetto, testo}

function toast(msg, ms = 3500) {
  const t = $("toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.style.display = "none"), ms);
}

// ---------------------------------------------------------------- navigazione
// menu a schede (stile hub): ogni pagina ha un indirizzo #..., così il tasto "indietro" del telefono torna al menu
document.addEventListener("click", (e) => { const b = e.target.closest("[data-vai]"); if (b) { e.preventDefault(); vai(b.dataset.vai); } });
function vai(id) { const h = id === "s-home" ? "" : "#" + id.slice(2); if (location.hash !== h) location.hash = h; else mostra(id); }
window.addEventListener("hashchange", () => mostra(location.hash ? "s-" + location.hash.slice(1) : "s-home"));
function mostra(id) {
  if (!document.getElementById(id)) id = "s-home";
  document.querySelectorAll("section").forEach((s) => s.classList.toggle("on", s.id === id));
  window.scrollTo(0, 0);
  if (id === "s-home") aggiornaAvvisi();
  if (id === "s-impost") anteprimaEmail();
  if (id === "s-archivio") disegnaArchivio();
  if (id === "s-varmese" && window.M104var) M104var.elencoMesi();
  if (id === "s-copia" && window.M104copia) M104copia.mostraUltima();
  if (id === "s-compila") { costruisciPersonaSel(); if (apriPasso2) { apriPasso2 = false; caricaMeseDaArchivio(); passo(2); } else { $("risultato").style.display = "none"; passo(1); } }
  if ("s-" + location.hash.slice(1) !== id && !(id === "s-home" && !location.hash)) history.replaceState(null, "", id === "s-home" ? location.pathname : "#" + id.slice(2));
}

// ---------------------------------------------------------------- anagrafica
function anag() {
  const a = mem.get("m104_anag", {});
  if (a.motivo_def && a.motivo_def.startsWith("non sono ancora note esigenze di assistenza per il mese in oggetto")) a.motivo_def = MOTIVO_PREDEFINITO;
  // versioni precedenti: una sola persona assistita
  if (!Array.isArray(a.persone)) a.persone = a.assistito ? [{ id: "p1", nome: a.assistito, parentela: a.parentela || "" }] : [];
  if (a.bloccaWE === undefined) a.bloccaWE = true;
  return a;
}
function persone() { return anag().persone; }
function personaCorrente() {
  const ps = persone(), id = mem.get("m104_persona", null);
  return ps.find((p) => p.id === id) || ps[0] || null;
}
function fissi(persona) {
  const a = anag(), p = persona || personaCorrente();
  const f = Object.assign({}, a);
  f.grado_nome = [a.grado, a.categoria, a.cognome, a.nome].filter(Boolean).join(" ");
  f.cognome_nome = [a.cognome, a.nome].filter(Boolean).join(" ");
  f.assistito = p ? p.nome : ""; f.parentela = p ? p.parentela : "";
  return f;
}
function costruisciAnag() {
  const a = anag(), box = $("campi-anag");
  box.innerHTML = "";
  for (const [k, lab] of ANAG) {
    const l = document.createElement("label"); l.textContent = lab; l.htmlFor = "an-" + k;
    const i = document.createElement(k === "motivo_def" ? "textarea" : "input"); i.id = "an-" + k; i.autocomplete = "off";
    i.value = a[k] || (k === "motivo_def" ? MOTIVO_PREDEFINITO : "");
    i.addEventListener("input", anteprimaNome);
    box.append(l, i);
  }
  $("an-bloccaWE").checked = a.bloccaWE !== false;
  $("an-g151").value = a.g151_iniziali || ""; $("an-g151vuoto").checked = !!a.g151_vuoto;
  disegnaPersone(a.persone.length ? a.persone : [{ id: "p1", nome: "", parentela: "" }]);
  anteprimaNome();
  mostraFirma();
}
function disegnaPersone(lista) {
  const box = $("persone"); box.innerHTML = "";
  lista.forEach((p, i) => {
    const r = document.createElement("div"); r.className = "persona"; r.dataset.id = p.id;
    r.innerHTML = `<div><label for="pn-${i}">Cognome e nome</label><input id="pn-${i}" class="p-nome" autocomplete="off"></div>
      <div><label for="pp-${i}">Parentela</label><input id="pp-${i}" class="p-par" autocomplete="off" placeholder="es. Padre"></div>
      <button class="shub__azione p-del" aria-label="Togli questa persona" title="Togli">✕</button>`;
    r.querySelector(".p-nome").value = p.nome || ""; r.querySelector(".p-par").value = p.parentela || "";
    r.querySelector(".p-del").addEventListener("click", () => {
      if (box.children.length === 1) { r.querySelector(".p-nome").value = ""; r.querySelector(".p-par").value = ""; return; }
      if (confirm("Togliere questa persona? I suoi giorni in archivio restano salvati.")) r.remove();
    });
    box.append(r);
  });
}
function leggiPersone() {
  return [...$("persone").querySelectorAll(".persona")].map((r) => ({ id: r.dataset.id, nome: r.querySelector(".p-nome").value.trim(), parentela: r.querySelector(".p-par").value.trim() })).filter((p) => p.nome);
}
$("b-add-persona").addEventListener("click", () => {
  const lista = [...$("persone").querySelectorAll(".persona")].map((r) => ({ id: r.dataset.id, nome: r.querySelector(".p-nome").value, parentela: r.querySelector(".p-par").value }));
  lista.push({ id: "p" + Date.now().toString(36), nome: "", parentela: "" });
  disegnaPersone(lista);
  $("persone").lastElementChild.querySelector(".p-nome").focus();
});
function anteprimaNome() {
  const v = (k) => ($("an-" + k)?.value || "").trim();
  const gn = [v("grado"), v("categoria"), v("cognome"), v("nome")].filter(Boolean).join(" ");
  $("anteprima-nome").textContent = gn ? `Nel modulo comparirà: "Il Sottoscritto ${gn}"` : "";
}
$("b-salva-anag").addEventListener("click", () => {
  const a = mem.get("m104_anag", {});
  for (const [k] of ANAG) a[k] = $("an-" + k).value.trim();
  a.persone = leggiPersone(); a.bloccaWE = $("an-bloccaWE").checked;
  a.g151_iniziali = Math.max(0, parseInt($("an-g151").value, 10) || 0); a.g151_vuoto = $("an-g151vuoto").checked;
  delete a.assistito; delete a.parentela;
  if (mem.set("m104_anag", a)) { toast("Anagrafica salvata ✔"); costruisciPersonaSel(); vai("s-home"); }
});

// ---------------------------------------------------------------- firma
function mostraFirma() {
  const f = mem.get("m104_firma", null), v = $("firma-vista");
  v.innerHTML = f ? `<img alt="Firma" src="${f}">` : '<span class="muted">Nessuna firma</span>';
  $("b-ruota").style.display = f ? "block" : "none";
  $("b-firma-del").style.display = f ? "block" : "none";
}
function caricaImg(src) {
  return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
}
// toglie lo sfondo chiaro e ritaglia la firma
function pulisciFirma(img, daFoto) {
  const max = 1400, sc = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h), p = d.data;
  // luminosità di sfondo: 90° percentile
  const lum = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (p[i * 4] * 0.299 + p[i * 4 + 1] * 0.587 + p[i * 4 + 2] * 0.114) | 0;
  let bg = 255;
  if (daFoto) { const s = Array.from(lum.filter((_, i) => i % 7 === 0)).sort((a, b) => a - b); bg = s[Math.floor(s.length * 0.9)] || 255; }
  const soglia = daFoto ? bg * 0.72 : 200;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = y * w + xx, a = p[i * 4 + 3];
    const scuro = a > 40 && lum[i] < soglia;
    if (scuro) {
      const forza = Math.min(1, (soglia - lum[i]) / (soglia * 0.5));
      p[i * 4] = 20; p[i * 4 + 1] = 30; p[i * 4 + 2] = 70; p[i * 4 + 3] = Math.round(255 * Math.max(0.35, forza));
      if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y;
    } else p[i * 4 + 3] = 0;
  }
  if (x1 < 0) return null;
  x.putImageData(d, 0, 0);
  const m = 6; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, s2 = Math.min(1, 700 / cw);
  const o = document.createElement("canvas"); o.width = Math.round(cw * s2); o.height = Math.round(ch * s2);
  o.getContext("2d").drawImage(c, x0, y0, cw, ch, 0, 0, o.width, o.height);
  return o.toDataURL("image/png");
}
// la foto passa dall'editor: ritaglio, pulizia, controllo; si salva solo se l'utente accetta
$("file-firma").addEventListener("change", (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  window.M104firma.apri(f, (dataUrl) => {
    if (mem.set("m104_firma", dataUrl)) { mostraFirma(); aggiornaAvvisi(); vai("s-anag"); toast("Firma salvata ✔"); }
  });
});
$("b-ruota").addEventListener("click", async () => {
  const f = mem.get("m104_firma", null); if (!f) return;
  const img = await caricaImg(f), c = document.createElement("canvas");
  c.width = img.height; c.height = img.width;
  const x = c.getContext("2d"); x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.drawImage(img, -img.width / 2, -img.height / 2);
  mem.set("m104_firma", c.toDataURL("image/png")); mostraFirma();
});
$("b-firma-del").addEventListener("click", () => { if (confirm("Eliminare la firma salvata?")) { localStorage.removeItem("m104_firma"); mostraFirma(); } });
// disegno con il dito
(function () {
  const cv = $("pad"); let ctx, giu = false, usato = false;
  function prep() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width) return;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#14204a";
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, r.width, r.height); usato = false;
  }
  cv.closest("details").addEventListener("toggle", prep);
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener("pointerdown", (e) => { if (!ctx) prep(); giu = true; usato = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pt(e)); });
  cv.addEventListener("pointermove", (e) => { if (!giu) return; ctx.lineTo(...pt(e)); ctx.stroke(); });
  ["pointerup", "pointercancel"].forEach((t) => cv.addEventListener(t, () => (giu = false)));
  $("b-pad-canc").addEventListener("click", prep);
  $("b-pad-ok").addEventListener("click", async () => {
    if (!usato) { toast("Disegna prima la firma"); return; }
    const img = await caricaImg(cv.toDataURL("image/png"));
    const out = pulisciFirma(img, false);
    if (out && mem.set("m104_firma", out)) { mostraFirma(); toast("Firma salvata ✔"); }
  });
})();

// ---------------------------------------------------------------- modulo .m104
async function caricaPacchetto() {
  try {
    moduli.master = await idbGet("master"); moduli.tuo = await idbGet("tuo"); moduli.uso = await idbGet("uso");
    const vecchio = await idbGet("pacchetto");          // versioni precedenti: un solo modulo
    if (vecchio && !moduli.master && !moduli.tuo) {
      const k = vecchio.origine === "telefono" ? "tuo" : "master";
      moduli[k] = vecchio; moduli.uso = k; await idbSet(k, vecchio); await idbSet("uso", k);
    }
  } catch (e) { /* niente */ }
  if (!moduli[moduli.uso]) moduli.uso = moduli.master ? "master" : moduli.tuo ? "tuo" : null;
  pacchetto = moduli.uso ? moduli[moduli.uso] : null;
  infoModulo();
  masterDalSito();
}
// il modulo master ufficiale è pubblicato sul sito: si carica e si aggiorna da solo
async function masterDalSito() {
  try {
    const r = await fetch("modulo-master.m104?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (j.formato !== "m104" || !j.basi || !j.campi) return;
    const M = moduli.master;
    if (M && M.nome === j.nome && M.creato === j.creato) return;      // già questo
    if (M && !M.dalSito) return;                                       // master messo a mano: non lo tocco
    j.dalSito = true;
    j.caricato = new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
    await salvaModulo("master", j, !moduli.uso || moduli.uso === "master");
    toast(M ? "Modulo master aggiornato ✔" : "Modulo L.104 già pronto ✔");
  } catch (e) { /* offline: resta quello salvato */ }
}
function infoModulo() {
  const M = moduli.master, T = moduli.tuo;
  $("info-modulo").textContent = pacchetto ? `In uso: «${pacchetto.nome}» (${moduli.uso === "master" ? "modulo master" : "caricato da te"})` : "Nessun modulo caricato: scegli una delle due strade qui sotto.";
  const sp = $("stato-pc"), st = $("stato-tel");
  if (M) { sp.className = "stato-mod " + (moduli.uso === "master" ? "ok" : "spento"); sp.innerHTML = `${moduli.uso === "master" ? "✔ <b>Modulo master caricato nel sistema</b> · è quello in uso" : "<b>Modulo master caricato nel sistema</b> · non in uso"}<br>«${esc(M.nome)}» · preparato il ${esc(M.creato)}${M.caricato ? " · caricato il " + esc(M.caricato) : ""}`; }
  else { sp.className = "stato-mod attesa"; sp.innerHTML = "⏳ <b>Nessun modulo master</b><br>In attesa del file .m104 preparato dal PC"; }
  if (T) { st.className = "stato-mod " + (moduli.uso === "tuo" ? "ok" : "spento"); st.innerHTML = `${moduli.uso === "tuo" ? "✔ <b>Modulo caricato da te</b> · è quello in uso" : "<b>Modulo caricato da te</b> · non in uso"}<br>«${esc(T.nome)}» · ${esc(T.creato)}`; }
  else { st.className = "stato-mod spento"; st.textContent = "Nessun modulo caricato da te"; }
  $("b-vedi-pc").style.display = M ? "flex" : "none";
  $("b-vedi-tel").style.display = T ? "flex" : "none";
  $("b-usa-pc").style.display = M && moduli.uso !== "master" ? "flex" : "none";
  $("b-usa-tel").style.display = T && moduli.uso !== "tuo" ? "flex" : "none";
  $("anteprima-pc").style.display = "none"; $("anteprima-tel").style.display = "none";
  $("versione-mod").textContent = "Versione app " + VERSIONE;
  $("sottotitolo").textContent = pacchetto ? pacchetto.nome : "Programmazione permessi L.104/92";
}
// riconosce il tipo di file dai primi byte, non dal nome (WhatsApp e iCloud a volte cambiano l'estensione)
async function tipoFile(f) {
  const t = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  if (t[0] === 0x25 && t[1] === 0x50 && t[2] === 0x44 && t[3] === 0x46) return "pdf";          // %PDF
  if (t[0] === 0x50 && t[1] === 0x4b) return /\.(docx?|dotx)$/i.test(f.name) || !/\.m104$/i.test(f.name) ? "word" : "zip"; // PK = Word
  if (t[0] === 0xd0 && t[1] === 0xcf) return "word";                                               // vecchio .doc
  if (t[0] === 0x7b) return "m104";                                                                // {
  return "altro";
}
function spiegaWord() {
  const box = $("avviso-word");
  box.style.display = "block";
  box.innerHTML = `<b>Hai scelto un file Word.</b> Il telefono non riesce a impaginare un Word in modo identico all'originale, quindi serve uno di questi due passaggi (una volta sola):
    <ol><li><b>Dal telefono:</b> trasformalo in PDF. Su iPhone: apri il Word nell'app <b>File</b> → <b>Condividi</b> → <b>Stampa</b> → allarga l'anteprima con due dita → <b>Condividi</b> → <b>Salva su File</b>. Poi tocca <b>"Preparalo da un PDF"</b> e scegli quel PDF.</li>
    <li><b>Dal PC:</b> apri l'app "Modulo 104", carica il Word e premi <b>"Prepara per il telefono"</b>: ti dà il file .m104 da caricare qui.</li></ol>`;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}
// Word: l'app lo impagina in A4 e apre la preparazione con l'anteprima
async function apriWord(f, daPrepara) {
  toast("Impagino il Word…", 8000);
  try {
    const { pdf, scala } = await window.M104word.docxInPdf(new Uint8Array(await f.arrayBuffer()));
    const nome = f.name.replace(/\.(docx?|dotx)$/i, "");
    const file = new File([pdf], nome + ".pdf", { type: "application/pdf" });
    if (!daPrepara) vai("s-prepara");
    $("prep-nome").value = nome;
    await window.M104prep.apriPdf(file, true);
    toast(scala < 1 ? `Word impaginato in A4 (ridotto al ${Math.round(scala * 100)}% per stare in una pagina). Controlla l'anteprima` : "Word impaginato in A4: controlla l'anteprima e le scelte", 6000);
  } catch (e) {
    console.error(e);
    spiegaWord();
    toast("Non riesco a impaginare questo Word: usa il PDF o il PC", 6000);
  }
}
// chiede conferma prima di sostituire il modulo già in uso
function confermaSostituzione(nuovo) {
  // il modulo caricato da te sostituisce solo il tuo precedente: il master resta conservato
  if (!moduli.tuo) return true;
  return confirm(`Sostituisco il modulo caricato da te\n«${moduli.tuo.nome}» (del ${moduli.tuo.creato})\ncon «${nuovo.nome}»?\n\nIl modulo master resta conservato.`);
}
// riquadro 2: PDF o Word
$("file-pdfword").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const tipo = await tipoFile(f);
  if (tipo === "word") { apriWord(f); return; }
  if (tipo === "pdf") { vai("s-prepara"); $("prep-nome").value = f.name.replace(/\.pdf$/i, ""); window.M104prep.apriPdf(f); return; }
  toast(tipo === "m104" ? "Questo è il file del PC: usa il riquadro 1" : "Scegli un PDF o un Word (.docx)", 5000);
});
// anteprima del modulo in uso, con i dati dell'anagrafica e date di esempio
async function vediModulo(quale) {
  if (!pacchetto) return;
  const b = $("b-vedi-" + quale), box = $("anteprima-" + quale), testo = b.textContent;
  if (box.style.display === "block") { box.style.display = "none"; return; }
  b.disabled = true; b.textContent = "Preparo l'anteprima…";
  try {
    const oggi = new Date(), m = { mese: oggi.getMonth() + 1, anno: oggi.getFullYear(), daDate: true, periodi: [[3, 4]], orari: [], data: fmt(oggi), motivo: "" };
    const r = await creaPdf(m, quale === "pc" ? moduli.master : moduli.tuo);
    box.style.display = "block";
    await anteprimaIn(box, r.blob);
    box.insertAdjacentHTML("afterbegin", '<p class="muted" style="margin:.4rem .6rem">Esempio con i tuoi dati e i giorni 3-4 del mese</p>');
  } catch (err) { console.error(err); toast("Anteprima non disponibile"); }
  b.disabled = false; b.textContent = testo;
}
$("b-vedi-pc").addEventListener("click", () => vediModulo("pc"));
$("b-usa-pc").addEventListener("click", () => usaModulo("master"));
$("b-usa-tel").addEventListener("click", () => usaModulo("tuo"));
$("b-vedi-tel").addEventListener("click", () => vediModulo("tel"));
$("file-m104").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  $("avviso-word").style.display = "none";
  const tipo = await tipoFile(f);
  if (tipo === "word") { apriWord(f); return; }
  if (tipo === "pdf") {   // un PDF va preparato: lo apro direttamente nella preparazione
    vai("s-prepara"); $("prep-nome").value = f.name.replace(/\.pdf$/i, ""); window.M104prep.apriPdf(f);
    toast("È un PDF: controlla le scelte e salva il modulo"); return;
  }
  try {
    const j = JSON.parse(await f.text());
    if (j.formato !== "m104" || !j.basi || !j.campi) throw new Error("formato");
    if (moduli.master && !confirm(`Sostituisco il modulo master attuale\n«${moduli.master.nome}» (del ${moduli.master.creato})\ncon «${j.nome}» (del ${j.creato})?`)) return;
    j.caricato = new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
    const usa = !moduli.tuo || moduli.uso === "master" || confirm(`Ora stai usando il modulo caricato da te («${moduli.tuo.nome}»).\nVuoi usare da subito il nuovo modulo master?`);
    await salvaModulo("master", j, usa);
    toast(usa ? "Modulo master caricato ✔ È quello in uso" : "Modulo master caricato ✔ (resta in uso il tuo)");
    vai("s-modulo"); vediModulo("pc");
  } catch (err) { toast("Questo file non è un modulo: scegli il file .m104, oppure un PDF del modulo vuoto"); }
});
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------------------------------------------------------------- impostazioni
function impost() { return Object.assign({}, IMPOST_DEF, mem.get("m104_impost", {})); }
function costruisciImpost() {
  const i = impost();
  $("em-a").value = i.a; $("em-cc").value = i.cc; $("em-ogg").value = i.oggetto; $("em-testo").value = i.testo; $("nomefile").value = i.nomefile;
  $("versione").textContent = "Versione " + VERSIONE;
  anteprimaEmail();
}
// anteprima con i dati veri e un mese di esempio (giorni 3-4 del mese prossimo)
function anteprimaEmail() {
  const i = impost(), o = new Date(), p = new Date(o.getFullYear(), o.getMonth() + 1, 1);
  const dati = Object.assign({}, fissi(), calcolaValori({ mese: p.getMonth() + 1, anno: p.getFullYear(), periodi: [[3, 4]], orari: [], data: fmt(o), motivo: "" }));
  $("pv-ogg").textContent = riempi(i.oggetto, dati);
  $("pv-testo").textContent = riempi(i.testo, dati);
  $("pv-file").textContent = riempi(i.nomefile, dati) + ".pdf";
  $("em-vista").style.display = ""; $("em-modifica").style.display = "none";
}
$("b-mod-email").addEventListener("click", () => {
  const i = impost(); $("em-ogg").value = i.oggetto; $("em-testo").value = i.testo; $("nomefile").value = i.nomefile;
  $("em-vista").style.display = "none"; $("em-modifica").style.display = "";
});
$("b-annulla-imp").addEventListener("click", anteprimaEmail);
$("b-ripristina-imp").addEventListener("click", () => {
  $("em-ogg").value = IMPOST_DEF.oggetto; $("em-testo").value = IMPOST_DEF.testo; $("nomefile").value = IMPOST_DEF.nomefile;
});
$("b-salva-imp").addEventListener("click", () => {
  if (mem.set("m104_impost", { a: $("em-a").value.trim(), cc: $("em-cc").value.trim(), oggetto: $("em-ogg").value, testo: $("em-testo").value, nomefile: $("nomefile").value })) {
    toast("Salvato ✔"); anteprimaEmail();
  }
});

// ---------------------------------------------------------------- compila
// calendario: si toccano i giorni; i giorni consecutivi diventano un unico periodo "dal… al…"
const NOMI_G = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const BREVI_G = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
let cal = { mese: 0, anno: 0, sel: new Set(), sel151: new Set(), modo: "104" };
const ha151 = () => !!(window.M151 && window.M151.attuale());
function pasqua(y) {   // algoritmo di Meeus
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mese - 1, giorno);
}
function festivi(anno) {
  const f = { "1-1": "Capodanno", "1-6": "Epifania", "4-25": "Festa della Liberazione", "5-1": "Festa del Lavoro", "6-2": "Festa della Repubblica", "8-15": "Ferragosto", "11-1": "Ognissanti", "12-8": "Immacolata Concezione", "12-25": "Natale", "12-26": "Santo Stefano" };
  const p = pasqua(anno), lp = new Date(anno, p.getMonth(), p.getDate() + 1);
  f[`${p.getMonth() + 1}-${p.getDate()}`] = "Pasqua"; f[`${lp.getMonth() + 1}-${lp.getDate()}`] = "Lunedì dell'Angelo";
  return f;
}
function costruisciCompila() {
  const oggi = new Date(), prox = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1);
  cal.mese = prox.getMonth() + 1; cal.anno = prox.getFullYear();
  $("datacomp").value = `${oggi.getFullYear()}-${pad2(oggi.getMonth() + 1)}-${pad2(oggi.getDate())}`;
  let h = "";
  for (let i = 1; i <= N_ORARI; i++)
    h += `<div class="og"><input id="og${i}g" type="date" aria-label="Giorno permesso orario ${i}"><input id="og${i}d" type="time" aria-label="Dalle"><input id="og${i}a" type="time" aria-label="Alle"></div>`;
  $("orari").innerHTML = h;
  document.querySelectorAll("#orari input").forEach((el) => el.addEventListener("change", totale));
  costruisciPersonaSel();
  caricaMeseDaArchivio();
}
function costruisciPersonaSel() {
  const ps = persone(), cur = personaCorrente();
  $("persona").innerHTML = ps.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}${p.parentela ? " (" + esc(p.parentela) + ")" : ""}</option>`).join("");
  if (cur) $("persona").value = cur.id;
  $("box-persona").style.display = ps.length > 1 ? "" : "none";
}
$("persona").addEventListener("change", () => { mem.set("m104_persona", $("persona").value); caricaMeseDaArchivio(); });
$("cal-prec").addEventListener("click", () => cambiaMese(-1));
$("cal-succ").addEventListener("click", () => cambiaMese(1));
function cambiaMese(dx) {
  const d = new Date(cal.anno, cal.mese - 1 + dx, 1); cal.mese = d.getMonth() + 1; cal.anno = d.getFullYear();
  caricaMeseDaArchivio();
}
// se il mese è già in archivio per questa persona, ripropone i giorni
function caricaMeseDaArchivio() {
  const p = personaCorrente(), r = p && registro(p.id, cal.anno, cal.mese);
  cal.sel = new Set(r && r.giorni ? r.giorni : []); cal.sel151 = new Set(r && r.g151 ? r.g151 : []);
  $("cal-err").hidden = true; $("cal-avv").hidden = true;
  disegnaCal();
  if (r) { $("cal-avv").hidden = false; $("cal-avv").textContent = r.nessuno ? "Per questo mese avevi già fatto il modulo «nessun permesso». Se ne crei uno nuovo, lo sostituisce." : "Questi sono i giorni già registrati per questo mese: se crei un nuovo modulo, li sostituisce."; }
}
function disegnaCal() {
  $("cal-mese").textContent = `${MESI[cal.mese - 1]} ${cal.anno}`;
  const a = anag(), blocco = a.bloccaWE !== false, fest = festivi(cal.anno), oggi = new Date();
  $("lg-we").textContent = blocco ? "Sab/Dom: bloccati" : "Sab/Dom: con avviso";
  const primo = new Date(cal.anno, cal.mese - 1, 1), vuoti = (primo.getDay() + 6) % 7, nGiorni = new Date(cal.anno, cal.mese, 0).getDate();
  const g = $("cal-griglia"); g.innerHTML = "";
  const turni = turniMese(), cur = personaCorrente(), altri = altri104(cal.anno, cal.mese, cur && cur.id);
  g.classList.toggle("turni-on", cal.modo === "turni");
  const tl = [...turni].sort((x, y) => x - y);
  const cosa = ha151() ? "104 e 151" : "i giorni 104";
  $("ps2").textContent = ha151() ? "2 · 104 e 151" : "2 · Giorni 104";
  $("b-avanti").textContent = tl.length ? `Avanti: scegli ${cosa} →` : "Nessun turno da segnare, vai avanti →";
  $("cal-turni").innerHTML = tl.length ? `<b>I tuoi turni:</b> ${tl.map((d) => `${NOMI_G[new Date(cal.anno, cal.mese - 1, d).getDay()].slice(0, 3)} ${d}`).join(" · ")}` : "";
  for (let i = 0; i < vuoti; i++) { const s = document.createElement("span"); s.className = "cal-g vuoto"; g.append(s); }
  for (let d = 1; d <= nGiorni; d++) {
    const dt = new Date(cal.anno, cal.mese - 1, d), wd = dt.getDay(), we = wd === 0 || wd === 6, fe = fest[`${cal.mese}-${d}`];
    const b = document.createElement("button"); b.type = "button";
    const tu = turni.has(d), sc = cal.modo !== "turni" && cal.sel.has(d), s5 = cal.modo !== "turni" && cal.sel151.has(d);
    const al = !sc && !s5 && cal.modo !== "turni" ? altri[d] : null;   // 104 di un'altra persona
    const premuto = cal.modo === "turni" ? tu : cal.modo === "151" ? s5 : sc;
    const et = sc ? etichetta104(cur) : s5 ? "151" : al ? al.et : tu ? "turno" : "";
    b.innerHTML = `<span class="cal-n">${d}</span>${et ? `<small class="cal-et${et.length > 5 ? " lungo" : ""}">${et}</small>` : ""}`;
    b.className = "cal-g" + (we ? " we" + (blocco ? " bloc" : "") : "") + (fe ? " fe" : "") + (sc ? ` sel t${tono104(cur && cur.id)}` : "") + (al ? ` sel altro t${al.tono}` : "") + (s5 ? " s151" : "") + (tu ? " tu" : "") + (dt.toDateString() === oggi.toDateString() ? " oggi" : "");
    b.setAttribute("aria-label", `${NOMI_G[wd]} ${d} ${MESI[cal.mese - 1]}${fe ? ", festivo" : ""}${tu ? ", turno di servizio" : ""}${sc ? ", scelto per la 104" : ""}${al ? `, 104 di ${al.nome}` : ""}${s5 ? ", scelto per la 151" : ""}`);
    b.setAttribute("aria-pressed", premuto ? "true" : "false");
    b.addEventListener("click", () => toccaGiorno(d));
    g.append(b);
  }
  totale();
}
// ---- più persone assistite: la 104 di ognuna ha la sua tonalità di rosso (scuro, chiaro, rosa)
function tono104(pid) { const i = persone().findIndex((p) => p.id === pid); return i < 0 ? 0 : Math.min(i, 2); }
function etichetta104(p) { return persone().length > 1 && p ? "104 " + (p.parentela || String(p.nome || "").split(" ").pop()) : "104"; }
// giorni 104 già registrati per le ALTRE persone in quel mese: { giorno: { et, tono, nome } }
function altri104(anno, mese, pidEscluso) {
  const out = {}; if (persone().length < 2) return out;
  for (const p of persone()) {
    if (p.id === pidEscluso) continue;
    const r = (archivio()[p.id] || {})[`${anno}-${pad2(mese)}`];
    if (r && !r.solo151 && !r.nessuno) for (const g of r.giorni || []) out[g] = { et: etichetta104(p), tono: tono104(p.id), nome: p.nome };
  }
  return out;
}
// ---- turni di servizio: si segnano sul calendario (valgono per tutte le persone assistite)
function chiaveMese() { return `${cal.anno}-${pad2(cal.mese)}`; }
function turniMese() { return new Set((mem.get("m104_turni", {})[chiaveMese()]) || []); }
function salvaTurni(set) {
  const t = mem.get("m104_turni", {}), k = chiaveMese();
  if (set.size) t[k] = [...set].sort((a, b) => a - b); else delete t[k];
  mem.set("m104_turni", t);
}
function modoCal(m) {
  if (m === "104" && nonChiedo && ha151()) m = "151";   // niente 104 questo mese: restano i giorni 151
  cal.modo = m;
  $("cal-titolo").textContent = m === "turni" ? "I tuoi turni di servizio" : m === "151" ? "Giorni di congedo 151" : "Giorni di permesso 104";
  $("cal-istr").innerHTML = m === "turni" ? "Tocca i giorni in cui monti il servizio. <b>Facoltativo</b>: se non ti serve, vai avanti."
    : m === "151" ? "Tocca i giorni di congedo 151 (blu). I giorni 104 restano rossi, i turni verdi."
    : "Tocca i giorni 104 che vuoi prendere (rossi, massimo 3 al mese). I tuoi turni sono quelli verdi.";
  $("sw-151").style.display = ha151() && !nonChiedo ? "" : "none";
  document.querySelectorAll(".solo-151").forEach((e) => (e.style.display = ha151() ? "" : "none"));
  for (const [id, v] of [["cal-m104", "104"], ["cal-m151", "151"]]) { $(id).classList.toggle("on", m === v); $(id).setAttribute("aria-checked", String(m === v)); }
  $("cal-err").hidden = true; $("cal-avv").hidden = true; disegnaCal();
}
$("cal-m104").addEventListener("click", () => modoCal("104"));
$("cal-m151").addEventListener("click", () => modoCal("151"));
// procedura guidata: 1 turni (facoltativo) -> 2 giorni 104 -> 3 PDF
function passo(n) {
  const s = $("s-compila"); s.classList.toggle("passo1", n === 1); s.classList.toggle("passo2", n === 2);
  $("ps1").className = n === 1 ? "on" : "fatto"; $("ps2").className = n === 2 ? "on" : ""; $("ps3").className = "";
  modoCal(n === 1 ? "turni" : "104");
  if (n === 2) totale();
  window.scrollTo(0, 0);
}
$("b-avanti").addEventListener("click", () => passo(2));
// fine della procedura: si esce e si riparte pulito la prossima volta
$("b-chiudi").addEventListener("click", () => {
  $("risultato").style.display = "none"; $("nomepdf151").style.display = $("anteprima151").style.display = "none";
  $("anteprima").innerHTML = ""; $("anteprima151").innerHTML = "";
  vai("s-home"); toast("Fatto ✔ Il mese è in Archivio");
});
$("b-torna-turni").addEventListener("click", () => passo(1));
function toccaGiorno(d) {
  const dt = new Date(cal.anno, cal.mese - 1, d), wd = dt.getDay(), we = wd === 0 || wd === 6, fe = festivi(cal.anno)[`${cal.mese}-${d}`];
  const err = $("cal-err"), avv = $("cal-avv"); err.hidden = true; avv.hidden = true;
  if (cal.modo === "turni") {
    const t = turniMese(); if (t.has(d)) t.delete(d); else t.add(d);
    salvaTurni(t); disegnaCal(); return;
  }
  const Gg = NOMI_G[wd][0].toUpperCase() + NOMI_G[wd].slice(1);
  const al = altri104(cal.anno, cal.mese, (personaCorrente() || {}).id)[d];
  if (al && !cal.sel.has(d) && !cal.sel151.has(d)) { err.hidden = false; err.textContent = `${Gg} ${d} è già un giorno di 104 per ${al.nome}: scegli un altro giorno.`; return; }
  if (cal.modo === "151") {
    if (cal.sel151.has(d)) { cal.sel151.delete(d); disegnaCal(); return; }
    if (cal.sel.has(d)) { err.hidden = false; err.textContent = `${Gg} ${d} è già un giorno 104: lo stesso giorno non può essere anche 151.`; return; }
    cal.sel151.add(d); disegnaCal();
    if (turniMese().has(d)) { avv.hidden = false; avv.textContent = `Attenzione: ${NOMI_G[wd]} ${d} è un tuo turno di servizio. Mettendo la 151 sul turno, quel giorno non vai al lavoro.`; }
    else if (we || fe) { avv.hidden = false; avv.textContent = `${Gg} ${d}: ${fe ? "festivo (" + fe + ")" : "fine settimana"}, conta come giorno di congedo.`; }
    return;
  }
  if (cal.sel151.has(d)) { err.hidden = false; err.textContent = `${Gg} ${d} è già un giorno 151: lo stesso giorno non può essere anche 104.`; return; }
  if (cal.sel.has(d)) { cal.sel.delete(d); disegnaCal(); return; }
  if (we && anag().bloccaWE !== false) {
    err.hidden = false; err.textContent = `${NOMI_G[wd][0].toUpperCase() + NOMI_G[wd].slice(1)} ${d}: sabato e domenica sono bloccati (puoi sbloccarli in Anagrafica → Impostazioni).`;
    return;
  }
  cal.sel.add(d); disegnaCal();
  if (turniMese().has(d)) { avv.hidden = false; avv.textContent = `Attenzione: ${NOMI_G[wd]} ${d} è un tuo turno di servizio. Mettendo la 104 sul turno, quel giorno non vai al lavoro.`; }
  else if (we) { avv.hidden = false; avv.textContent = `Attenzione: hai scelto ${NOMI_G[wd]} ${d}. È un fine settimana: controlla che sia corretto.`; }
  else if (fe) { avv.hidden = false; avv.textContent = `Attenzione: il ${d} ${MESI[cal.mese - 1].toLowerCase()} è festivo (${fe}).`; }
}
// giorni scelti -> periodi (i consecutivi si uniscono)
function periodiDa(giorni) {
  const g = [...giorni].sort((a, b) => a - b), out = [];
  for (const d of g) { const u = out[out.length - 1]; if (u && d === u[1] + 1) u[1] = d; else out.push([d, d]); }
  return out;
}
// legge una data "aaaa-mm-gg" del calendario
function dataDa(s) { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; }
let nonChiedo = false;
function impostaModo(no) {
  nonChiedo = no;
  $("modo-si").classList.toggle("on", !no); $("modo-no").classList.toggle("on", no);
  $("modo-si").setAttribute("aria-checked", String(!no)); $("modo-no").setAttribute("aria-checked", String(no));
  document.querySelectorAll("#s-compila .solo-si").forEach((e) => (e.style.display = no ? "none" : ""));
  document.querySelectorAll("#s-compila .solo-no").forEach((e) => (e.style.display = no ? "" : "none"));
  if (no && ha151()) $("card-cal").style.display = "";
  if (no) mostraMotivo();
  if ($("s-compila").classList.contains("passo2")) modoCal("104"); else totale();
}
// motivo: si vede in sola lettura; con la matita si modifica e si salva per le volte successive
function motivoSalvato() { return anag().motivo_def || MOTIVO_PREDEFINITO; }
function mostraMotivo() {
  $("motivo").value = motivoSalvato();
  $("motivo-testo").textContent = motivoSalvato();
  $("motivo-vista").style.display = "flex"; $("motivo-modifica").style.display = "none";
}
$("b-mod-motivo").addEventListener("click", () => {
  $("motivo").value = motivoSalvato();
  $("motivo-vista").style.display = "none"; $("motivo-modifica").style.display = "block";
  $("motivo").focus();
});
$("b-motivo-annulla").addEventListener("click", mostraMotivo);
$("b-motivo-salva").addEventListener("click", () => {
  const t = $("motivo").value.trim();
  if (!t) { toast("Scrivi il motivo"); return; }
  const a = mem.get("m104_anag", {}); a.motivo_def = t;
  if (mem.set("m104_anag", a)) { const campo = $("an-motivo_def"); if (campo) campo.value = t; mostraMotivo(); toast("Motivo salvato ✔ Lo ritroverai le prossime volte"); }
});
$("modo-si").addEventListener("click", () => impostaModo(false));
$("modo-no").addEventListener("click", () => impostaModo(true));
function leggiMese() {
  const mese = cal.mese, anno = cal.anno;
  const dc = $("datacomp").value;
  const data = dc ? dc.split("-").reverse().join("/") : fmt(new Date());
  const g151 = ha151() ? [...cal.sel151].sort((a, b) => a - b) : [];
  if (nonChiedo) return { mese, anno, daDate: false, periodi: [], orari: [], data, motivo: $("motivo").value.trim() || anag().motivo_def || MOTIVO_PREDEFINITO, giorni: [], g151 };
  const orari = [];
  for (let i = 1; i <= N_ORARI; i++) {
    const g = $(`og${i}g`).value; if (!g) continue;
    const d = dataDa(g);
    if (d.m !== mese || d.y !== anno) throw new Error(`Permesso orario ${i}: la data non è in ${MESI[mese - 1]} ${anno}`);
    orari.push([d.d, $(`og${i}d`).value, $(`og${i}a`).value]);
  }
  return { mese, anno, daDate: true, periodi: periodiDa(cal.sel), orari, data, motivo: "", giorni: [...cal.sel].sort((a, b) => a - b), g151 };
}
function calcolaValori(m) {
  const v = { mese: MESI[m.mese - 1], anno: String(m.anno), mese_anno: `${MESI[m.mese - 1]} ${m.anno}`, data_compilazione: m.data, motivo: m.motivo };
  let tot = 0;
  m.periodi.forEach(([a, b], k) => {
    tot += b - a + 1;
    v["dal" + (k + 1)] = fmt(new Date(m.anno, m.mese - 1, a));
    v["al" + (k + 1)] = fmt(new Date(m.anno, m.mese - 1, b));
  });
  if (tot) { v.giorni_lettere = NUMERI[tot] || String(tot); v.giorni_numero = String(tot); }
  m.orari.forEach(([g, d, a], k) => { v[`og${k + 1}_giorno`] = fmt(new Date(m.anno, m.mese - 1, g)); v[`og${k + 1}_dalle`] = d; v[`og${k + 1}_alle`] = a; });
  v._giorni = tot; v._orari = m.orari.length;
  const pezzi = [];
  for (let i = 1; i <= N_PERIODI; i++) if (v["dal" + i]) pezzi.push(v["dal" + i] === v["al" + i] ? v["dal" + i] : `dal ${v["dal" + i]} al ${v["al" + i]}`);
  for (let i = 1; i <= N_ORARI; i++) if (v[`og${i}_giorno`]) pezzi.push(`${v[`og${i}_giorno`]} dalle ${v[`og${i}_dalle`]} alle ${v[`og${i}_alle`]}`);
  v.periodi = pezzi.length ? pezzi.join(", ") : "nessun permesso";
  return v;
}
function totale() {
  const n = cal.sel.size, c = $("contatore");
  c.textContent = `${n} / 3 giorni`;
  c.className = "contatore solo-p2" + (n > 3 ? " oltre" : n === 3 ? " ok" : "");
  if (cal.modo === "151") { c.textContent = `151: ${cal.sel151.size} ${cal.sel151.size === 1 ? "giorno" : "giorni"}`; c.className = "contatore solo-p2 c151"; }
  if (n > 3 && cal.modo !== "turni") { $("cal-err").hidden = false; $("cal-err").textContent = `Hai superato il limite: ${n} giorni su 3. Togline ${n - 3}.`; }
  const p = periodiDa(cal.sel), mm = pad2(cal.mese);
  const p5 = ha151() ? periodiDa(cal.sel151) : [], max5 = ha151() ? M151.attuale().righe : 0;
  $("cal-periodi").innerHTML = (p.length ? "<b>Nel modulo 104:</b> " + p.map(([a, b]) => `dal ${pad2(a)}/${mm} al ${pad2(b)}/${mm}`).join(" · ") : "")
    + (p5.length ? `${p.length ? "<br>" : ""}<b style="color:#1e40af">Nel modulo 151 (${cal.sel151.size} ${cal.sel151.size === 1 ? "giorno" : "giorni"}):</b> ` + p5.map(([a, b]) => `dal ${pad2(a)}/${mm} al ${pad2(b)}/${mm}`).join(" · ") : "");
  if (p5.length > max5 && cal.modo !== "turni") { $("cal-err").hidden = false; $("cal-err").textContent = `Il tuo modulo 151 ha ${max5} righe: hai ${p5.length} periodi. Unisci qualche giorno o togline.`; }
  $("b-crea").disabled = (!nonChiedo && n > 3) || p5.length > max5;
}
function riempi(tpl, dati) { return String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (dati[k] !== undefined ? dati[k] : m)); }
function spuntata(regola, v) {
  return regola === "sempre" || (regola === "se_giorni" && v._giorni > 0) || (regola === "se_orari" && v._orari > 0) ||
    (regola === "se_nessuno" && !v._giorni && !v._orari);
}
function aggiornaAvvisi() {
  const a = anag(), firma = mem.get("m104_firma", null), msg = [];
  if (!pacchetto) msg.push("📄 Carica il <b>modulo da compilare</b> (file .m104).");
  if (!a.cognome) msg.push("👤 Inserisci i tuoi dati in <b>Anagrafica e firma</b>.");
  if (!firma) msg.push("✍️ Aggiungi la tua <b>firma</b> in Anagrafica e firma.");
  $("avvisi").style.display = msg.length ? "block" : "none";
  $("avvisi").innerHTML = "<p><b>Prima di iniziare:</b></p>" + msg.map((m) => `<p>${m}</p>`).join("");
  const gn = fissi().grado_nome;
  $("desc-anag").textContent = gn ? `${gn}${firma ? " · firma salvata" : " · manca la firma"}` : "Grado, nome, reparto, assistito e firma";
  const okA = !!(a.cognome && firma);
  $("stato-anag").textContent = okA ? "OK" : "Da fare";
  $("stato-anag").className = "shub__stato" + (okA ? "" : " shub__stato--no");
  $("desc-modulo").textContent = pacchetto ? `${pacchetto.nome} · preparato il ${pacchetto.creato}` : "Dal PC (.m104) o da un PDF del modulo";
  $("stato-modulo").textContent = pacchetto ? "OK" : "Da caricare";
  $("stato-modulo").className = "shub__stato" + (pacchetto ? "" : " shub__stato--no");
  const st = mem.get("m104_storico", []);
  $("storico").innerHTML = st.length
    ? st.slice(0, 12).map((s) => `<div class="shub__riga" style="cursor:default"><span class="shub__tondo"><svg class="sic"><use href="#i-elenco"/></svg></span><span class="shub__testo"><b>${esc(s.nome.replace(/\.pdf$/, ""))}</b><small>${esc(s.quando)} · ${esc(s.periodi)}</small></span></div>`).join("")
    : '<div class="shub__riga" style="cursor:default"><span class="shub__testo"><small>Nessun modulo creato per ora</small></span></div>';
}

// caratteri non disponibili nel font standard del PDF
function pulisciTesto(s, font) {
  let out = "";
  for (const ch of String(s)) { try { font.encodeText(ch); out += ch; } catch (e) { out += ({ "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-" }[ch] || "?"); } }
  return out;
}
function b64bytes(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

async function creaPdf(m, pacchetto = window.M104 && window.M104.attuale()) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const v = calcolaValori(m), f = fissi();
  const scen = v._giorni && v._orari ? "entrambi" : v._giorni ? "giorni" : v._orari ? "orari" : "nessuno";
  const doc = await PDFDocument.load(b64bytes(pacchetto.basi[scen] || pacchetto.basi.unico || pacchetto.basi.nessuno));
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const pagine = doc.getPages();
  const firma = mem.get("m104_firma", null);
  let firmaImg = null;
  if (firma) firmaImg = /^data:image\/jpe?g/.test(firma) ? await doc.embedJpg(b64bytes(firma.split(",")[1])) : await doc.embedPng(b64bytes(firma.split(",")[1]));
  const nero = rgb(0, 0, 0);
  // il motivo lungo continua sulle righe successive del modulo
  const righeMotivo = {};
  {
    const campiM = ["var:motivo", "var:motivo2", "var:motivo3"].map((k) => pacchetto.campi.find((c) => c.a === k)).filter(Boolean);
    const parole = String(v.motivo || "").split(/\s+/).filter(Boolean);
    campiM.forEach((c, i) => {
      const larg = (c.x2 > c.x ? c.x2 - c.x : 400) - 6, sz = c.size || 10; let riga = "";
      while (parole.length && (i === campiM.length - 1 || !riga || font.widthOfTextAtSize(pulisciTesto(riga + " " + parole[0], font), sz) <= larg)) riga = (riga + " " + parole.shift()).trim();
      righeMotivo[c.a] = riga;
    });
  }
  for (const c of pacchetto.campi) {
    if (c.regola && !spuntata(c.regola, v)) continue;
    const pg = pagine[(c.pag || 1) - 1]; if (!pg) continue;
    const H = pg.getHeight(), size = c.size || 10;
    const base = c.b ? H - c.b : H - (c.y + size * 0.86);   // linea di base del testo
    if (c.a === "firma") {
      if (!firmaImg) continue;
      // la firma "attraversa" la riga, senza salire sulla scritta "Il richiedente"
      const larg = c.y2 === c.y && c.x2 > c.x ? c.x2 - c.x : 140;
      let w = Math.min(larg * 0.9, 125), h = w * firmaImg.height / firmaImg.width;
      // se la riga sopra ("Il richiedente") è vicina, la firma si fa più piccola per non coprirla
      const hMax = c.sp ? Math.min(30, Math.max(16, c.sp + 3)) : 30;
      if (h > hMax) { h = hMax; w = h * firmaImg.width / firmaImg.height; }
      const cx = c.x + larg / 2;
      const giu = c.sp ? Math.max(0, 20 - c.sp) : 0;   // poco spazio sopra: la firma scende sotto la riga
      pg.drawImage(firmaImg, { x: cx - w / 2, y: base - 7 - giu, width: w, height: h });
      continue;
    }
    let val = "";
    if (/^var:motivo[23]?$/.test(c.a)) val = righeMotivo[c.a] || "";
    else if (c.a.startsWith("fisso:")) val = f[c.a.slice(6)] || "";
    else if (c.a.startsWith("var:")) val = v[c.a.slice(4)] || "";
    if (!val) continue;
    const testo = pulisciTesto(val, font);
    const largCampo = c.y2 === c.y && c.x2 > c.x ? c.x2 - c.x : 400;
    let sz = size;
    while (sz > 6 && font.widthOfTextAtSize(testo, sz) > largCampo - 2) sz -= 0.5;
    // nei campi con barre (date "__/__/__") copre le barre sopra la riga; le lineette restano come sottolineatura
    if (c.t && /[^_\s]/.test(c.t)) {
      const anno = /\d/.test(c.t);   // c'era un anno stampato: lo copre tutto
      pg.drawRectangle({ x: c.x + (anno ? -1 : 1), y: base - 0.4, width: Math.max(4, largCampo + (anno ? 1.5 : -1.5)), height: size * 1.0, color: rgb(1, 1, 1) });
    }
    pg.drawText(testo, { x: c.x + 3, y: base + 1, size: sz, font, color: nero });
  }
  // moduli preparati dal telefono: le caselle le spunta l'app
  for (const k of pacchetto.caselle || []) {
    if (!spuntata(k.regola, v)) continue;
    const pg = pagine[(k.pag || 1) - 1]; if (!pg) continue;
    pg.drawRectangle({ x: k.x + 1, y: pg.getHeight() - k.y - k.h + 1, width: Math.max(2, k.w - 2), height: Math.max(2, k.h - 2), color: nero });
  }
  doc.setTitle(`Modulo L.104 ${v.mese_anno}`);
  const bytes = await doc.save();
  const imp = impost(), dati = Object.assign({}, f, v);
  // con più persone assistite, il nome del file dice anche per chi è
  const perChi = persone().length > 1 && f.assistito && !imp.nomefile.includes("{assistito}") ? " - " + f.assistito : "";
  const nome = ((riempi(imp.nomefile, dati) + perChi).replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim() || "Modulo 104") + ".pdf";
  return { blob: new Blob([bytes], { type: "application/pdf" }), nome, oggetto: riempi(imp.oggetto, dati), testo: riempi(imp.testo, dati), periodi: v.periodi, valori: v };
}

$("b-crea").addEventListener("click", () => {
  const solo151 = ha151() && cal.sel151.size && !nonChiedo && !cal.sel.size && !leggiOrariPresenti();
  if (!pacchetto && !solo151) { toast("Prima carica il modulo da compilare"); vai("s-modulo"); return; }
  if (!anag().cognome) { toast("Prima compila l'anagrafica"); vai("s-anag"); return; }
  const persona = personaCorrente();
  if (!persona) { toast("Aggiungi la persona assistita in Anagrafica"); vai("s-anag"); return; }
  let m;
  try { m = leggiMese(); } catch (e) { toast(e.message, 5000); return; }
  if (!nonChiedo && !m.periodi.length && !m.orari.length && !m.g151.length) { toast("Tocca i giorni nel calendario, oppure scegli «Non chiedo permessi»", 5000); return; }
  if (!nonChiedo && cal.sel.size > 3) { toast("Massimo 3 giorni al mese: togline qualcuno"); return; }
  apriConferma(m, persona);
});
function leggiOrariPresenti() { for (let i = 1; i <= N_ORARI; i++) if ($(`og${i}g`).value) return true; return false; }
// finestra di conferma: elenco dei giorni con il nome del giorno, prima di creare il PDF
let daConfermare = null;
function apriConferma(m, persona) {
  daConfermare = m;
  const fest = festivi(m.anno), mm = pad2(m.mese), turniC = new Set(mem.get("m104_turni", {})[`${m.anno}-${mm}`] || []);
  const per = `per <b>${esc(persona.nome)}</b>${persona.parentela ? " (" + esc(persona.parentela) + ")" : ""}`;
  let h = "";
  if (nonChiedo) {
    $("cf-titolo").textContent = `${MESI[m.mese - 1]} ${m.anno}: nessun permesso`;
    h = `<p>Modulo ${per}: <b>non chiedi permessi</b> questo mese.</p><p class="muted">Motivo: «${esc(m.motivo)}»</p>`;
  } else {
    const n = m.giorni.length;
    $("cf-titolo").textContent = n ? `Hai selezionato ${n} ${n === 1 ? "giorno" : "giorni"}` : "Permessi orari";
    h = `<p>${MESI[m.mese - 1]} ${m.anno}, ${per}:</p><div class="cf-lista">` + m.giorni.map((d) => {
      const dt = new Date(m.anno, m.mese - 1, d), wd = dt.getDay(), avv = turniC.has(d) ? " (turno di servizio)" : wd === 0 || wd === 6 ? " (fine settimana)" : fest[`${m.mese}-${d}`] ? ` (${fest[`${m.mese}-${d}`]})` : "";
      return `<div><b class="${avv ? "avv" : ""}"><span style="text-transform:capitalize">${NOMI_G[wd]}</span>${avv}</b><span>${pad2(d)}/${mm}/${m.anno}</span></div>`;
    }).join("") + m.orari.map(([g, a, b]) => `<div><b style="text-transform:capitalize">${NOMI_G[new Date(m.anno, m.mese - 1, g).getDay()]} (orario)</b><span>${pad2(g)}/${mm} · ${esc(a)}-${esc(b)}</span></div>`).join("") + "</div>";
    if (m.periodi.length) h += `<p class="muted">Nel modulo: ${m.periodi.map(([a, b]) => `dal ${pad2(a)}/${mm}/${m.anno} al ${pad2(b)}/${mm}/${m.anno}`).join(" · ")}</p>`;
  }
  const fa104 = nonChiedo || m.periodi.length || m.orari.length;
  if (!fa104) { h = ""; $("cf-titolo").textContent = "Solo congedo 151"; }
  if (m.g151.length) {
    const gia = M151.giaFruiti(m.mese, m.anno), vuoto = !!anag().g151_vuoto;
    h += `<p style="margin-top:.6rem"><b style="color:#1e40af">Congedo 151: ${m.g151.length} ${m.g151.length === 1 ? "giorno" : "giorni"}</b></p><div class="cf-lista">` + m.g151.map((d) => {
      const wd = new Date(m.anno, m.mese - 1, d).getDay(), avv = turniC.has(d) ? " (turno di servizio)" : "";
      return `<div><b class="${avv ? "avv" : ""}"><span style="text-transform:capitalize">${NOMI_G[wd]}</span>${avv}</b><span>${pad2(d)}/${mm}/${m.anno}</span></div>`;
    }).join("") + `</div><p class="muted">Nel modulo 151: già fruiti ${vuoto ? "<b>lasciato vuoto</b>" : "<b>" + gia + "</b> giorni"} · ${periodiDa(m.g151).map(([a, b]) => `dal ${pad2(a)}/${mm} al ${pad2(b)}/${mm}`).join(" · ")}</p>`;
  }
  $("cf-si").textContent = fa104 && m.g151.length ? "Crea i 2 PDF" : "Crea PDF";
  if (!mem.get("m104_firma", null)) h += `<p class="err">Attenzione: non hai ancora salvato la firma, il PDF sarà senza firma.</p>`;
  $("cf-corpo").innerHTML = h;
  $("conferma").hidden = false;
}
$("cf-no").addEventListener("click", () => { $("conferma").hidden = true; daConfermare = null; });
$("cf-si").addEventListener("click", async () => {
  const m = daConfermare; $("conferma").hidden = true; daConfermare = null; if (!m) return;
  const b = $("b-crea"); b.disabled = true; b.textContent = "Creo il PDF…";
  try {
    const fa104 = nonChiedo || m.periodi.length || m.orari.length;
    const p104 = fa104 ? await creaPdf(m) : null, p151 = m.g151.length ? await M151.crea(m) : null;
    const f = fissi(), mesea = `${MESI[m.mese - 1]} ${m.anno}`;
    if (p104 && p151) ultimo = Object.assign({}, p104, { oggetto: `${p104.oggetto} + congedo 151 (${p151.periodi})`, testo: p104.testo.replace(/\n\nCordiali saluti/, `\n\nIn allegato anche la richiesta di congedo straordinario art. 42 D.Lgs. 151/2001 (${p151.periodi}).\n\nCordiali saluti`), extra: [p151] });
    else if (p104) ultimo = Object.assign({}, p104, { extra: [] });
    else ultimo = Object.assign({}, p151, { oggetto: `${f.grado_nome} - Congedo straordinario art. 42 D.Lgs. 151/2001 ${mesea} - ${p151.periodi}`,
      testo: `Buongiorno,\n\nin allegato la richiesta di congedo straordinario art. 42 D.Lgs. 151/2001 relativa al mese di ${mesea} (${p151.periodi}).\n\nCordiali saluti\n${f.grado_nome}`, extra: [] });
    registra(personaCorrente(), m);
    $("nomepdf").textContent = ultimo.nome + " · " + ultimo.periodi;
    $("risultato").style.display = "block"; $("ps2").className = "fatto"; $("ps3").className = "on";
    anteprima(ultimo.blob);
    const due = !!(p104 && p151);
    $("nomepdf151").style.display = $("anteprima151").style.display = due ? "" : "none";
    if (due) { $("nomepdf151").textContent = p151.nome + " · " + p151.periodi; anteprimaIn($("anteprima151"), p151.blob); }
    const st = mem.get("m104_storico", []);
    st.unshift({ nome: ultimo.nome, periodi: ultimo.periodi, quando: fmt(new Date()) });
    mem.set("m104_storico", st.slice(0, 30));
    aggiornaAvvisi();
    $("risultato").scrollIntoView({ behavior: "smooth" });
  } catch (e) { console.error(e); toast("Errore nella creazione del PDF: " + e.message, 6000); }
  b.disabled = false; b.textContent = "Crea PDF";
});

async function copia(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement("textarea"); ta.value = t; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e2) { /* niente */ } ta.remove(); return ok;
  }
}
async function inviaPdf(perEmail) {
  if (!ultimo) return;
  const file = new File([ultimo.blob], ultimo.nome, { type: "application/pdf" });
  const files = [file, ...(ultimo.extra || []).map((x) => new File([x.blob], x.nome, { type: "application/pdf" }))];
  if (perEmail) await copia(ultimo.oggetto);
  const dati = perEmail ? { files, title: ultimo.oggetto, text: ultimo.testo } : { files, title: ultimo.nome };
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share(dati); }
    catch (e) { if (e.name !== "AbortError") toast("Invio non riuscito: usa «Apri / salva PDF»"); }
  } else { toast("Questo browser non può allegare file: apro il PDF da salvare"); apriPdf(); }
}
$("b-invia").addEventListener("click", () => inviaPdf(true));
$("b-condividi-pdf").addEventListener("click", () => inviaPdf(false));
function apriPdf() {
  if (!ultimo) return;
  const url = URL.createObjectURL(ultimo.blob), a = document.createElement("a");
  a.href = url; a.download = ultimo.nome; a.target = "_blank"; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$("b-apri").addEventListener("click", apriPdf);
$("anteprima").addEventListener("click", apriPdf);
$("anteprima151").addEventListener("click", () => {
  const x = ultimo && (ultimo.extra || [])[0]; if (!x) return;
  const url = URL.createObjectURL(x.blob), a = document.createElement("a"); a.href = url; a.download = x.nome; a.target = "_blank"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
});
async function caricaPdfjs() {
  if (window.pdfjsLib) return;
  await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "lib/pdf.min.js"; s.onload = ok; s.onerror = ko; document.head.append(s); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
}
// mostra il PDF appena creato, così lo controlli prima di inviarlo
async function anteprima(blob) { return anteprimaIn($("anteprima"), blob); }
async function anteprimaIn(box, blob) {
  box.innerHTML = '<p class="muted">Preparo l’anteprima…</p>';
  try {
    await caricaPdfjs();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    box.innerHTML = "";
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n), base = pg.getViewport({ scale: 1 });
      const larg = box.clientWidth || 340, dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const vp = pg.getViewport({ scale: (larg / base.width) * dpr });
      const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
      box.append(cv);
      await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    }
  } catch (e) { console.error(e); box.innerHTML = '<p class="muted">Anteprima non disponibile: usa "Apri / salva PDF".</p>'; }
}
$("b-oggetto").addEventListener("click", async () => { if (ultimo && await copia(ultimo.oggetto)) toast("Oggetto copiato ✔"); });
$("b-gmail").addEventListener("click", () => {
  if (!ultimo) return;
  const imp = impost(), q = (s) => encodeURIComponent(s);
  const app = `googlegmail:///co?to=${q(imp.a)}&cc=${q(imp.cc)}&subject=${q(ultimo.oggetto)}&body=${q(ultimo.testo)}`;
  const web = `https://mail.google.com/mail/?view=cm&fs=1&to=${q(imp.a)}&cc=${q(imp.cc)}&su=${q(ultimo.oggetto)}&body=${q(ultimo.testo)}`;
  const t = Date.now();
  window.location.href = app;
  setTimeout(() => { if (Date.now() - t < 2500 && !document.hidden) window.open(web, "_blank"); }, 1200);
});

// ---------------------------------------------------------------- archivio
// per ogni persona: { "aaaa-mm": { giorni:[...], orari:[[g,dalle,alle]], nessuno, motivo, creato } }
function archivio() { return mem.get("m104_archivio", {}); }
function registro(pid, anno, mese) { const a = archivio(); return (a[pid] || {})[`${anno}-${pad2(mese)}`] || null; }
function registra(persona, m) {
  if (!persona) return;
  const a = archivio(); a[persona.id] = a[persona.id] || {};
  const k = `${m.anno}-${pad2(m.mese)}`, prima = a[persona.id][k];
  if (fa104Di(m)) a[persona.id][k] = { giorni: m.giorni || [], orari: m.orari || [], nessuno: !!nonChiedo, motivo: nonChiedo ? m.motivo : "", creato: fmt(new Date()), nome: persona.nome };
  // solo la 151: la parte 104 già registrata per questo mese resta com'era
  else a[persona.id][k] = prima && !prima.solo151 ? Object.assign({}, prima) : { giorni: [], orari: [], nessuno: false, motivo: "", creato: fmt(new Date()), nome: persona.nome, solo151: true };
  const e = a[persona.id][k];
  if (m.g151 && m.g151.length) e.g151 = m.g151; else delete e.g151;
  const tu = mem.get("m104_turni", {})[k];
  if (tu && tu.length) e.turni = tu;   // facoltativi: solo se segnati
  mem.set("m104_archivio", a);
}
const fa104Di = (m) => !!(nonChiedo || (m.periodi && m.periodi.length) || (m.orari && m.orari.length));
let arcAnno = new Date().getFullYear();
// turni del mese (facoltativi): quelli segnati sul calendario, oppure quelli salvati col modulo
function turniArchivio(r, anno, mese) { const t = mem.get("m104_turni", {})[`${anno}-${pad2(mese)}`]; return (t && t.length ? t : (r && r.turni) || []).slice().sort((x, y) => x - y); }
function disegnaArchivio() {
  const ps = persone(), a = archivio();
  // anche persone tolte dall'anagrafica ma con giorni in archivio
  const tutte = ps.slice(); for (const pid of Object.keys(a)) if (!tutte.find((p) => p.id === pid)) { const r = Object.values(a[pid])[0]; tutte.push({ id: pid, nome: (r && r.nome) || "Persona tolta", parentela: "" }); }
  const sel = $("arc-persona"), prima = sel.value || (personaCorrente() || {}).id;
  sel.innerHTML = tutte.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}${p.parentela ? " (" + esc(p.parentela) + ")" : ""}</option>`).join("");
  if (prima && tutte.find((p) => p.id === prima)) sel.value = prima;
  $("arc-persona-box").style.display = tutte.length > 1 ? "" : "none";
  const pid = sel.value, dati = a[pid] || {};
  const anni = new Set([new Date().getFullYear(), new Date().getFullYear() + 1, ...Object.keys(dati).map((k) => +k.slice(0, 4))]);
  $("arc-anni").innerHTML = [...anni].sort().map((y) => `<button class="pill${y === arcAnno ? " on" : ""}" data-anno="${y}">${y}</button>`).join("");
  $("arc-anni").querySelectorAll("[data-anno]").forEach((b) => b.addEventListener("click", () => { arcAnno = +b.dataset.anno; disegnaArchivio(); }));
  let tot = 0, comp = 0, t151 = 0;
  const gg = (i, ds) => ds.map((d) => `${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${pad2(d)}`).join(" · ");
  const riga = (cls, ico, titolo, testo, n, doc, mese) => `<div class="arc-riga ${cls}"><span class="arc-ico">${ico}</span><span class="arc-riga__c"><b class="arc-riga__t">${titolo}</b><span class="arc-riga__g">${testo}</span></span>
    <span class="arc-destra">${n ? `<span class="arc-n">${n}</span>` : ""}${doc ? `<span class="arc-mini"><button class="arc-mini__b" data-doc="${doc}" data-m="${mese}" data-az="stampa" aria-label="Stampa ${titolo}" title="Stampa"><svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg></button><button class="arc-mini__b" data-doc="${doc}" data-m="${mese}" data-az="condividi" aria-label="Condividi ${titolo}" title="Condividi"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></button></span>` : ""}</span></div>`;
  const vuoti = [], carte = [];
  MESI.forEach((nome, i) => {
    const r = dati[`${arcAnno}-${pad2(i + 1)}`], tu = turniArchivio(r, arcAnno, i + 1);
    if (!r && !tu.length) { vuoti.push(i); return; }
    let righe = "";
    if (r) comp++;
    if (r && r.nessuno) righe += riga("a-no", "—", "104: nessun permesso", `Motivo: «${esc(r.motivo)}»`, "", "104", i + 1);
    else if (r && !r.solo151 && (r.giorni.length || r.orari.length)) {
      tot += r.giorni.length;
      const or = r.orari.map(([g, x, y]) => `${pad2(g)} ${esc(x)}-${esc(y)}`).join(" · ");
      const pp = persone().find((x) => x.id === pid);
      righe += riga(tono104(pid) === 1 ? "a104 a104b" : tono104(pid) === 2 ? "a104 a104c" : "a104", "104", (persone().length > 1 && pp ? `Permessi ${etichetta104(pp)}` : "Permessi 104") + (r.var && r.var.length ? " (dopo la variazione)" : ""), [gg(i, r.giorni), or].filter(Boolean).join(" · ") , `${r.giorni.length}/3`, "104", i + 1);
    }
    if (r && r.var && r.var.length) r.var.forEach((x, k) => { righe += riga("avar", "🔁", `Variazione del ${esc(x.data)}`, esc(window.M104var ? M104var.descrivi(x) : ""), "", "var" + k, i + 1); });
    if (r && r.g151 && r.g151.length) { t151 += r.g151.length; righe += riga("a151", "151", "Congedo 151", gg(i, r.g151), `${r.g151.length} gg`, "151", i + 1); }
    if (tu.length) righe += riga("atu", "T", "Turni di servizio", tu.map((d) => `${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${d}`).join(" · "), String(tu.length), "turni", i + 1);
    if (!r) righe += `<small class="muted">Modulo non ancora creato.</small>`;
    carte.push(`<div class="arc-card"><div class="arc-card__testa"><b class="arc-card__mese">${nome}</b>${r ? `<span class="arc-card__data">creato il ${esc(r.creato)}</span><button class="arc-x" data-cancella="${arcAnno}-${pad2(i + 1)}" aria-label="Cancella ${nome} dall'archivio" title="Cancella">✕</button>` : ""}</div>
      ${righe}<div class="arc-azioni3${r && !r.solo151 ? " q4" : ""}">
        <button class="arc-az az-vedi" data-vedi="${i + 1}"><span class="arc-az__i"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></span>Visualizza</button>
        <button class="arc-az az-mod" data-apri="${i + 1}"><span class="arc-az__i"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span>${r ? "Modifica" : "Compila"}</button>
        ${r && !r.solo151 ? `<button class="arc-az az-var" data-var="${i + 1}"><span class="arc-az__i"><svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg></span>Variazione</button>` : ""}
        <button class="arc-az az-cond" data-condividi="${i + 1}"><span class="arc-az__i"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></span>Condividi</button>
      </div></div>`);
  });
  $("arc-mesi").innerHTML = carte.join("") + (vuoti.length ? `<div class="arc-card arc-vuoti"><b class="arc-card__mese" style="font-size:1rem">Da compilare</b>
    <div class="arc-pills">${vuoti.map((i) => `<button class="arc-pill" data-apri="${i + 1}">${MESI[i].slice(0, 3)}</button>`).join("")}</div>
    <small class="muted">Tocca un mese per compilarlo.</small></div>` : "");
  $("arc-mesi").querySelectorAll("[data-cancella]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Cancellare questo mese dall'archivio? Il PDF già inviato non cambia.")) return;
    const ar = archivio(); delete (ar[pid] || {})[b.dataset.cancella]; mem.set("m104_archivio", ar); disegnaArchivio();
  }));
  $("arc-mesi").querySelectorAll("[data-doc]").forEach((b) => b.addEventListener("click", () => docMese(pid, arcAnno, +b.dataset.m, b.dataset.doc, b.dataset.az, b)));
  $("arc-mesi").querySelectorAll("[data-var]").forEach((b) => b.addEventListener("click", () => M104var.apri(pid, arcAnno, +b.dataset.var)));
  $("arc-mesi").querySelectorAll("[data-vedi]").forEach((b) => b.addEventListener("click", () => apriVedi(pid, arcAnno, +b.dataset.vedi)));
  $("arc-mesi").querySelectorAll("[data-condividi]").forEach((b) => b.addEventListener("click", async () => { await preparaVedi(pid, arcAnno, +b.dataset.condividi); condividiVedi(); }));
  $("arc-tot").textContent = String(tot); $("arc-mesi-n").textContent = `${comp} / 12`;
  $("arc-mesi").querySelectorAll("[data-apri]").forEach((b) => b.addEventListener("click", () => apriMeseNelCalendario(pid, arcAnno, +b.dataset.apri)));
  const a5 = anag(), usa151 = ha151() || t151 || a5.g151_iniziali;
  $("arc-151").style.display = usa151 ? "" : "none";
  if (usa151) {
    const totF = M151.totaleFruito(), resta = Math.max(0, M151.MAX_GIORNI - totF);
    $("arc-151").innerHTML = `<h2 style="margin:0;color:#1e40af">Congedo 151</h2>
      <p style="margin:.2rem 0"><b>${t151}</b> giorni nel ${arcAnno} · totale fruito <b>${totF}</b> su ${M151.MAX_GIORNI} · restano <b>${resta}</b></p>
      <div class="c151-barra"><i style="width:${Math.min(100, (totF / M151.MAX_GIORNI) * 100).toFixed(1)}%"></i></div>
      <small class="muted">Il totale comprende i ${parseInt(a5.g151_iniziali, 10) || 0} giorni già fruiti prima dell'app (Anagrafica).</small>`;
  }
}
$("arc-persona").addEventListener("change", disegnaArchivio);
// ---- ristampa / condividi il singolo modulo di un mese (104, 151 o solo i turni)
async function docMese(pid, anno, mese, tipo, az, btn) {
  const r = (archivio()[pid] || {})[`${anno}-${pad2(mese)}`] || null;
  if (btn) btn.disabled = true;
  try {
    let out;
    if (tipo.startsWith("var")) { await M104var.documento(pid, anno, mese, +tipo.slice(3), az); return; }
    if (tipo === "turni") {
      const p = persone().find((x) => x.id === pid) || { nome: "" };
      const cv = M104vedi.disegna({ anno, mese, chi: "", richiedente: fissi(p).grado_nome + " · turni di servizio", p104: [], g151: [], turni: turniArchivio(r, anno, mese) });
      out = { blob: await M104vedi.blob(cv), nome: `Turni ${MESI[mese - 1]} ${anno}.png`, tipo: "image/png", titolo: `Turni ${MESI[mese - 1]} ${anno}` };
    } else if (tipo === "151") {
      if (!ha151()) { toast("Carica prima il Word della 151 in «Modulo da compilare»", 5000); return; }
      const x = await M151.crea({ mese, anno, g151: r.g151, data: r.creato });
      out = { blob: x.blob, nome: x.nome, tipo: "application/pdf", titolo: `Congedo 151 ${MESI[mese - 1]} ${anno}` };
    } else {
      if (!pacchetto) { toast("Prima carica il modulo da compilare"); return; }
      const pr = r.prog ? Object.assign({}, r, r.prog) : r;   // dopo una variazione si ristampa la programmazione originale
      const m = { mese, anno, daDate: !pr.nessuno, periodi: pr.nessuno ? [] : periodiDa(pr.giorni), orari: r.orari || [], data: r.creato, motivo: pr.nessuno ? pr.motivo : "", giorni: pr.giorni, g151: [] };
      const nessunoPrima = nonChiedo; nonChiedo = !!pr.nessuno;
      const prima = mem.get("m104_persona", null); mem.set("m104_persona", pid);   // il modulo è per la persona di questo archivio
      try { const x = await creaPdf(m); out = { blob: x.blob, nome: x.nome, tipo: "application/pdf", titolo: x.oggetto, testo: x.testo }; }
      finally { mem.set("m104_persona", prima); nonChiedo = nessunoPrima; }
    }
    const file = new File([out.blob], out.nome, { type: out.tipo });
    if (az === "condividi" && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: out.titolo }); } catch (e) { if (e.name !== "AbortError") toast("Condivisione non riuscita"); }
      return;
    }
    // stampa: si apre il file, da lì «Stampa» (o Condividi → Stampa su iPhone)
    const url = URL.createObjectURL(out.blob), a = document.createElement("a");
    a.href = url; a.target = "_blank"; if (az !== "stampa") a.download = out.nome; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    if (az === "stampa") toast("Si apre il file: da lì scegli Stampa");
  } catch (e) { console.error(e); toast("Errore: " + e.message, 5000); }
  finally { if (btn) btn.disabled = false; }
}
// ---- visualizza / condividi un mese
let vediCorrente = null;   // { pid, anno, mese, blob, nome, titolo }
async function preparaVedi(pid, anno, mese) {
  const k = `${anno}-${pad2(mese)}`, ar = archivio(), r = (ar[pid] || {})[k] || null;
  const p = persone().find((x) => x.id === pid) || { nome: (r && r.nome) || "", parentela: "" };
  // il planning del mese mette insieme tutte le persone assistite (104 in rosso scuro / chiaro)
  const tutte = persone().length ? persone() : [p], p104 = [], nessuni = [], g151 = new Set();
  let turniR = null;
  for (const q of tutte) {
    const rq = (ar[q.id] || {})[k]; if (!rq) continue;
    turniR = turniR || rq;
    (rq.g151 || []).forEach((g) => g151.add(g));
    if (rq.nessuno) nessuni.push({ et: etichetta104(q), motivo: rq.motivo });
    else if (!rq.solo151 && ((rq.giorni || []).length || (rq.orari || []).length)) p104.push({ giorni: rq.giorni || [], orari: rq.orari || [], et: etichetta104(q), tono: tono104(q.id) });
  }
  const d = { anno, mese, richiedente: fissi(p).grado_nome, p104, nessuni, g151: [...g151], turni: turniArchivio(turniR || r, anno, mese) };
  d.giorni = p104.flatMap((x) => x.giorni);
  const cv = M104vedi.disegna(d), blob = await M104vedi.blob(cv);
  const titolo = `${MESI[mese - 1]} ${anno}`;
  vediCorrente = { pid, anno, mese, blob, titolo, url: cv.toDataURL("image/png"),
    nome: `Planning ${titolo} - ${anag().cognome || ""}`.replace(/[<>:"/\|?*]/g, "-") + ".png",
    testo: `${titolo} · ${d.richiedente}` + p104.map((x) => `\n${x.et}: ${[...x.giorni].sort((a, b) => a - b).map((g) => pad2(g)).join(", ")}`).join("") + (false ? `
104: ${d.giorni.map((g) => pad2(g)).join(", ")}` : "") + (d.g151.length ? `
151: ${d.g151.map((g) => pad2(g)).join(", ")}` : "") + (d.turni.length ? `
Turni: ${d.turni.join(", ")}` : "") };
  return vediCorrente;
}
async function apriVedi(pid, anno, mese) {
  const v = await preparaVedi(pid, anno, mese);
  $("vedi-titolo").textContent = v.titolo;
  $("vedi-img").innerHTML = `<img alt="Calendario di ${esc(v.titolo)}" src="${v.url}">`;
  vai("s-vedi");
}
async function condividiVedi() {
  const v = vediCorrente; if (!v) return;
  const file = new File([v.blob], v.nome, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: v.titolo, text: v.testo }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = v.url; a.download = v.nome; document.body.append(a); a.click(); a.remove();
  toast("Immagine del calendario salvata");
}
$("b-vedi-modifica").addEventListener("click", () => { const v = vediCorrente; if (v) apriMeseNelCalendario(v.pid, v.anno, v.mese); });
$("b-vedi-condividi").addEventListener("click", condividiVedi);
let apriPasso2 = false;
function apriMeseNelCalendario(pid, anno, mese) {
  if (persone().find((p) => p.id === pid)) mem.set("m104_persona", pid);
  cal.anno = anno; cal.mese = mese; apriPasso2 = true;
  vai("s-compila");
}
// riepilogo dell'anno in PDF
$("b-arc-pdf").addEventListener("click", async () => {
  const pid = $("arc-persona").value, dati = archivio()[pid] || {}, opt = $("arc-persona").selectedOptions[0];
  const chi = opt ? opt.textContent : "";
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create(), pg = doc.addPage([595.28, 841.89]);
  const f = await doc.embedFont(StandardFonts.TimesRoman), fb = await doc.embedFont(StandardFonts.TimesRomanBold);
  const blu = rgb(0.11, 0.37, 0.77), grigio = rgb(0.35, 0.4, 0.47), nero = rgb(0, 0, 0);
  const t = (s, x, y, o = {}) => pg.drawText(pulisciTesto(String(s), o.font || f), { x, y, size: o.size || 11, font: o.font || f, color: o.color || nero });
  const fi = fissi();
  t("Riepilogo permessi L.104/92", 56, 790, { font: fb, size: 18, color: blu });
  t(`Anno ${arcAnno}`, 56, 768, { font: fb, size: 13 });
  t(`Richiedente: ${fi.grado_nome}`, 56, 748); t(`Persona assistita: ${chi}`, 56, 732);
  let y = 700;
  pg.drawRectangle({ x: 56, y: y - 4, width: 483, height: 20, color: rgb(0.92, 0.94, 0.98) });
  t("Mese", 62, y + 2, { font: fb }); t("Giorni", 150, y + 2, { font: fb }); t("Dettaglio", 205, y + 2, { font: fb });
  y -= 22; let tot = 0, tot151 = 0;
  MESI.forEach((nome, i) => {
    const r = dati[`${arcAnno}-${pad2(i + 1)}`];
    let n = "-", det = "non compilato";
    if (r && r.nessuno) { n = "0"; det = "nessun permesso richiesto"; }
    else if (r) {
      n = String(r.giorni.length); tot += r.giorni.length;
      det = r.giorni.map((d) => `${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${pad2(d)}/${pad2(i + 1)}`).join(", ") + (r.orari.length ? (r.giorni.length ? "; " : "") + r.orari.map(([g, a, b]) => `${pad2(g)}/${pad2(i + 1)} ${a}-${b}`).join(", ") : "");
    }
    if (r && r.solo151) { n = "-"; det = ""; }
    if (r && r.g151 && r.g151.length) { tot151 += r.g151.length; det += (det ? "; " : "") + "151: " + r.g151.map((d) => `${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${pad2(d)}/${pad2(i + 1)}`).join(", "); }
    t(nome, 62, y); t(n, 165, y); t(det, 205, y, { size: 10, color: r ? nero : grigio });
    const tu = turniArchivio(r, arcAnno, i + 1), extra = tu.length ? 12 : 0;
    if (extra) t("Turni: " + tu.map((d) => `${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${d}`).join(", "), 205, y - 12, { size: 8.5, color: rgb(0.06, 0.45, 0.36) });
    pg.drawLine({ start: { x: 56, y: y - 6 - extra }, end: { x: 539, y: y - 6 - extra }, thickness: 0.4, color: rgb(0.8, 0.83, 0.88) });
    y -= 24 + extra;
  });
  t(`Totale giorni 104 nell'anno: ${tot}`, 56, y - 6, { font: fb, size: 12 });
  if (tot151 || ha151()) t(`Congedo 151 nell'anno: ${tot151} giorni · totale fruito ${M151.totaleFruito()} su ${M151.MAX_GIORNI}`, 56, y - 22, { font: fb, size: 11, color: rgb(0.36, 0.13, 0.71) });
  t(`Documento generato il ${fmt(new Date())} con l'app Modulo 104 (promemoria personale, non sostituisce il modulo ufficiale).`, 56, 60, { size: 8, color: grigio });
  const bytes = await doc.save(), nomeFile = `Riepilogo permessi 104 ${arcAnno} - ${chi.replace(/[<>:"/\\|?*]/g, "-")}.pdf`;
  const file = new File([bytes], nomeFile, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: nomeFile }); return; } catch (e) { if (e.name === "AbortError") return; } }
  const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = nomeFile; a.target = "_blank"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
});

// ---------------------------------------------------------------- modulo 151 (facoltativo)
function mostra151() {
  const M = window.M151 && M151.attuale();
  $("stato-151").className = "stato-mod " + (M ? "ok" : "attesa");
  $("stato-151").innerHTML = M ? `✔ <b>Modulo 151 caricato</b><br>«${esc(M.nome)}» · caricato il ${esc(M.caricato)} · ${M.righe} righe per i periodi${M.tot ? "" : " · <b>non trovo la riga «già fruito di numero giorni»</b>"}`
    : "Nessun modulo 151: se non usi il congedo 151 lascia così.";
  $("b-vedi-151").style.display = $("b-togli-151").style.display = M ? "" : "none";
  $("anteprima-151").style.display = "none";
}
function pronto151() { mostra151(); if ($("s-compila").classList.contains("on")) modoCal(cal.modo); }
$("file-151").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  try { await M151.salva(file); toast("Modulo 151 caricato ✔"); mostra151(); $("b-vedi-151").click(); }
  catch (err) { toast(err.message, 6000); }
});
$("b-vedi-151").addEventListener("click", async () => {
  const box = $("anteprima-151"); box.style.display = ""; box.innerHTML = '<p class="muted">Preparo l’anteprima…</p>';
  try {
    const o = new Date(), r = await M151.crea({ mese: cal.mese || o.getMonth() + 1, anno: cal.anno || o.getFullYear(), g151: [], data: fmt(o) });
    anteprimaIn(box, r.blob);
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
});
$("b-togli-151").addEventListener("click", async () => {
  if (!confirm("Togliere il modulo 151? I giorni 151 in archivio restano salvati.")) return;
  await M151.togli(); mostra151(); toast("Modulo 151 tolto");
});

// ---------------------------------------------------------------- avvio
costruisciAnag(); costruisciImpost(); costruisciCompila();
caricaPacchetto().then(() => mostra(location.hash ? "s-" + location.hash.slice(1) : "s-home"));
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
// salva un modulo nel suo posto (master o tuo) senza toccare l'altro
async function salvaModulo(k, j, usa) {
  moduli[k] = j; await idbSet(k, j);
  if (usa || !moduli.uso) { moduli.uso = k; await idbSet("uso", k); }
  pacchetto = moduli[moduli.uso]; infoModulo(); aggiornaAvvisi();
}
async function salvaPacchetto(j) { await salvaModulo(j.origine === "telefono" ? "tuo" : "master", j, true); }
async function usaModulo(k) { if (!moduli[k]) return; moduli.uso = k; await idbSet("uso", k); pacchetto = moduli[k]; infoModulo(); aggiornaAvvisi(); toast(k === "master" ? "Ora usi il modulo master" : "Ora usi il modulo caricato da te"); }
// l'app si aggiorna da sola quando pubblico una nuova versione
if ("serviceWorker" in navigator) {
  let ricaricata = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!ricaricata) { ricaricata = true; location.reload(); } });
  navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
}
window.M104 = { creaPdf, calcolaValori, leggiMese, salvaPacchetto, toast, vai, anteprima, tipoFile, confermaSostituzione, apriWord, vediModulo, condividiApp, attuale: () => pacchetto };

// ---------------------------------------------------------------- condivisione e installazione
const LINK_APP = location.origin + location.pathname.replace(/index\.html$/, "");
const TESTO_INVITO = "Ti mando Modulo 104, l'app che ho ideato per semplificare la vita a chi usufruisce della 104 e non sempre riesce a collegarsi. " +
  "Ti aiuta a programmare non solo i giorni di 104 ma anche i tuoi turni, crea il modulo pronto con la firma e lo tiene in archivio. " +
  "Gratis, e i tuoi dati restano solo sul tuo telefono.\n\nApri il link qui sotto e aggiungila alla schermata Home.";
const FIRMA_INVITO = "Modulo 104 – ideata da Mario Capasso";
async function condividiApp(conModulo, link = LINK_APP, nota = "") {
  const testo = `${TESTO_INVITO}\n${link}${nota ? "\n\n" + nota : ""}\n\n${FIRMA_INVITO}`;
  if (conModulo) {
    if (!pacchetto) { toast("Prima carica il modulo da compilare"); vai("s-modulo"); return; }
    const nomeFile = `Modulo104 - ${String(pacchetto.nome || "modulo").replace(/[<>:"/\|?*]/g, "-")}.m104`;
    const file = new File([JSON.stringify(pacchetto)], nomeFile, { type: "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Modulo 104", text: testo + "\n\nIn allegato il file del modulo: salvalo e caricalo nell'app, alla voce «Modulo da compilare»." });
        return;
      } catch (e) { if (e.name === "AbortError") return; }
    }
    // il telefono non può condividere file: lo scarica, poi si condivide il link
    const url = URL.createObjectURL(file), a = document.createElement("a");
    a.href = url; a.download = nomeFile; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast("File del modulo salvato: allegalo tu al messaggio");
  }
  if (navigator.share) {
    try { await navigator.share({ title: "Modulo 104", text: TESTO_INVITO + (nota ? "\n" + nota : "") + "\n\n" + FIRMA_INVITO, url: link }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  if (await copia(testo)) toast("Link copiato ✔ Incollalo in WhatsApp, email o SMS");
}
// la condivisione passa dall'invito personale (solo amministratore)
$("b-condividi").addEventListener("click", () => window.M104acc.apriInvito(false));
$("b-condividi-testa").addEventListener("click", () => window.M104acc.apriInvito(false));

const installata = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ua = navigator.userAgent;
const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const browserInterno = /FBAN|FBAV|Instagram|Line\/|GSA\/|WhatsApp|Telegram/i.test(ua);
const iOSnonSafari = iOS && (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) || browserInterno || !/Safari/.test(ua));
let promptInstalla = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptInstalla = e; mostraInstalla(); });
window.addEventListener("appinstalled", () => { $("installa").style.display = "none"; toast("App installata ✔ La trovi nella schermata Home"); });

function mostraInstalla() {
  const box = $("installa");
  if (installata || mem.get("m104_no_installa", false)) { box.style.display = "none"; return; }
  let h = '<h2>📲 Installa l\'app sul telefono</h2><p class="muted">Così avrai l\'icona "Modulo 104" nella schermata Home e funzionerà anche senza internet.</p>';
  if (iOS && iOSnonSafari) {
    h += `<ol><li>Questa pagina è aperta dentro un'altra app. Tocca <b>⋯</b> o <b>⬆️</b> e scegli <b>"Apri in Safari"</b>.</li>
      <li>Oppure copia il link e incollalo in Safari: <button class="btn sec" id="b-copia-link" style="margin-top:6px">Copia il link</button></li>
      <li>In Safari segui le istruzioni che compariranno.</li></ol>`;
  } else if (iOS) {
    h += `<ol><li>Tocca il pulsante <span class="ico-share">⬆️ Condividi</span> in basso (o in alto) in Safari.</li>
      <li>Scorri e tocca <b>"Aggiungi alla schermata Home"</b> ➕.</li>
      <li>Tocca <b>"Aggiungi"</b> in alto a destra. Fatto: apri l'app dall'icona.</li></ol>`;
  } else if (promptInstalla) {
    h += '<button class="btn" id="b-installa">Installa l\'app</button>';
  } else {
    h += `<ol><li>Tocca il menu <b>⋮</b> in alto a destra di Chrome.</li>
      <li>Tocca <b>"Installa app"</b> oppure <b>"Aggiungi a schermata Home"</b>.</li>
      <li>Conferma: l'icona compare nella schermata Home.</li></ol>`;
  }
  h += '<p class="muted">Ti hanno mandato anche un file .m104? Salvalo (su iPhone in "File") e caricalo in <b>Modulo da compilare</b>.</p>';
  h += '<button class="btn sec" id="b-no-installa">Più tardi</button>';
  box.innerHTML = h;
  box.style.display = "block";
  $("b-no-installa").addEventListener("click", () => { mem.set("m104_no_installa", true); box.style.display = "none"; });
  $("b-installa")?.addEventListener("click", async () => { promptInstalla.prompt(); await promptInstalla.userChoice; promptInstalla = null; mostraInstalla(); });
  $("b-copia-link")?.addEventListener("click", async () => { if (await copia(LINK_APP)) toast("Link copiato ✔ Incollalo in Safari"); });
}
mostraInstalla();
