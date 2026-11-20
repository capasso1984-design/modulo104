/* Modulo 104 - accesso riservato.
   - L'app si usa solo con un INVITO valido, firmato dall'amministratore (firma digitale ECDSA P-256).
   - Solo il telefono amministratore può creare inviti: la chiave segreta sta solo lì, protetta da un codice.
   - Gli inviti scadono: girati dopo la scadenza non funzionano. */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  // chiave PUBBLICA: serve solo a verificare gli inviti, non permette di crearli
  const CHIAVE_PUBBLICA = { kty: "EC", crv: "P-256", x: "elK3AP6yF1brBwYeVEcG5qFs0a57X8eYyrPdeqhF_Wg", y: "jwjmeYe94VTIuLHlobFLKFQZmm54BB5RZFdlppZGpYY" };
  const ALG = { name: "ECDSA", namedCurve: "P-256" }, FIRMA = { name: "ECDSA", hash: "SHA-256" };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const deb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
  const leggi = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const LINK_APP = location.origin + location.pathname.replace(/index\.html$/, "");
  let chiaveSegreta = null; // sbloccata in questa sessione
  let codiceSessione = null, tokenGH = null; // solo in memoria, mai salvati in chiaro
  const REPO = "capasso1984-design/modulo104", API_REVOCHE = `https://api.github.com/repos/${REPO}/contents/revoche.json`;

  // ------------------------------------------------------------ inviti bloccati
  // Nel sito c'è revoche.json con le sole "impronte" (codici irreversibili) di nome e id dell'invito: nessun nome in chiaro.
  const norm = (t) => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
  async function impronta(t) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("m104|" + t)));
    return Array.from(h.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function improntePer(nome, id) {
    const out = [];
    if (nome) out.push(await impronta("n:" + norm(nome)));
    if (id) out.push(await impronta("i:" + id));
    return out;
  }
  // collega: controlla (con internet) se il suo invito è stato bloccato; senza internet vale l'ultimo controllo
  async function controllaRevoca() {
    const acc = leggi("m104_accesso");
    if (!acc || acc.tipo === "admin" || isAdmin()) { scrivi("m104_revocato", false); return false; }
    try {
      const r = await fetch("revoche.json?t=" + Date.now(), { cache: "no-store" });
      if (r.ok) {
        const lista = (await r.json()).h || [];
        const mie = await improntePer(acc.nome, acc.id);
        scrivi("m104_revocato", mie.some((x) => lista.includes(x)));
      } else if (r.status === 404) scrivi("m104_revocato", false);
    } catch (e) { /* senza internet: resta l'ultimo controllo */ }
    return !!leggi("m104_revocato");
  }
  function bloccaRevocato() {
    blocca("⛔ Il tuo accesso a Modulo 104 è stato sospeso dall'amministratore. Se pensi sia un errore, contattalo.");
    $("bl-normale").hidden = true;
  }

  // ------------------------------------------------------------ verifica degli inviti
  async function verificaInvito(token) {
    const [p, s] = String(token).trim().split(".");
    if (!p || !s) throw new Error("Questo non è un invito valido");
    const k = await crypto.subtle.importKey("jwk", CHIAVE_PUBBLICA, ALG, false, ["verify"]);
    const ok = await crypto.subtle.verify(FIRMA, k, deb64u(s), deb64u(p));
    if (!ok) throw new Error("Invito non valido (firma errata)");
    const dati = JSON.parse(dec.decode(deb64u(p)));
    if (!dati.e || Date.now() > dati.e * 1000) throw new Error("Questo invito è scaduto: chiedine uno nuovo");
    return dati;
  }
  // estrae il codice da un link o da un testo incollato
  function estrai(testo) {
    const t = String(testo || "").trim();
    const mA = t.match(/[#&]admin=([A-Za-z0-9_\-]+)/); if (mA) return { tipo: "admin", v: mA[1] };
    const mI = t.match(/[#&]invito=([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/); if (mI) return { tipo: "invito", v: mI[1] };
    if (/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(t)) return { tipo: "invito", v: t };
    return null;
  }
  const attivo = () => !!leggi("m104_accesso");
  const isAdmin = () => !!leggi("m104_admin");

  // ------------------------------------------------------------ schermata "App riservata"
  function blocca(msg) {
    $("blocco").hidden = false; document.body.classList.add("bloccata");
    $("bl-msg").textContent = msg || "";
    $("bl-admin").hidden = true; $("bl-normale").hidden = false;
  }
  function sblocca() { $("bl-msg").textContent = ""; $("blocco").hidden = true; document.body.classList.remove("bloccata"); aggiornaCondivisione(); }

  async function usaCodice(testo) {
    const c = estrai(testo);
    if (!c) { $("bl-msg").textContent = "Non riconosco il codice: incolla tutto il messaggio o il link d'invito."; return; }
    if (c.tipo === "admin") { preparaAdmin(c.v); return; }
    try {
      const d = await verificaInvito(c.v);
      scrivi("m104_accesso", { tipo: "invito", nome: d.n || "", id: d.i, quando: new Date().toISOString(), scade: d.e });
      if (await controllaRevoca()) { bloccaRevocato(); return; }
      sblocca();
      window.M104 && window.M104.toast(`Benvenuto${d.n ? " " + d.n : ""}! App attivata ✔`, 5000);
      const installata = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
      if (!installata) {
        // aperto da Safari: tiene l'invito a portata per l'app installata (su iPhone ha una memoria separata)
        try { await navigator.clipboard.writeText(LINK_APP + "#invito=" + c.v); } catch (e) { /* niente */ }
      }
    } catch (e) { $("bl-msg").textContent = e.message; }
  }

  // ------------------------------------------------------------ amministratore
  let adminInAttesa = null;
  function preparaAdmin(v) {
    adminInAttesa = v;
    $("blocco").hidden = false; document.body.classList.add("bloccata");
    $("bl-normale").hidden = true; $("bl-admin").hidden = false; $("bl-msg").textContent = "";
  }
  async function chiaveDaCodice(codice, sale) {
    const base = await crypto.subtle.importKey("raw", enc.encode(codice), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sale, iterations: 250000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function salvaAdmin() {
    const c1 = $("bl-cod1").value, c2 = $("bl-cod2").value;
    if (c1.length < 6) { $("bl-msg").textContent = "Il codice deve avere almeno 6 caratteri"; return; }
    if (c1 !== c2) { $("bl-msg").textContent = "I due codici non coincidono"; return; }
    try {
      const jwk = JSON.parse(dec.decode(deb64u(adminInAttesa)));
      // controlla che la chiave segreta corrisponda a quella pubblica dell'app
      const k = await crypto.subtle.importKey("jwk", jwk, ALG, false, ["sign"]);
      const prova = enc.encode("prova");
      const sig = new Uint8Array(await crypto.subtle.sign(FIRMA, k, prova));
      const kp = await crypto.subtle.importKey("jwk", CHIAVE_PUBBLICA, ALG, false, ["verify"]);
      if (!(await crypto.subtle.verify(FIRMA, kp, sig, prova))) throw new Error("chiave");
      const sale = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const cif = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chiaveDaCodice(c1, sale), enc.encode(JSON.stringify(jwk))));
      scrivi("m104_admin", { sale: b64u(sale), iv: b64u(iv), dati: b64u(cif) });
      scrivi("m104_accesso", { tipo: "admin", quando: new Date().toISOString() });
      chiaveSegreta = k; adminInAttesa = null;
      $("bl-cod1").value = ""; $("bl-cod2").value = "";
      history.replaceState(null, "", location.pathname);
      sblocca();
      window.M104.toast("Modalità amministratore attiva ✔ Solo tu puoi condividere l'app", 6000);
    } catch (e) { $("bl-msg").textContent = "Link di attivazione non valido"; }
  }
  async function sbloccaChiave(codice) {
    const a = leggi("m104_admin"); if (!a) throw new Error("Questo telefono non è amministratore");
    try {
      const chiaro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deb64u(a.iv) }, await chiaveDaCodice(codice, deb64u(a.sale)), deb64u(a.dati));
      chiaveSegreta = await crypto.subtle.importKey("jwk", JSON.parse(dec.decode(chiaro)), ALG, false, ["sign"]);
    } catch (e) { throw new Error("Codice amministratore errato"); }
    codiceSessione = codice;
    const g = leggi("m104_admin_gh");
    if (g) { try { tokenGH = dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deb64u(g.iv) }, await chiaveDaCodice(codice, deb64u(g.sale)), deb64u(g.dati))); } catch (e) { tokenGH = null; } }
  }
  async function serveCodice() {
    if (chiaveSegreta) return;
    const c = $("inv-codice").value;
    if (!c) { $("inv-codice-box").hidden = false; $("inv-codice").focus(); throw new Error("Scrivi prima il codice amministratore (in alto)"); }
    await sbloccaChiave(c);
    $("inv-codice").value = ""; $("inv-codice-box").hidden = true;
  }
  async function creaInvito(nome, ore) {
    const dati = { n: nome, e: Math.floor(Date.now() / 1000 + ore * 3600), i: b64u(crypto.getRandomValues(new Uint8Array(6))) };
    const p = enc.encode(JSON.stringify(dati));
    const s = new Uint8Array(await crypto.subtle.sign(FIRMA, chiaveSegreta, p));
    const token = b64u(p) + "." + b64u(s);
    const st = leggi("m104_inviti") || []; st.unshift({ nome, scade: dati.e, creato: Date.now(), i: dati.i }); scrivi("m104_inviti", st.slice(0, 50));
    return { token, link: LINK_APP + "#invito=" + token, scade: new Date(dati.e * 1000) };
  }

  // ------------------------------------------------------------ pagina "Invita un collega"
  let conModulo = false;
  function apriInvito(modulo) {
    if (!isAdmin()) { window.M104.toast("Solo l'amministratore può condividere l'app"); return; }
    conModulo = !!modulo;
    $("inv-titolo").textContent = conModulo ? "Invita un collega (app + modulo)" : "Invita un collega";
    $("inv-codice-box").hidden = !!chiaveSegreta;
    $("inv-msg").textContent = "";
    disegnaStorico();
    statoGH();
    window.M104.vai("s-invito");
  }
  let pubblicate = null; // impronte bloccate lette dal sito
  async function leggiRevoche() {
    try {
      if (tokenGH) { const g = await scaricaRevocheGH(); return g.lista; }
      const r = await fetch("revoche.json?t=" + Date.now(), { cache: "no-store" });
      return r.ok ? (await r.json()).h || [] : [];
    } catch (e) { return pubblicate || []; }
  }
  async function disegnaStorico() {
    const st = leggi("m104_inviti") || [];
    const box = $("inv-storico");
    if (!st.length) { box.innerHTML = '<p class="muted">Nessun invito ancora</p>'; return; }
    if (pubblicate === null) pubblicate = await leggiRevoche();
    const righe = await Promise.all(st.slice(0, 30).map(async (x, k) => {
      const imp = await improntePer(x.nome, x.i);
      const bloc = imp.some((h) => pubblicate.includes(h));
      const scaduto = Date.now() > x.scade * 1000;
      const quando = new Date(x.scade * 1000).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
      return `<div class="inv-riga${bloc ? " bloc" : ""}">
        <div class="inv-riga__t"><b>${esc(x.nome || "senza nome")}</b><small>${scaduto ? "link scaduto il" : "link valido fino al"} ${quando}</small>${bloc ? '<span class="inv-stato">⛔ Bloccato</span>' : ""}</div>
        <button class="inv-b ${bloc ? "sblocca" : "blocca"}" data-k="${k}" data-az="${bloc ? "sblocca" : "blocca"}">${bloc ? "Sblocca" : "Blocca"}</button>
        <button class="inv-b togli" data-k="${k}" data-az="togli" aria-label="Elimina dalla lista">✕</button>
      </div>`;
    }));
    box.innerHTML = righe.join("");
  }
  async function azioneInvito(e) {
    const b = e.target.closest(".inv-b"); if (!b) return;
    const st = leggi("m104_inviti") || [], x = st[+b.dataset.k]; if (!x) return;
    const az = b.dataset.az;
    if (az === "togli") {
      if (!confirm(`Togliere ${x.nome} dalla lista degli inviti?\n(Serve solo a fare ordine: non blocca l'app. Per bloccarla usa «Blocca».)`)) return;
      st.splice(+b.dataset.k, 1); scrivi("m104_inviti", st); disegnaStorico(); return;
    }
    const blocca = az === "blocca";
    if (blocca && !confirm(`Bloccare l'app a ${x.nome}?\nAl prossimo avvio con internet l'app gli mostrerà «accesso sospeso». Potrai sbloccarlo quando vuoi.`)) return;
    try {
      await serveCodice();
      if (!tokenGH) { $("gh-box").hidden = false; $("gh-box").scrollIntoView({ behavior: "smooth" }); throw new Error("Per bloccare serve collegare GitHub una volta sola: vedi il riquadro «Collegamento per i blocchi» qui sotto."); }
      b.disabled = true; b.textContent = "Attendi…";
      const imp = await improntePer(x.nome, x.i);
      const g = await scaricaRevocheGH();
      let lista = g.lista.filter((h) => !imp.includes(h));
      if (blocca) lista = lista.concat(imp);
      await pubblicaRevocheGH(lista, g.sha, `${blocca ? "Blocca" : "Sblocca"} un invito`);
      pubblicate = lista;
      window.M104.toast(blocca ? `${x.nome} bloccato ✔ (attivo entro un paio di minuti)` : `${x.nome} sbloccato ✔`, 5000);
      disegnaStorico();
    } catch (err) { $("inv-msg").textContent = err.message; window.M104.toast(err.message, 6000); disegnaStorico(); }
  }

  // ------------------------------------------------------------ collegamento GitHub (solo telefono amministratore)
  const hGH = () => ({ Authorization: "Bearer " + tokenGH, Accept: "application/vnd.github+json" });
  async function scaricaRevocheGH() {
    const r = await fetch(API_REVOCHE + "?ref=main&t=" + Date.now(), { headers: hGH(), cache: "no-store" });
    if (r.status === 404) return { lista: [], sha: undefined };
    if (r.status === 401 || r.status === 403) throw new Error("GitHub rifiuta il collegamento: il token è scaduto o non ha i permessi. Ricollegalo.");
    if (!r.ok) throw new Error("GitHub non risponde (" + r.status + "). Riprova tra poco.");
    const j = await r.json();
    const testo = dec.decode(Uint8Array.from(atob(j.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
    return { lista: (JSON.parse(testo).h || []), sha: j.sha };
  }
  async function pubblicaRevocheGH(lista, sha, msg) {
    const corpo = JSON.stringify({ v: 1, nota: "Impronte degli inviti bloccati (nessun dato personale).", h: [...new Set(lista)] }, null, 1) + "\n";
    const r = await fetch(API_REVOCHE, { method: "PUT", headers: hGH(), body: JSON.stringify({ message: msg, content: btoa(corpo), sha, branch: "main" }) });
    if (!r.ok) throw new Error("Pubblicazione non riuscita (" + r.status + "). Riprova tra poco.");
  }
  function statoGH() {
    const c = !!leggi("m104_admin_gh");
    $("gh-stato").textContent = c ? "✔ Collegato: puoi bloccare e sbloccare dal telefono." : "Non ancora collegato.";
    $("gh-box").hidden = c;
    $("gh-scollega").hidden = !c;
  }
  async function collegaGH() {
    const t = $("gh-token").value.trim();
    $("gh-msg").textContent = "";
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { $("gh-msg").textContent = "Non sembra un token GitHub: deve iniziare con github_pat_"; return; }
    try {
      await serveCodice();
      tokenGH = t;
      await scaricaRevocheGH();          // prova che funzioni
      const sale = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const cif = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chiaveDaCodice(codiceSessione, sale), enc.encode(t)));
      scrivi("m104_admin_gh", { sale: b64u(sale), iv: b64u(iv), dati: b64u(cif) });
      $("gh-token").value = "";
      statoGH(); pubblicate = null; disegnaStorico();
      window.M104.toast("Collegamento fatto ✔ Ora puoi bloccare gli inviti", 5000);
    } catch (e) { tokenGH = null; $("gh-msg").textContent = e.message; }
  }
  function scollegaGH() {
    if (!confirm("Togliere il collegamento GitHub da questo telefono? I blocchi già fatti restano.")) return;
    localStorage.removeItem("m104_admin_gh"); tokenGH = null; statoGH(); $("gh-box").hidden = false;
  }
  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  async function inviaInvito() {
    const nome = $("inv-nome").value.trim();
    if (!nome) { $("inv-msg").textContent = "Scrivi il nome del collega"; return; }
    try {
      await serveCodice();
      const inv = await creaInvito(nome, +$("inv-ore").value);
      const quando = inv.scade.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
      $("inv-msg").textContent = `Invito per ${nome} creato: vale fino al ${quando}.`;
      await window.M104.condividiApp(conModulo, inv.link, `Invito personale per ${nome}, valido fino al ${quando}.`);
    } catch (e) { $("inv-msg").textContent = e.message; }
  }

  function aggiornaCondivisione() {
    const a = isAdmin();
    document.querySelectorAll(".solo-admin").forEach((e) => (e.style.display = a ? "" : "none"));
    const acc = leggi("m104_accesso");
    if ($("info-accesso")) $("info-accesso").textContent = a ? "Questo telefono è l'amministratore: puoi invitare i colleghi." : acc && acc.nome ? `App attivata con l'invito per ${acc.nome}.` : "";
  }

  // ------------------------------------------------------------ avvio
  $("bl-attiva").addEventListener("click", () => usaCodice($("bl-codice").value));
  $("bl-incolla").addEventListener("click", async () => {
    try { const t = await navigator.clipboard.readText(); $("bl-codice").value = t; usaCodice(t); }
    catch (e) { $("bl-msg").textContent = "Tieni premuto nel riquadro e scegli «Incolla»"; }
  });
  $("bl-salva-admin").addEventListener("click", salvaAdmin);
  $("inv-crea").addEventListener("click", inviaInvito);
  $("inv-storico").addEventListener("click", azioneInvito);
  $("gh-collega").addEventListener("click", collegaGH);
  $("gh-scollega").addEventListener("click", scollegaGH);
  $("gh-mostra").addEventListener("click", () => { $("gh-box").hidden = !$("gh-box").hidden; });

  async function avvio() {
    const h = location.hash;
    const c = estrai(h);
    if (c) {
      history.replaceState(null, "", location.pathname);
      if (c.tipo === "admin") { preparaAdmin(c.v); return; }
      if (!attivo()) { await usaCodice(c.v); if (!attivo()) blocca($("bl-msg").textContent); return; }
    }
    if (!attivo()) { blocca(""); return; }
    if (leggi("m104_revocato") && !isAdmin()) bloccaRevocato(); else sblocca();
    const prima = !!leggi("m104_revocato");
    const ora = await controllaRevoca();
    if (ora) bloccaRevocato(); else if (prima) sblocca();
  }
  window.M104acc = { apriInvito, isAdmin, attivo, _verifica: verificaInvito, _estrai: estrai, _impronte: improntePer, _controlla: controllaRevoca };
  avvio();
})();
