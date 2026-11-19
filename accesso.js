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
  }
  async function creaInvito(nome, ore) {
    const dati = { n: nome, e: Math.floor(Date.now() / 1000 + ore * 3600), i: b64u(crypto.getRandomValues(new Uint8Array(6))) };
    const p = enc.encode(JSON.stringify(dati));
    const s = new Uint8Array(await crypto.subtle.sign(FIRMA, chiaveSegreta, p));
    const token = b64u(p) + "." + b64u(s);
    const st = leggi("m104_inviti") || []; st.unshift({ nome, scade: dati.e, creato: Date.now() }); scrivi("m104_inviti", st.slice(0, 50));
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
    const st = leggi("m104_inviti") || [];
    $("inv-storico").innerHTML = st.length ? st.slice(0, 8).map((x) => `<li>${esc(x.nome || "senza nome")} · scade ${new Date(x.scade * 1000).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</li>`).join("") : "<li>Nessun invito ancora</li>";
    window.M104.vai("s-invito");
  }
  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  async function inviaInvito() {
    const nome = $("inv-nome").value.trim();
    if (!nome) { $("inv-msg").textContent = "Scrivi il nome del collega"; return; }
    try {
      if (!chiaveSegreta) await sbloccaChiave($("inv-codice").value);
      $("inv-codice").value = ""; $("inv-codice-box").hidden = true;
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

  async function avvio() {
    const h = location.hash;
    const c = estrai(h);
    if (c) {
      history.replaceState(null, "", location.pathname);
      if (c.tipo === "admin") { preparaAdmin(c.v); return; }
      if (!attivo()) { await usaCodice(c.v); if (!attivo()) blocca($("bl-msg").textContent); return; }
    }
    if (attivo()) sblocca(); else blocca("");
  }
  window.M104acc = { apriInvito, isAdmin, attivo, _verifica: verificaInvito, _estrai: estrai };
  avvio();
})();
