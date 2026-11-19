/* Modulo 104 - app telefono. Tutti i dati restano nel telefono (localStorage / IndexedDB). */
"use strict";
const VERSIONE = "1.8";
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const NUMERI = ["zero","uno","due","tre","quattro","cinque","sei","sette","otto","nove","dieci","undici","dodici","tredici","quattordici","quindici","sedici","diciassette","diciotto","diciannove","venti","ventuno","ventidue","ventitré","ventiquattro","venticinque","ventisei","ventisette","ventotto","ventinove","trenta","trentuno"];
const N_PERIODI = 3, N_ORARI = 8;
const ANAG = [
  ["grado","Grado (es. PG)"],["categoria","Categoria / specialità (es. OFPS)"],["cognome","Cognome"],["nome","Nome"],
  ["reparto","Reparto (es. Compagnia Protezione delle Forze)"],["assistito","Cognome e nome della persona assistita"],
  ["parentela","Grado di parentela (es. Padre)"],["extra1","Altro dato fisso 1 (facoltativo)"],["extra2","Altro dato fisso 2 (facoltativo)"]];
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

let pacchetto = null;
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
  if ("s-" + location.hash.slice(1) !== id && !(id === "s-home" && !location.hash)) history.replaceState(null, "", id === "s-home" ? location.pathname : "#" + id.slice(2));
}

// ---------------------------------------------------------------- anagrafica
function anag() { return mem.get("m104_anag", {}); }
function fissi() {
  const a = anag();
  const f = Object.assign({}, a);
  f.grado_nome = [a.grado, a.categoria, a.cognome, a.nome].filter(Boolean).join(" ");
  f.cognome_nome = [a.cognome, a.nome].filter(Boolean).join(" ");
  return f;
}
function costruisciAnag() {
  const a = anag(), box = $("campi-anag");
  box.innerHTML = "";
  for (const [k, lab] of ANAG) {
    const l = document.createElement("label"); l.textContent = lab; l.htmlFor = "an-" + k;
    const i = document.createElement("input"); i.id = "an-" + k; i.value = a[k] || ""; i.autocomplete = "off";
    i.addEventListener("input", anteprimaNome);
    box.append(l, i);
  }
  anteprimaNome();
  mostraFirma();
}
function anteprimaNome() {
  const v = (k) => ($("an-" + k)?.value || "").trim();
  const gn = [v("grado"), v("categoria"), v("cognome"), v("nome")].filter(Boolean).join(" ");
  $("anteprima-nome").textContent = gn ? `Nel modulo comparirà: "Il Sottoscritto ${gn}"` : "";
}
$("b-salva-anag").addEventListener("click", () => {
  const a = {};
  for (const [k] of ANAG) a[k] = $("an-" + k).value.trim();
  if (mem.set("m104_anag", a)) { toast("Anagrafica salvata ✔"); vai("s-home"); }
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
$("file-firma").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const url = URL.createObjectURL(f); const img = await caricaImg(url); URL.revokeObjectURL(url);
    const out = pulisciFirma(img, true);
    if (!out) { toast("Non trovo la firma nella foto: riprova con più luce e fondo bianco"); return; }
    if (mem.set("m104_firma", out)) { mostraFirma(); aggiornaAvvisi(); toast("Firma salvata ✔"); }
  } catch (err) { toast("Impossibile leggere l'immagine"); }
  e.target.value = "";
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
  try { pacchetto = await idbGet("pacchetto"); } catch (e) { pacchetto = null; }
  infoModulo();
}
function infoModulo() {
  $("info-modulo").innerHTML = pacchetto
    ? `<span class="badge">✔ ${esc(pacchetto.nome)}</span><br><span class="muted">Preparato il ${esc(pacchetto.creato)} · ${pacchetto.campi.length} campi</span>`
    : "Nessun modulo caricato.";
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
// chiede conferma prima di sostituire il modulo già in uso
function confermaSostituzione(nuovo) {
  if (!pacchetto) return true;
  return confirm(`Stai sostituendo il modulo in uso:\n«${pacchetto.nome}» (del ${pacchetto.creato})\n\ncon:\n«${nuovo.nome}» (del ${nuovo.creato})\n\nContinuo?`);
}
$("file-m104").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  $("avviso-word").style.display = "none";
  const tipo = await tipoFile(f);
  if (tipo === "word") { spiegaWord(); return; }
  if (tipo === "pdf") {   // un PDF va preparato: lo apro direttamente nella preparazione
    vai("s-prepara"); $("prep-nome").value = f.name.replace(/\.pdf$/i, ""); window.M104prep.apriPdf(f);
    toast("È un PDF: controlla le scelte e salva il modulo"); return;
  }
  try {
    const j = JSON.parse(await f.text());
    if (j.formato !== "m104" || !j.basi || !j.campi) throw new Error("formato");
    if (!confermaSostituzione(j)) return;
    j.origine = j.origine || "pc"; j.caricato = new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
    await idbSet("pacchetto", j); pacchetto = j; infoModulo(); toast("Modulo caricato ✔");
    aggiornaAvvisi(); vai("s-home");
  } catch (err) { toast("Questo file non è un modulo: scegli il file .m104, oppure un PDF del modulo vuoto"); }
});
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------------------------------------------------------------- impostazioni
function impost() { return Object.assign({}, IMPOST_DEF, mem.get("m104_impost", {})); }
function costruisciImpost() {
  const i = impost();
  $("em-a").value = i.a; $("em-cc").value = i.cc; $("em-ogg").value = i.oggetto; $("em-testo").value = i.testo; $("nomefile").value = i.nomefile;
  $("versione").textContent = "Versione " + VERSIONE;
}
$("b-salva-imp").addEventListener("click", () => {
  if (mem.set("m104_impost", { a: $("em-a").value.trim(), cc: $("em-cc").value.trim(), oggetto: $("em-ogg").value, testo: $("em-testo").value, nomefile: $("nomefile").value }))
    toast("Impostazioni salvate ✔");
});

// ---------------------------------------------------------------- compila
function costruisciCompila() {
  const oggi = new Date(), prox = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1);
  $("mese").innerHTML = MESI.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  $("mese").value = prox.getMonth() + 1; $("anno").value = prox.getFullYear();
  $("datacomp").value = `${oggi.getFullYear()}-${pad2(oggi.getMonth() + 1)}-${pad2(oggi.getDate())}`;
  let h = "";
  for (let i = 1; i <= N_PERIODI; i++)
    h += `<div class="periodo"><span class="lab">${i})</span><label class="mini">dal<input id="dal${i}" type="date"></label><label class="mini">al<input id="al${i}" type="date"></label></div>`;
  $("periodi").innerHTML = h;
  h = "";
  for (let i = 1; i <= N_ORARI; i++)
    h += `<div class="og"><input id="og${i}g" type="date" aria-label="Giorno permesso orario ${i}"><input id="og${i}d" type="time" aria-label="Dalle"><input id="og${i}a" type="time" aria-label="Alle"></div>`;
  $("orari").innerHTML = h;
  // quando scegli "dal", il calendario di "al" parte dallo stesso giorno
  for (let i = 1; i <= N_PERIODI; i++) $("dal" + i).addEventListener("change", () => { if (!$("al" + i).value) $("al" + i).min = $("dal" + i).value; });
  document.querySelectorAll("#s-compila input, #s-compila select").forEach((el) => { el.addEventListener("input", totale); el.addEventListener("change", totale); });
  totale();
}
// legge una data "aaaa-mm-gg" del calendario
function dataDa(s) { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; }
function leggiMese() {
  const periodi = [], orari = [], date = [];
  for (let i = 1; i <= N_PERIODI; i++) {
    const a = $("dal" + i).value, b = $("al" + i).value;
    if (!a && !b) continue;
    if (!a) throw new Error(`Periodo ${i}: manca la data "dal"`);
    const d1 = dataDa(a), d2 = dataDa(b || a);
    if (b && b < a) throw new Error(`Periodo ${i}: "al" è prima di "dal"`);
    periodi.push([d1, d2]); date.push(d1, d2);
  }
  for (let i = 1; i <= N_ORARI; i++) {
    const g = $(`og${i}g`).value; if (!g) continue;
    const d = dataDa(g); orari.push([d, $(`og${i}d`).value, $(`og${i}a`).value]); date.push(d);
  }
  // il mese di riferimento si ricava dalle date; se non ci sono date si usa quello scelto a mano
  let mese = +$("mese").value, anno = +$("anno").value, daDate = false;
  if (date.length) {
    const mesi = new Set(date.map((d) => d.y * 100 + d.m));
    if (mesi.size > 1) throw new Error("Le date sono in mesi diversi: il modulo è mensile, fai un modulo per ogni mese");
    mese = date[0].m; anno = date[0].y; daDate = true;
  }
  if (!anno || anno < 2000) throw new Error("Anno non valido");
  const dc = $("datacomp").value;
  const data = dc ? dc.split("-").reverse().join("/") : fmt(new Date());
  return { mese, anno, daDate, periodi: periodi.map(([a, b]) => [a.d, b.d]), orari: orari.map(([d, h1, h2]) => [d.d, h1, h2]), data, motivo: $("motivo").value.trim() };
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
  try {
    const m = leggiMese(), v = calcolaValori(m);
    $("rif-mese").innerHTML = m.daDate ? `Mese di riferimento: <b>${v.mese_anno}</b> <span class="muted">(dalle date)</span>` : "Nessuna data: scegli qui sotto il mese di riferimento";
    $("scelta-mese").style.display = m.daDate ? "none" : "flex";
    $("totale").className = "tot";
    $("totale").textContent = `Totale giorni: ${v._giorni}` + (v._giorni ? ` (${v.giorni_lettere})` : "") + (v._orari ? ` · permessi orari: ${v._orari}` : "");
  } catch (e) { $("totale").className = "tot err"; $("totale").textContent = e.message; $("rif-mese").textContent = ""; }
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

async function creaPdf(m) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const v = calcolaValori(m), f = fissi();
  const scen = v._giorni && v._orari ? "entrambi" : v._giorni ? "giorni" : v._orari ? "orari" : "nessuno";
  const doc = await PDFDocument.load(b64bytes(pacchetto.basi[scen] || pacchetto.basi.unico || pacchetto.basi.nessuno));
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const pagine = doc.getPages();
  const firma = mem.get("m104_firma", null);
  let firmaImg = null;
  if (firma) firmaImg = await doc.embedPng(b64bytes(firma.split(",")[1]));
  const nero = rgb(0, 0, 0);
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
    if (c.a.startsWith("fisso:")) val = f[c.a.slice(6)] || "";
    else if (c.a.startsWith("var:")) val = v[c.a.slice(4)] || "";
    if (!val) continue;
    const testo = pulisciTesto(val, font);
    const largCampo = c.y2 === c.y && c.x2 > c.x ? c.x2 - c.x : 400;
    let sz = size;
    while (sz > 6 && font.widthOfTextAtSize(testo, sz) > largCampo - 2) sz -= 0.5;
    // nei campi con barre (date "__/__/__") copre le barre sopra la riga; le lineette restano come sottolineatura
    if (c.t && /[^_\s]/.test(c.t)) {
      const anno = /\d/.test(c.t);   // c'era un anno stampato: lo copre tutto
      pg.drawRectangle({ x: c.x + (anno ? -1 : 1), y: base - 0.4, width: Math.max(4, largCampo + (anno ? 3 : -1.5)), height: size * 1.0, color: rgb(1, 1, 1) });
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
  const nome = (riempi(imp.nomefile, dati).replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim() || "Modulo 104") + ".pdf";
  return { blob: new Blob([bytes], { type: "application/pdf" }), nome, oggetto: riempi(imp.oggetto, dati), testo: riempi(imp.testo, dati), periodi: v.periodi, valori: v };
}

$("b-crea").addEventListener("click", async () => {
  if (!pacchetto) { toast("Prima carica il modulo da compilare"); vai("s-modulo"); return; }
  if (!anag().cognome) { toast("Prima compila l'anagrafica"); vai("s-anag"); return; }
  let m;
  try { m = leggiMese(); } catch (e) { toast(e.message); return; }
  if (!m.periodi.length && !m.orari.length && !confirm("Non hai inserito giorni né permessi orari. Creo il modulo con 'non richiede i permessi'?")) return;
  if (!mem.get("m104_firma", null) && !confirm("Non hai ancora una firma salvata. Creo il PDF senza firma?")) return;
  const b = $("b-crea"); b.disabled = true; b.textContent = "Creo il PDF…";
  try {
    ultimo = await creaPdf(m);
    $("nomepdf").textContent = ultimo.nome + " · " + ultimo.periodi;
    $("risultato").style.display = "block";
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
$("b-invia").addEventListener("click", async () => {
  if (!ultimo) return;
  const file = new File([ultimo.blob], ultimo.nome, { type: "application/pdf" });
  await copia(ultimo.oggetto);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: ultimo.oggetto, text: ultimo.testo }); }
    catch (e) { if (e.name !== "AbortError") toast("Condivisione non riuscita: usa 'Apri / salva PDF'"); }
  } else { toast("Questo browser non può condividere file: uso 'Apri / salva PDF'"); apriPdf(); }
});
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
async function anteprima(blob) {
  const box = $("anteprima");
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

// ---------------------------------------------------------------- avvio
costruisciAnag(); costruisciImpost(); costruisciCompila();
caricaPacchetto().then(() => mostra(location.hash ? "s-" + location.hash.slice(1) : "s-home"));
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
async function salvaPacchetto(j) { await idbSet("pacchetto", j); pacchetto = j; infoModulo(); aggiornaAvvisi(); }
window.M104 = { creaPdf, calcolaValori, leggiMese, salvaPacchetto, toast, vai, anteprima, tipoFile, confermaSostituzione, attuale: () => pacchetto };

// ---------------------------------------------------------------- condivisione e installazione
const LINK_APP = location.origin + location.pathname.replace(/index\.html$/, "");
const TESTO_INVITO = "Ti mando l'app Modulo 104: compila e invia il modulo mensile dei permessi L.104/92 dal telefono. " +
  "Apri il link e segui le istruzioni per aggiungerla alla schermata Home:";
async function condividiApp(conModulo) {
  const testo = `${TESTO_INVITO}\n${LINK_APP}`;
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
    try { await navigator.share({ title: "Modulo 104", text: TESTO_INVITO, url: LINK_APP }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  if (await copia(testo)) toast("Link copiato ✔ Incollalo in WhatsApp, email o SMS");
}
$("b-condividi").addEventListener("click", () => condividiApp(false));
$("b-condividi-modulo").addEventListener("click", () => condividiApp(true));
$("b-condividi-testa").addEventListener("click", () => condividiApp(false));

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
