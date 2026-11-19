/* Modulo 104 - app telefono. Tutti i dati restano nel telefono (localStorage / IndexedDB). */
"use strict";
const VERSIONE = "3.9";
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
  if (id === "s-compila") { costruisciPersonaSel(); passo(1); }
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
let cal = { mese: 0, anno: 0, sel: new Set(), modo: "104" };
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
  cal.sel = new Set(r && r.giorni ? r.giorni : []);
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
  const turni = turniMese();
  g.classList.toggle("turni-on", cal.modo === "turni");
  const tl = [...turni].sort((x, y) => x - y);
  $("b-avanti").textContent = tl.length ? `Avanti: scegli i giorni 104 →` : "Nessun turno da segnare, vai avanti →";
  $("cal-turni").innerHTML = tl.length ? `<b>I tuoi turni:</b> ${tl.map((d) => `${NOMI_G[new Date(cal.anno, cal.mese - 1, d).getDay()].slice(0, 3)} ${d}`).join(" · ")}` : "";
  for (let i = 0; i < vuoti; i++) { const s = document.createElement("span"); s.className = "cal-g vuoto"; g.append(s); }
  for (let d = 1; d <= nGiorni; d++) {
    const dt = new Date(cal.anno, cal.mese - 1, d), wd = dt.getDay(), we = wd === 0 || wd === 6, fe = fest[`${cal.mese}-${d}`];
    const b = document.createElement("button"); b.type = "button"; b.textContent = d;
    const tu = turni.has(d), sc = cal.modo !== "turni" && cal.sel.has(d), premuto = cal.modo === "turni" ? tu : sc;
    b.className = "cal-g" + (we ? " we" + (blocco ? " bloc" : "") : "") + (fe ? " fe" : "") + (sc ? " sel" : "") + (tu ? " tu" : "") + (dt.toDateString() === oggi.toDateString() ? " oggi" : "");
    b.setAttribute("aria-label", `${NOMI_G[wd]} ${d} ${MESI[cal.mese - 1]}${fe ? ", festivo" : ""}${tu ? ", turno di servizio" : ""}${cal.sel.has(d) ? ", scelto per la 104" : ""}`);
    b.setAttribute("aria-pressed", premuto ? "true" : "false");
    b.addEventListener("click", () => toccaGiorno(d));
    g.append(b);
  }
  totale();
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
  cal.modo = m;
  $("cal-titolo").textContent = m === "turni" ? "I tuoi turni di servizio" : "Giorni di permesso 104";
  $("cal-istr").innerHTML = m === "turni" ? "Tocca i giorni in cui monti il servizio. <b>Facoltativo</b>: se non ti serve, vai avanti." : "Tocca i giorni che vuoi prendere (massimo 3 al mese). I tuoi turni sono quelli in rilievo.";
  $("cal-err").hidden = true; $("cal-avv").hidden = true; disegnaCal();
}
// procedura guidata: 1 turni (facoltativo) -> 2 giorni 104 -> 3 PDF
function passo(n) {
  const s = $("s-compila"); s.classList.toggle("passo1", n === 1); s.classList.toggle("passo2", n === 2);
  $("ps1").className = n === 1 ? "on" : "fatto"; $("ps2").className = n === 2 ? "on" : ""; $("ps3").className = "";
  modoCal(n === 1 ? "turni" : "104");
  if (n === 2) totale();
  window.scrollTo(0, 0);
}
$("b-avanti").addEventListener("click", () => passo(2));
$("b-torna-turni").addEventListener("click", () => passo(1));
function toccaGiorno(d) {
  const dt = new Date(cal.anno, cal.mese - 1, d), wd = dt.getDay(), we = wd === 0 || wd === 6, fe = festivi(cal.anno)[`${cal.mese}-${d}`];
  const err = $("cal-err"), avv = $("cal-avv"); err.hidden = true; avv.hidden = true;
  if (cal.modo === "turni") {
    const t = turniMese(); if (t.has(d)) t.delete(d); else t.add(d);
    salvaTurni(t); disegnaCal(); return;
  }
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
  if (no) mostraMotivo();
  totale();
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
  if (nonChiedo) return { mese, anno, daDate: false, periodi: [], orari: [], data, motivo: $("motivo").value.trim() || anag().motivo_def || MOTIVO_PREDEFINITO };
  const orari = [];
  for (let i = 1; i <= N_ORARI; i++) {
    const g = $(`og${i}g`).value; if (!g) continue;
    const d = dataDa(g);
    if (d.m !== mese || d.y !== anno) throw new Error(`Permesso orario ${i}: la data non è in ${MESI[mese - 1]} ${anno}`);
    orari.push([d.d, $(`og${i}d`).value, $(`og${i}a`).value]);
  }
  return { mese, anno, daDate: true, periodi: periodiDa(cal.sel), orari, data, motivo: "", giorni: [...cal.sel].sort((a, b) => a - b) };
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
  if (n > 3 && cal.modo !== "turni") { $("cal-err").hidden = false; $("cal-err").textContent = `Hai superato il limite: ${n} giorni su 3. Togline ${n - 3}.`; }
  const p = periodiDa(cal.sel), mm = pad2(cal.mese);
  $("cal-periodi").innerHTML = p.length ? "<b>Nel modulo:</b> " + p.map(([a, b]) => `dal ${pad2(a)}/${mm} al ${pad2(b)}/${mm}`).join(" · ") : "";
  $("b-crea").disabled = !nonChiedo && n > 3;
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
  if (!pacchetto) { toast("Prima carica il modulo da compilare"); vai("s-modulo"); return; }
  if (!anag().cognome) { toast("Prima compila l'anagrafica"); vai("s-anag"); return; }
  const persona = personaCorrente();
  if (!persona) { toast("Aggiungi la persona assistita in Anagrafica"); vai("s-anag"); return; }
  let m;
  try { m = leggiMese(); } catch (e) { toast(e.message, 5000); return; }
  if (!nonChiedo && !m.periodi.length && !m.orari.length) { toast("Tocca i giorni nel calendario, oppure scegli «Non chiedo permessi»", 5000); return; }
  if (!nonChiedo && cal.sel.size > 3) { toast("Massimo 3 giorni al mese: togline qualcuno"); return; }
  apriConferma(m, persona);
});
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
  if (!mem.get("m104_firma", null)) h += `<p class="err">Attenzione: non hai ancora salvato la firma, il PDF sarà senza firma.</p>`;
  $("cf-corpo").innerHTML = h;
  $("conferma").hidden = false;
}
$("cf-no").addEventListener("click", () => { $("conferma").hidden = true; daConfermare = null; });
$("cf-si").addEventListener("click", async () => {
  const m = daConfermare; $("conferma").hidden = true; daConfermare = null; if (!m) return;
  const b = $("b-crea"); b.disabled = true; b.textContent = "Creo il PDF…";
  try {
    ultimo = await creaPdf(m);
    registra(personaCorrente(), m);
    $("nomepdf").textContent = ultimo.nome + " · " + ultimo.periodi;
    $("risultato").style.display = "block"; $("ps2").className = "fatto"; $("ps3").className = "on";
    anteprima(ultimo.blob);
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
  if (perEmail) await copia(ultimo.oggetto);
  const dati = perEmail ? { files: [file], title: ultimo.oggetto, text: ultimo.testo } : { files: [file], title: ultimo.nome };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
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
  a[persona.id][`${m.anno}-${pad2(m.mese)}`] = { giorni: m.giorni || [], orari: m.orari || [], nessuno: !!nonChiedo, motivo: nonChiedo ? m.motivo : "", creato: fmt(new Date()), nome: persona.nome };
  const tu = mem.get("m104_turni", {})[`${m.anno}-${pad2(m.mese)}`];
  if (tu && tu.length) a[persona.id][`${m.anno}-${pad2(m.mese)}`].turni = tu;   // facoltativi: solo se segnati
  mem.set("m104_archivio", a);
}
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
  let tot = 0, comp = 0;
  $("arc-mesi").innerHTML = MESI.map((nome, i) => {
    const r = dati[`${arcAnno}-${pad2(i + 1)}`];
    let badge = '<span class="badge vuoto">Non compilato</span>', corpo = "";
    if (r && r.nessuno) { comp++; badge = '<span class="badge no">Nessun permesso</span>'; corpo = `<small class="muted">Motivo: «${esc(r.motivo)}»</small>`; }
    else if (r) {
      comp++; tot += r.giorni.length;
      badge = `<span class="badge${r.giorni.length === 3 ? " ok" : ""}">${r.giorni.length} / 3 giorni</span>`;
      corpo = `<div class="chips">${r.giorni.map((d) => `<span class="chip">${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${pad2(d)}/${pad2(i + 1)}</span>`).join("")}${r.orari.map(([g, x, y]) => `<span class="chip">${pad2(g)}/${pad2(i + 1)} ${esc(x)}-${esc(y)}</span>`).join("")}</div>`;
    }
    const tu = turniArchivio(r, arcAnno, i + 1);
    if (tu.length) corpo += `<small class="arc-turni"><b>Turni:</b> ${tu.map((d) => `${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${d}`).join(" · ")}</small>`;
    const cancella = r ? `<button class="shub__azione" data-cancella="${arcAnno}-${pad2(i + 1)}" aria-label="Cancella ${nome} dall'archivio" title="Cancella">✕</button>` : "";
    return `<div class="arc-mese"><div class="arc-testa"><b>${nome}</b><span style="display:flex;gap:6px;align-items:center">${badge}${cancella}</span></div>${corpo}${r ? `<small class="muted">Modulo creato il ${esc(r.creato)}</small>` : ""}</div>`;
  }).join("");
  $("arc-mesi").querySelectorAll("[data-cancella]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Cancellare questo mese dall'archivio? Il PDF già inviato non cambia.")) return;
    const ar = archivio(); delete (ar[pid] || {})[b.dataset.cancella]; mem.set("m104_archivio", ar); disegnaArchivio();
  }));
  $("arc-tot").textContent = String(tot); $("arc-mesi-n").textContent = `${comp} / 12`;
}
$("arc-persona").addEventListener("change", disegnaArchivio);
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
  y -= 22; let tot = 0;
  MESI.forEach((nome, i) => {
    const r = dati[`${arcAnno}-${pad2(i + 1)}`];
    let n = "-", det = "non compilato";
    if (r && r.nessuno) { n = "0"; det = "nessun permesso richiesto"; }
    else if (r) {
      n = String(r.giorni.length); tot += r.giorni.length;
      det = r.giorni.map((d) => `${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${pad2(d)}/${pad2(i + 1)}`).join(", ") + (r.orari.length ? (r.giorni.length ? "; " : "") + r.orari.map(([g, a, b]) => `${pad2(g)}/${pad2(i + 1)} ${a}-${b}`).join(", ") : "");
    }
    t(nome, 62, y); t(n, 165, y); t(det, 205, y, { size: 10, color: r ? nero : grigio });
    const tu = turniArchivio(r, arcAnno, i + 1), extra = tu.length ? 12 : 0;
    if (extra) t("Turni: " + tu.map((d) => `${BREVI_G[new Date(arcAnno, i, d).getDay()]} ${d}`).join(", "), 205, y - 12, { size: 8.5, color: rgb(0.06, 0.45, 0.36) });
    pg.drawLine({ start: { x: 56, y: y - 6 - extra }, end: { x: 539, y: y - 6 - extra }, thickness: 0.4, color: rgb(0.8, 0.83, 0.88) });
    y -= 24 + extra;
  });
  t(`Totale giorni nell'anno: ${tot}`, 56, y - 6, { font: fb, size: 12 });
  t(`Documento generato il ${fmt(new Date())} con l'app Modulo 104 (promemoria personale, non sostituisce il modulo ufficiale).`, 56, 60, { size: 8, color: grigio });
  const bytes = await doc.save(), nomeFile = `Riepilogo permessi 104 ${arcAnno} - ${chi.replace(/[<>:"/\\|?*]/g, "-")}.pdf`;
  const file = new File([bytes], nomeFile, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: nomeFile }); return; } catch (e) { if (e.name === "AbortError") return; } }
  const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = nomeFile; a.target = "_blank"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
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
const TESTO_INVITO = "Ti mando l'app Modulo 104: compila e invia il modulo mensile dei permessi L.104/92 dal telefono. " +
  "Apri il link e segui le istruzioni per aggiungerla alla schermata Home:";
async function condividiApp(conModulo, link = LINK_APP, nota = "") {
  const testo = `${TESTO_INVITO}\n${link}${nota ? "\n\n" + nota : ""}`;
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
    try { await navigator.share({ title: "Modulo 104", text: TESTO_INVITO + (nota ? "\n" + nota : ""), url: link }); return; }
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
