/* Modulo 104 - copia di sicurezza dei dati del telefono.
   Salva in un file: anagrafica, firma, archivio, turni, impostazioni, invito, modulo caricato e modulo 151.
   NON salva mai la chiave dell'amministratore (m104_admin) né l'elenco degli inviti creati. */
(function () {
  const $ = (id) => document.getElementById(id);
  const ESCLUSI = ["m104_admin", "m104_admin_gh", "m104_inviti", "m104_no_installa", "m104_revocato"];
  const IDB_CHIAVI = ["tuo", "uso", "m151"];
  const FORMATO = "modulo104-copia";

  // ---- da/verso testo (i file Word/PDF sono byte: diventano base64)
  function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function deb64(t) { const s = atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  async function codifica(v) {
    if (v instanceof Blob) return { __blob: b64(new Uint8Array(await v.arrayBuffer())), t: v.type };
    if (v instanceof ArrayBuffer) return { __ab: b64(new Uint8Array(v)) };
    if (ArrayBuffer.isView(v)) return { __u8: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (Array.isArray(v)) return Promise.all(v.map(codifica));
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = await codifica(v[k]); return o; }
    return v;
  }
  function decodifica(v) {
    if (Array.isArray(v)) return v.map(decodifica);
    if (v && typeof v === "object") {
      if ("__u8" in v) return deb64(v.__u8);
      if ("__ab" in v) return deb64(v.__ab).buffer;
      if ("__blob" in v) return new Blob([deb64(v.__blob)], { type: v.t || "" });
      const o = {}; for (const k of Object.keys(v)) o[k] = decodifica(v[k]); return o;
    }
    return v;
  }

  async function creaCopia() {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("m104_") && !ESCLUSI.includes(k)) ls[k] = localStorage.getItem(k);
    }
    const db = {};
    for (const k of IDB_CHIAVI) { try { const v = await idbGet(k); if (v != null) db[k] = await codifica(v); } catch (e) { /* niente */ } }
    return { formato: FORMATO, versione: 1, app: typeof VERSIONE !== "undefined" ? VERSIONE : "", creata: new Date().toISOString(), localStorage: ls, idb: db };
  }

  function nomeFile() {
    let cog = "";
    try { const a = JSON.parse(localStorage.getItem("m104_anag") || "{}"); cog = a.cognome || ""; } catch (e) { /* niente */ }
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `Copia Modulo 104${cog ? " - " + cog : ""} - ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`.replace(/[<>:"/\\|?*]/g, "-");
  }

  async function salva(btn) {
    const testo = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = "Preparo la copia…"; }
    try {
      const file = new File([JSON.stringify(await creaCopia())], nomeFile(), { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Copia dei miei dati – Modulo 104" });
          localStorage.setItem("m104_ultima_copia", JSON.stringify(new Date().toISOString()));
          mostraUltima(); return;
        } catch (e) { if (e.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(file), a = document.createElement("a");
      a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      localStorage.setItem("m104_ultima_copia", JSON.stringify(new Date().toISOString()));
      mostraUltima();
      window.M104 && M104.toast("Copia salvata nei download ✔");
    } catch (e) {
      window.M104 ? M104.toast("Copia non riuscita: " + e.message) : alert("Copia non riuscita: " + e.message);
    } finally { if (btn) { btn.disabled = false; btn.textContent = testo; } }
  }

  async function ripristina(file) {
    let j;
    try { j = JSON.parse(await file.text()); } catch (e) { j = null; }
    if (!j || j.formato !== FORMATO) { alert("Questo file non è una copia di Modulo 104."); return false; }
    const quando = new Date(j.creata).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
    if (!confirm(`Ripristinare la copia del ${quando}?\nI dati attuali di questo telefono (anagrafica, firma, archivio, turni, moduli) saranno sostituiti da quelli della copia.`)) return false;
    for (const [k, v] of Object.entries(j.localStorage || {})) if (k.startsWith("m104_") && !ESCLUSI.includes(k)) localStorage.setItem(k, v);
    for (const k of IDB_CHIAVI) if (j.idb && k in j.idb) await idbSet(k, decodifica(j.idb[k]));
    alert("Dati ripristinati ✔ L'app si riapre ora.");
    location.hash = ""; location.reload();
    return true;
  }

  function mostraUltima() {
    const el = $("cp-ultima"); if (!el) return;
    let u = null; try { u = JSON.parse(localStorage.getItem("m104_ultima_copia") || "null"); } catch (e) { /* niente */ }
    el.textContent = u ? "Ultima copia: " + new Date(u).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" }) : "Non hai ancora fatto nessuna copia.";
  }

  function collega(btnId, inputId) {
    const b = $(btnId), i = $(inputId); if (!b || !i) return;
    b.addEventListener("click", () => i.click());
    i.addEventListener("change", async () => { const f = i.files[0]; i.value = ""; if (f) await ripristina(f); });
  }
  $("cp-salva") && $("cp-salva").addEventListener("click", (e) => salva(e.currentTarget));
  collega("cp-ripristina", "cp-file");
  collega("bl-ripristina", "bl-file");
  mostraUltima();
  window.M104copia = { salva, ripristina, creaCopia, mostraUltima };
})();
