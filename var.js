/* Modulo 104 - variazione della programmazione mensile (per situazioni improvvise ed urgenti).
   Dall'Archivio, su un mese già programmato: si sposta un giorno («il 22 anziché il 19»), lo si toglie
   («non vi è più esigenza…») o se ne aggiunge uno. L'app riempie il Word della variazione (master del sito
   o quello caricato da ognuno), lo impagina in PDF, mette la firma e salva tutto in archivio. */
"use strict";
(function () {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const V = "urn:schemas-microsoft-com:vml";
  const R = {
    sott: /^\s*Il\s+Sottoscritto/i,
    serv: /in\s+servizio\s+presso/i,
    mod: /a\s+modifica\s+di\s+quanto\s+programmato/i,
    giorni: /giorni\s*_*[\d\s]*_*\s*\(.*\)\s*di\s+permessi\s+lavorativi/i,
    riga: /^\s*-?\s*dal\b.*anzich[eé]/i,
    nonvi: /non\s+vi\s+[èe]\s+pi[uù]\s+esigenza/i,
    ricov: /non\s+[èe]\s+ricoverato/i,
    nessuno: /nessun\s+altro\s+soggetto/i,
    nonsi: /NON\s+SI\s+sovrappongono/,
    si: /,\s*SI\s+sovrappongono/,
    data: /^\s*[^,\d]{2,40},\s*(_+|\d{1,2}\/\d{1,2}\/\d{2,4})?\s*$/,
  };
  const RIGA_VUOTA = "dal ____/____/______ al ____/____/______   anziché dal ____/____/______";
  let mio = null;     // Word caricato dall'utente { nome, caricato, docx }
  let master = null;  // Uint8Array del master del sito

  const testoP = (p) => Array.from(p.getElementsByTagNameNS(W, "t")).map((t) => t.textContent).join("");
  function metti(p, s) {
    const ts = Array.from(p.getElementsByTagNameNS(W, "t"));
    if (!ts.length) return;
    ts[0].textContent = s; ts[0].setAttribute("xml:space", "preserve");
    for (const t of ts.slice(1)) t.textContent = "";
  }
  // spunta la casella disegnata del paragrafo (quadratino pieno)
  function spunta(p) {
    const nf = Array.from(p.getElementsByTagNameNS(A, "noFill")).find((e) => e.parentNode && e.parentNode.localName === "spPr");
    if (nf) {
      const sf = nf.ownerDocument.createElementNS(A, "a:solidFill"), c = nf.ownerDocument.createElementNS(A, "a:srgbClr");
      c.setAttribute("val", "000000"); sf.append(c); nf.replaceWith(sf);
    }
    for (const r of Array.from(p.getElementsByTagNameNS(V, "rect"))) { r.setAttribute("filled", "t"); r.setAttribute("fillcolor", "black"); }
  }
  async function zip() {
    if (!window.fflate) await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "lib/fflate.min.js"; s.onload = ok; s.onerror = ko; document.head.append(s); });
  }
  async function apri(bytes) {
    await zip();
    const z = fflate.unzipSync(bytes);
    if (!z["word/document.xml"]) throw new Error("Questo file non è un Word (.docx)");
    const d = new DOMParser().parseFromString(new TextDecoder().decode(z["word/document.xml"]), "application/xml");
    const ps = Array.from(d.getElementsByTagNameNS(W, "p"));
    const trova = (rx) => ps.find((p) => rx.test(testoP(p))) || null;
    return { z, d, ps, trova, righe: ps.filter((p) => R.riga.test(testoP(p))) };
  }
  async function analizza(bytes) {
    const a = await apri(bytes);
    if (!a.righe.length || !a.trova(R.mod)) throw new Error("Non trovo le righe «dal … al … anziché dal …»: è il modulo di variazione della 104?");
    return { righe: a.righe.length };
  }
  async function modulo() {
    if (mio) return { bytes: mio.docx, nome: mio.nome, tuo: true };
    if (!master) {
      const r = await fetch("variazione-master.docx?v=1");
      if (!r.ok) throw new Error("Non riesco a scaricare il modulo di variazione: controlla internet");
      master = new Uint8Array(await r.arrayBuffer());
    }
    return { bytes: master, nome: "Modulo variazione (master)", tuo: false };
  }

  // v = { mese, anno, sposta:[[vecchio,nuovo]], aggiungi:[nuovo], togli:[vecchio], sovr:bool, sovrTesto, data, pid }
  async function riempiWord(bytes, v) {
    const a = await apri(bytes), p = persone().find((x) => x.id === v.pid) || personaCorrente(), f = fissi(p);
    const dd = (g) => `${pad2(g)}/${pad2(v.mese)}/${v.anno}`;
    const mese = MESI[v.mese - 1];
    const righe = v.sposta.map(([o, n]) => [n, o]).concat(v.aggiungi.map((n) => [n, null])).sort((x, y) => x[0] - y[0]);
    if (righe.length > a.righe.length) throw new Error(`Il modulo ha ${a.righe.length} righe: al massimo ${a.righe.length} giorni nuovi per variazione`);
    const sost = (rx, fn) => { const q = a.trova(rx); if (q) metti(q, fn(testoP(q))); return q; };
    sost(R.sott, () => `Il Sottoscritto ${f.grado_nome}`);
    sost(R.serv, (t) => (/[–-]\s*[_\s]*$/.test(t) ? t.replace(/[–-]\s*[_\s]*$/, "– ") : t.replace(/[_\s]*$/, " ")) + (f.reparto || "____________"));
    sost(R.mod, (t) => {
      let k = 0;
      return t.replace(/_{3,}/g, () => (k++ === 0 ? mese : f.assistito || "_____"));
    });
    const pg = a.trova(R.giorni);
    if (pg) {
      const n = righe.length;
      metti(pg, n ? `giorni ${n} (${NUMERI[n] || n}) di permessi lavorativi mensili;` : "giorni ____ (__________) di permessi lavorativi mensili;");
      if (n) spunta(pg);
    }
    a.righe.forEach((q, i) => {
      const r = righe[i];
      metti(q, r ? `dal ${dd(r[0])} al ${dd(r[0])}   anziché dal ${r[1] ? dd(r[1]) : "____/____/______"}` : RIGA_VUOTA);
    });
    const nv = a.trova(R.nonvi);
    if (nv && v.togli.length) {
      const t = testoP(nv), gg = v.togli.slice().sort((x, y) => x - y).map(dd).join(", ");
      metti(nv, t.replace(/(giorn[oi])\s*[_\s\d/,]*$/i, `${v.togli.length > 1 ? "giorni" : "giorno"} ${gg}`));
      spunta(nv);
    }
    sost(R.ricov, (t) => t.replace(/_{3,}/, f.assistito || "_____"));
    const ns = sost(R.nessuno, (t) => { let k = 0; return t.replace(/_{3,}/g, () => (k++ === 0 ? mese : String(v.anno))); });
    if (ns) spunta(ns);
    const nsi = a.trova(R.nonsi), si = a.trova(R.si);
    if (v.sovr && si) { metti(si, testoP(si).replace(/:?\s*_{3,}\s*$/, ": " + (v.sovrTesto || "______________________________"))); spunta(si); }
    else if (nsi) spunta(nsi);
    const pd = a.ps.filter((q) => R.data.test(testoP(q))).pop();
    if (pd) metti(pd, `${testoP(pd).split(",")[0]}, ${v.data}`);
    a.z["word/document.xml"] = new TextEncoder().encode(new XMLSerializer().serializeToString(a.d));
    return fflate.zipSync(a.z);
  }

  async function crea(v) {
    const mod = await modulo();
    const docx = await riempiWord(mod.bytes, v);
    const { pdf } = await window.M104word.docxInPdf(docx);
    const { PDFDocument } = PDFLib, doc = await PDFDocument.load(pdf), pg = doc.getPages()[0];
    const firma = mem.get("m104_firma", null);
    if (firma) {
      const img = /^data:image\/jpe?g/.test(firma) ? await doc.embedJpg(b64bytes(firma.split(",")[1])) : await doc.embedPng(b64bytes(firma.split(",")[1]));
      let x = pg.getWidth() - 160, y = 120;
      try {
        await caricaPdfjs();
        const p1 = await (await pdfjsLib.getDocument({ data: pdf.slice(0) }).promise).getPage(1);
        const it = (await p1.getTextContent()).items.filter((q) => /richiedente/i.test(q.str));
        if (it.length) { const q = it[it.length - 1]; x = q.transform[4] + (q.width || 60) / 2; y = q.transform[5]; }
      } catch (e) { /* posizione predefinita */ }
      let w = 125, h = w * img.height / img.width; if (h > 42) { h = 42; w = h * img.width / img.height; }
      pg.drawImage(img, { x: Math.min(pg.getWidth() - 40 - w, x - w / 2), y: Math.max(25, y - 8 - h), width: w, height: h });
    }
    doc.setTitle(`Variazione programmazione 104 ${MESI[v.mese - 1]} ${v.anno}`);
    const f = fissi();
    const nome = `104 VARIAZIONE ${[f.cognome, MESI[v.mese - 1], v.anno].filter(Boolean).join(" ")}`.replace(/[<>:"/\\|?*]/g, "-") + ".pdf";
    return { blob: new Blob([await doc.save()], { type: "application/pdf" }), nome, testo: descrivi(v) };
  }
  function descrivi(v) {
    const p = [];
    v.sposta.slice().sort((x, y) => x[1] - y[1]).forEach(([o, n]) => p.push(`${pad2(n)} al posto del ${pad2(o)}`));
    v.aggiungi.slice().sort((x, y) => x - y).forEach((n) => p.push(`aggiunto il ${pad2(n)}`));
    if (v.togli.length) p.push(`tolto ${v.togli.slice().sort((x, y) => x - y).map(pad2).join(", ")}`);
    return p.join(" · ");
  }

  // ------------------------------------------------------------ pagina della variazione
  let st = null;   // { pid, anno, mese, orig:Set, sposta:Map(vecchio->nuovo), aggiungi:Set, togli:Set, scelto:null|g, attesa:null|g }
  function dopo() {
    const s = new Set(st.orig);
    for (const [o, n] of st.sposta) { s.delete(o); s.add(n); }
    for (const g of st.togli) s.delete(g);
    for (const g of st.aggiungi) s.add(g);
    return s;
  }
  const nuovi = () => new Set([...st.sposta.values(), ...st.aggiungi]);
  let origine = "s-archivio";
  function apriVar(pid, anno, mese, da) {
    origine = da || "s-archivio";
    $("var-indietro").dataset.vai = origine;
    $("var-indietro-t").textContent = origine === "s-varmese" ? "Mesi" : "Archivio";
    const r = registro(pid, anno, mese);
    if (!r) { toast("Prima crea il modulo 104 di questo mese"); return; }
    st = { pid, anno, mese, orig: new Set(r.nessuno || r.solo151 ? [] : r.giorni || []), sposta: new Map(), aggiungi: new Set(), togli: new Set(), scelto: null, attesa: null };
    const p = persone().find((x) => x.id === pid);
    $("var-titolo").textContent = `Variazione · ${MESI[mese - 1]} ${anno}`;
    $("var-chi").textContent = persone().length > 1 && p ? `Per ${p.nome}${p.parentela ? " (" + p.parentela + ")" : ""}` : "";
    const o = new Date();
    $("var-data").value = `${o.getFullYear()}-${pad2(o.getMonth() + 1)}-${pad2(o.getDate())}`;
    $("var-sovr-no").click();
    $("var-ris").hidden = true; $("var-sovr-testo").value = "";
    disegna();
    vai("s-var");
  }
  function msg(t, err) { const e = $("var-msg"); e.hidden = !t; e.textContent = t || ""; e.className = err ? "err" : "avviso"; }
  function disegna() {
    const { anno, mese } = st, fest = festivi(anno), oggi = new Date(), blocco = anag().bloccaWE !== false;
    const turni = new Set((mem.get("m104_turni", {})[`${anno}-${pad2(mese)}`]) || (registro(st.pid, anno, mese) || {}).turni || []);
    const altri = altri104(anno, mese, st.pid), nv = nuovi(), p = persone().find((x) => x.id === st.pid);
    const primo = new Date(anno, mese - 1, 1), vuoti = (primo.getDay() + 6) % 7, n = new Date(anno, mese, 0).getDate();
    const g = $("var-griglia"); g.innerHTML = "";
    for (let i = 0; i < vuoti; i++) { const s = document.createElement("span"); s.className = "cal-g vuoto"; g.append(s); }
    for (let d = 1; d <= n; d++) {
      const dt = new Date(anno, mese - 1, d), wd = dt.getDay(), we = wd === 0 || wd === 6, fe = fest[`${mese}-${d}`];
      const via = st.orig.has(d) && (st.sposta.has(d) || st.togli.has(d)), resta = st.orig.has(d) && !via, nuovo = nv.has(d), tu = turni.has(d), al = !resta && !nuovo ? altri[d] : null;
      const et = via ? (st.togli.has(d) ? "tolto" : `→ ${st.sposta.get(d)}`) : nuovo ? "nuovo" : resta ? etichetta104(p) : al ? al.et : tu ? "turno" : "";
      const b = document.createElement("button"); b.type = "button";
      b.innerHTML = `<span class="cal-n">${d}</span>${et ? `<small class="cal-et${et.length > 5 ? " lungo" : ""}">${et}</small>` : ""}`;
      b.className = "cal-g" + (we ? " we" + (blocco ? " bloc" : "") : "") + (fe ? " fe" : "") + (resta || nuovo ? ` sel t${tono104(st.pid)}` : "") + (nuovo ? " var-nuovo" : "") + (via ? " var-via" : "")
        + (al ? ` sel altro t${al.tono}` : "") + (tu ? " tu" : "") + (st.scelto === d || st.attesa === d ? " var-scelto" : "") + (dt.toDateString() === oggi.toDateString() ? " oggi" : "");
      b.setAttribute("aria-label", `${NOMI_G[wd]} ${d}${resta ? ", giorno 104 programmato" : ""}${nuovo ? ", nuovo giorno 104" : ""}${via ? ", giorno tolto" : ""}${tu ? ", turno" : ""}`);
      b.addEventListener("click", () => tocca(d));
      g.append(b);
    }
    // barra azioni sul giorno scelto
    const bar = $("var-azioni");
    if (st.scelto) {
      bar.hidden = false;
      $("var-az-testo").innerHTML = `<b>${NOMI_G[new Date(anno, mese - 1, st.scelto).getDay()]} ${st.scelto}</b>: cosa vuoi fare?`;
    } else bar.hidden = true;
    if (st.attesa) msg(`Ora tocca il nuovo giorno che prende il posto del ${st.attesa}.`);
    // riepilogo
    const dd = dopo(), righe = [];
    [...st.sposta].sort((x, y) => x[1] - y[1]).forEach(([o, nn]) => righe.push(`🔁 <b>${gg(nn)}</b> anziché ${gg(o)}`));
    [...st.aggiungi].sort((x, y) => x - y).forEach((nn) => righe.push(`➕ <b>${gg(nn)}</b> (giorno in più)`));
    [...st.togli].sort((x, y) => x - y).forEach((o) => righe.push(`✖ ${gg(o)}: non vi è più esigenza`));
    $("var-elenco").innerHTML = righe.length ? righe.map((x) => `<div>${x}</div>`).join("") : '<span class="muted">Nessuna modifica: tocca un giorno rosso per spostarlo o toglierlo, oppure un giorno libero per aggiungerlo.</span>';
    const c = $("var-conta"); c.textContent = `${dd.size} / 3 giorni`;
    c.className = "contatore" + (dd.size > 3 ? " oltre" : dd.size === 3 ? " ok" : "");
    $("var-crea").disabled = !righe.length || dd.size > 3 || !!st.attesa;
    const sulTurno = [...nv].filter((x) => turni.has(x));
    $("var-turno-avv").hidden = !sulTurno.length;
    $("var-turno-avv").textContent = sulTurno.length ? `Attenzione: ${sulTurno.map((x) => gg(x)).join(", ")} ${sulTurno.length > 1 ? "sono tuoi turni" : "è un tuo turno"} di servizio. Se è così, scegli «Sì, si sovrappongono» qui sotto.` : "";
  }
  const gg = (d) => `${BREVI_G[new Date(st.anno, st.mese - 1, d).getDay()]} ${pad2(d)}`;
  function tocca(d) {
    msg("");
    const { anno, mese } = st, wd = new Date(anno, mese - 1, d).getDay(), we = wd === 0 || wd === 6, fe = festivi(anno)[`${mese}-${d}`];
    const Gg = NOMI_G[wd][0].toUpperCase() + NOMI_G[wd].slice(1);
    // annulla una modifica già fatta
    for (const [o, n] of st.sposta) if (n === d || o === d) { st.sposta.delete(o); st.scelto = null; st.attesa = null; disegna(); return; }
    if (st.togli.has(d)) { st.togli.delete(d); disegna(); return; }
    if (st.aggiungi.has(d)) { st.aggiungi.delete(d); disegna(); return; }
    if (st.orig.has(d)) {
      if (st.attesa) { msg("Scegli un giorno libero, non uno già programmato.", true); return; }
      st.scelto = st.scelto === d ? null : d; disegna(); return;
    }
    const al = altri104(anno, mese, st.pid)[d];
    if (al) { msg(`${Gg} ${d} è già un giorno di 104 per ${al.nome}: scegli un altro giorno.`, true); return; }
    if (we && anag().bloccaWE !== false) { msg(`${Gg} ${d}: sabato e domenica sono bloccati (puoi sbloccarli in Anagrafica → Impostazioni).`, true); return; }
    if (st.attesa) { st.sposta.set(st.attesa, d); st.attesa = null; st.scelto = null; }
    else {
      if (dopo().size >= 3) { msg("Hai già 3 giorni nel mese: prima sposta o togli un giorno rosso.", true); return; }
      st.aggiungi.add(d); st.scelto = null;
    }
    disegna();
    if (fe) msg(`Attenzione: il ${d} ${MESI[mese - 1].toLowerCase()} è festivo (${fe}).`);
    else if (we) msg(`Attenzione: hai scelto ${NOMI_G[wd]} ${d}, è un fine settimana.`);
  }
  $("var-sposta").addEventListener("click", () => { st.attesa = st.scelto; st.scelto = null; disegna(); });
  $("var-togli").addEventListener("click", () => { st.togli.add(st.scelto); st.scelto = null; disegna(); });
  $("var-annulla").addEventListener("click", () => { st.scelto = null; st.attesa = null; msg(""); disegna(); });
  const sovr = (si) => {
    $("var-sovr-no").classList.toggle("on", !si); $("var-sovr-si").classList.toggle("on", si);
    $("var-sovr-box").hidden = !si;
  };
  $("var-sovr-no").addEventListener("click", () => sovr(false));
  $("var-sovr-si").addEventListener("click", () => sovr(true));
  let ultimo = null;
  $("var-crea").addEventListener("click", async () => {
    if (!anag().cognome) { toast("Prima compila l'anagrafica"); vai("s-anag"); return; }
    const b = $("var-crea"), t = b.textContent; b.disabled = true; b.textContent = "Preparo il PDF…";
    const dc = $("var-data").value;
    const v = { pid: st.pid, mese: st.mese, anno: st.anno, sposta: [...st.sposta], aggiungi: [...st.aggiungi], togli: [...st.togli],
      sovr: $("var-sovr-si").classList.contains("on"), sovrTesto: $("var-sovr-testo").value.trim(), data: dc ? dc.split("-").reverse().join("/") : fmt(new Date()) };
    const prima = mem.get("m104_persona", null); mem.set("m104_persona", st.pid);
    try {
      ultimo = await crea(v);
      registraVar(v);
      $("var-ris").hidden = false; $("var-ris-nome").textContent = ultimo.nome;
      anteprimaIn($("var-anteprima"), ultimo.blob);
      $("var-ris").scrollIntoView({ behavior: "smooth" });
      toast("Variazione creata e salvata in archivio ✔");
    } catch (e) { console.error(e); msg(e.message, true); }
    finally { mem.set("m104_persona", prima); b.textContent = t; b.disabled = false; }
  });
  function registraVar(v) {
    const a = archivio(), k = `${v.anno}-${pad2(v.mese)}`, r = a[v.pid] && a[v.pid][k];
    if (!r) return;
    if (!r.prog) r.prog = { giorni: (r.giorni || []).slice(), nessuno: !!r.nessuno, motivo: r.motivo || "", solo151: !!r.solo151 };
    const s = new Set(r.nessuno || r.solo151 ? [] : r.giorni || []);
    v.sposta.forEach(([o, n]) => { s.delete(o); s.add(n); }); v.togli.forEach((g) => s.delete(g)); v.aggiungi.forEach((g) => s.add(g));
    r.giorni = [...s].sort((x, y) => x - y);
    if (r.giorni.length) { r.nessuno = false; r.solo151 = false; r.motivo = ""; }
    r.var = (r.var || []).concat({ data: v.data, creato: fmt(new Date()), sposta: v.sposta, aggiungi: v.aggiungi, togli: v.togli, sovr: v.sovr, sovrTesto: v.sovrTesto });
    mem.set("m104_archivio", a);
    // la variazione riparte dai giorni nuovi
    st.orig = new Set(r.giorni); st.sposta.clear(); st.aggiungi.clear(); st.togli.clear();
    disegna();
  }
  async function condividi(x) {
    const file = new File([x.blob], x.nome, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: x.nome.replace(/\.pdf$/, ""), text: `Variazione programmazione permessi L.104/92 – ${x.testo}` }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    apriFile(x, false);
  }
  function apriFile(x, stampa) {
    const url = URL.createObjectURL(x.blob), a = document.createElement("a");
    a.href = url; a.target = "_blank"; if (!stampa) a.download = x.nome; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    if (stampa) toast("Si apre il file: da lì scegli Stampa");
  }
  $("var-condividi").addEventListener("click", () => ultimo && condividi(ultimo));
  $("var-apri").addEventListener("click", () => ultimo && apriFile(ultimo, true));
  $("var-anteprima").addEventListener("click", () => ultimo && apriFile(ultimo, true));
  $("var-chiudi").addEventListener("click", () => vai(origine === "s-varmese" ? "s-home" : origine));

  // ------------------------------------------------------------ accesso rapido dal menu: scegli il mese
  function elencoMesi() {
    const a = archivio(), ps = persone(), oggi = new Date(), kOggi = `${oggi.getFullYear()}-${pad2(oggi.getMonth() + 1)}`;
    const voci = [];
    for (const [pid, mesi] of Object.entries(a)) {
      const p = ps.find((x) => x.id === pid); if (!p) continue;
      for (const [k, r] of Object.entries(mesi)) {
        if (!r || r.solo151) continue;
        voci.push({ pid, p, k, r, anno: +k.slice(0, 4), mese: +k.slice(5, 7) });
      }
    }
    // prima il mese in corso e quelli futuri (dal più vicino), poi i passati (dal più recente)
    const fut = voci.filter((v) => v.k >= kOggi).sort((x, y) => x.k.localeCompare(y.k));
    const pas = voci.filter((v) => v.k < kOggi).sort((x, y) => y.k.localeCompare(x.k)).slice(0, 6);
    const box = $("vm-elenco");
    const tutte = fut.concat(pas);
    if (!tutte.length) {
      box.innerHTML = `<div class="card"><p class="muted">Non hai ancora programmato nessun mese. Prima usa <b>Compila il mese</b>: poi da qui potrai cambiarne i giorni.</p><button class="btn" data-vai="s-compila">Compila il mese</button></div>`;
      return;
    }
    const piu = ps.length > 1;
    box.innerHTML = tutte.map((v, i) => {
      const gg = v.r.nessuno ? '<small>Nessun permesso chiesto (puoi aggiungere giorni)</small>'
        : `<div class="vm-giorni">${(v.r.giorni || []).map((d) => `<span>${BREVI_G[new Date(v.anno, v.mese - 1, d).getDay()]} ${pad2(d)}</span>`).join("")}</div>`;
      const nv = (v.r.var || []).length;
      return `<button class="vm-riga" data-i="${i}"><span class="vm-t"><b>${MESI[v.mese - 1]} ${v.anno}</b>${piu ? `<small>${esc(etichetta104(v.p))} · ${esc(v.p.nome)}</small>` : ""}${gg}${nv ? `<small>🔁 già variato ${nv === 1 ? "una volta" : nv + " volte"}</small>` : ""}</span><span class="vm-var">Varia ›</span></button>`;
    }).join("") + (pas.length ? '<p class="muted" style="margin-top:.8rem">Mostro il mese in corso, i prossimi e gli ultimi passati. Gli altri sono in Archivio.</p>' : "");
    box.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => { const v = tutte[+b.dataset.i]; apriVar(v.pid, v.anno, v.mese, "s-varmese"); }));
  }

  // ristampa / condividi una variazione già fatta (dall'Archivio)
  async function documento(pid, anno, mese, i, az) {
    const r = registro(pid, anno, mese), x = r && r.var && r.var[i];
    if (!x) return;
    const prima = mem.get("m104_persona", null); mem.set("m104_persona", pid);
    try {
      const out = await crea({ pid, anno, mese, sposta: x.sposta, aggiungi: x.aggiungi || [], togli: x.togli || [], sovr: !!x.sovr, sovrTesto: x.sovrTesto || "", data: x.data });
      if (az === "condividi") await condividi(out); else apriFile(out, true);
    } catch (e) { toast("Errore: " + e.message, 5000); }
    finally { mem.set("m104_persona", prima); }
  }

  // ------------------------------------------------------------ modulo caricato dall'utente
  async function carica() { try { mio = await idbGet("mvar"); } catch (e) { mio = null; } return mio; }
  async function salva(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error("Serve il Word (.docx) del modulo di variazione");
    const info = await analizza(bytes);
    mio = { nome: file.name.replace(/\.docx?$/i, ""), caricato: fmt(new Date()), docx: bytes, righe: info.righe };
    await idbSet("mvar", mio);
    return mio;
  }
  async function togli() { mio = null; await idbSet("mvar", null); }
  function mostraStato() {
    $("stato-var").className = "stato-mod ok";
    $("stato-var").innerHTML = mio ? `✔ <b>Usi il tuo modulo di variazione</b><br>«${esc(mio.nome)}» · caricato il ${esc(mio.caricato)} · ${mio.righe} righe per i giorni`
      : "✔ <b>Modulo di variazione master</b> già pronto nell'app: non devi caricare niente.";
    $("b-togli-var").style.display = mio ? "" : "none";
    $("anteprima-var").style.display = "none";
  }
  $("file-var").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    try { await salva(file); toast("Modulo di variazione caricato ✔"); mostraStato(); $("b-vedi-var").click(); }
    catch (err) { toast(err.message, 6000); }
  });
  $("b-togli-var").addEventListener("click", async () => { if (!confirm("Togliere il tuo modulo di variazione? Tornerà quello master.")) return; await togli(); mostraStato(); toast("Ora usi il modulo master"); });
  $("b-vedi-var").addEventListener("click", async () => {
    const box = $("anteprima-var"); box.style.display = ""; box.innerHTML = '<p class="muted">Preparo l’anteprima…</p>';
    try {
      const mod = await modulo(), o = new Date();
      const docx = await riempiWord(mod.bytes, { pid: (personaCorrente() || {}).id, mese: o.getMonth() + 1, anno: o.getFullYear(), sposta: [], aggiungi: [], togli: [], sovr: false, data: fmt(o) });
      const { pdf } = await window.M104word.docxInPdf(docx);
      anteprimaIn(box, new Blob([pdf], { type: "application/pdf" }));
    } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  });

  window.M104var = { elencoMesi, apri: apriVar, documento, crea, descrivi, carica, mostraStato, _riempi: riempiWord, _stato: () => st };
  carica().then(mostraStato);
})();
