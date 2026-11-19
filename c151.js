/* Modulo 104 - congedo straordinario art. 42 D.Lgs. 151/2001 (facoltativo).
   Ognuno carica il SUO Word della 151 (con le sue diciture): l'app non tocca il testo,
   riempie solo le righe «Di fruire di un periodo di giorni … dal … al …», il totale
   «già fruito di numero giorni …», la data «…, lì …» e aggiunge la firma. */
"use strict";
(function () {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const MAX_GIORNI = 730;   // due anni
  const R_RIGA = /fruire\s+di\s+un\s+periodo\s+di\s+giorni/i;
  const R_TOT = /fruito\s+di\s+numero\s+giorni/i;
  const R_DATA = /,\s*l[ìi]['’]?(?=[\s_\d]|$)/i;
  const VUOTA = "_____ dal ____/____/______ al ____/____/______;";
  let modulo = null;   // { nome, caricato, docx: Uint8Array, righe }

  const testoP = (p) => Array.from(p.getElementsByTagNameNS(W, "t")).map((t) => t.textContent).join("");
  function metti(p, s) {
    const ts = Array.from(p.getElementsByTagNameNS(W, "t"));
    if (!ts.length) return;
    ts[0].textContent = s; ts[0].setAttribute("xml:space", "preserve");
    for (const t of ts.slice(1)) t.textContent = "";
  }
  async function apri(bytes) {
    if (!window.fflate) await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "lib/fflate.min.js"; s.onload = ok; s.onerror = ko; document.head.append(s); });
    const z = fflate.unzipSync(bytes);
    if (!z["word/document.xml"]) throw new Error("Questo file non è un Word (.docx)");
    const d = new DOMParser().parseFromString(new TextDecoder().decode(z["word/document.xml"]), "application/xml");
    const ps = Array.from(d.getElementsByTagNameNS(W, "p"));
    return { z, d, righe: ps.filter((p) => R_RIGA.test(testoP(p))), tot: ps.find((p) => R_TOT.test(testoP(p))) || null,
      data: ps.filter((p) => R_DATA.test(testoP(p)) && testoP(p).length < 80).pop() || null };
  }
  // controlla il Word appena scelto
  async function analizza(bytes) {
    const a = await apri(bytes);
    if (!a.righe.length) throw new Error("Non trovo le righe «Di fruire di un periodo di giorni … dal … al …»: è il Word della 151?");
    return { righe: a.righe.length, tot: !!a.tot, data: !!a.data };
  }
  // Word compilato: solo le righe dei giorni, il totale e la data
  async function riempiWord(bytes, periodi, mese, anno, gia, data) {
    const a = await apri(bytes), mm = String(mese).padStart(2, "0");
    const dd = (g) => `${String(g).padStart(2, "0")}/${mm}/${anno}`;
    a.righe.forEach((p, i) => {
      const t = testoP(p), pre = (t.match(/^.*?periodo\s+di\s+giorni/i) || ["Di fruire di un periodo di giorni"])[0];
      const per = periodi[i];
      metti(p, per ? `${pre} ${per[1] - per[0] + 1} dal ${dd(per[0])} al ${dd(per[1])};` : `${pre} ${VUOTA}`);
    });
    if (a.tot) { const t = testoP(a.tot); metti(a.tot, t.replace(/(numero\s+giorni)\s*[_\d\s.]*/i, `$1 ${gia === null ? "_____" : gia} `)); }
    if (a.data) { const t = testoP(a.data); metti(a.data, t.replace(/(,\s*l[ìi]['’]?)[\s\S]*$/i, `$1 ${data}`)); }
    a.z["word/document.xml"] = new TextEncoder().encode(new XMLSerializer().serializeToString(a.d));
    return fflate.zipSync(a.z);
  }
  // giorni 151 già fruiti prima di questo mese: numero iniziale dell'anagrafica + archivio (tutte le persone)
  function giaFruiti(mese, anno) {
    const a = anag(), k = `${anno}-${String(mese).padStart(2, "0")}`;
    let n = Math.max(0, parseInt(a.g151_iniziali, 10) || 0);
    for (const per of Object.values(archivio())) for (const [km, r] of Object.entries(per)) if (km < k && r.g151) n += r.g151.length;
    return n;
  }
  function totaleFruito() {
    const a = anag(); let n = Math.max(0, parseInt(a.g151_iniziali, 10) || 0);
    for (const per of Object.values(archivio())) for (const r of Object.values(per)) if (r.g151) n += r.g151.length;
    return n;
  }
  async function crea(m) {
    if (!modulo) throw new Error("Carica prima il Word della 151 in «Modulo da compilare»");
    const periodi = periodiDa(m.g151 || []);
    if (periodi.length > modulo.righe) throw new Error(`Il tuo modulo 151 ha ${modulo.righe} righe: al massimo ${modulo.righe} periodi al mese`);
    const vuoto = !!anag().g151_vuoto;
    const docx = await riempiWord(modulo.docx, periodi, m.mese, m.anno, vuoto ? null : giaFruiti(m.mese, m.anno), m.data);
    const { pdf } = await window.M104word.docxInPdf(docx);
    // firma in basso a destra, sotto la riga della data
    const { PDFDocument } = PDFLib, doc = await PDFDocument.load(pdf), pg = doc.getPages()[0];
    const firma = mem.get("m104_firma", null);
    if (firma) {
      const img = /^data:image\/jpe?g/.test(firma) ? await doc.embedJpg(b64bytes(firma.split(",")[1])) : await doc.embedPng(b64bytes(firma.split(",")[1]));
      let yData = 140;
      try {
        await caricaPdfjs();
        const p1 = await (await pdfjsLib.getDocument({ data: pdf.slice(0) }).promise).getPage(1);
        const it = (await p1.getTextContent()).items.filter((x) => /l[ìi]['’]?$|l[ìi]\s/i.test(x.str) || x.str.includes(m.data));
        if (it.length) yData = it[it.length - 1].transform[5];
      } catch (e) { /* posizione predefinita */ }
      let w = 130, h = w * img.height / img.width; if (h > 45) { h = 45; w = h * img.width / img.height; }
      pg.drawImage(img, { x: pg.getWidth() - 70 - w, y: Math.max(30, yData - 22 - h), width: w, height: h });
    }
    doc.setTitle(`Congedo 151 ${MESI[m.mese - 1]} ${m.anno}`);
    const f = fissi(), mese = MESI[m.mese - 1];
    const nome = `CONGEDO 151 ${[f.cognome, mese, m.anno].filter(Boolean).join(" ")}`.replace(/[<>:"/\\|?*]/g, "-") + ".pdf";
    const testo = periodi.map(([x, y]) => (x === y ? `${String(x).padStart(2, "0")}/${String(m.mese).padStart(2, "0")}/${m.anno}` : `dal ${String(x).padStart(2, "0")}/${String(m.mese).padStart(2, "0")} al ${String(y).padStart(2, "0")}/${String(m.mese).padStart(2, "0")}/${m.anno}`)).join(", ");
    return { blob: new Blob([await doc.save()], { type: "application/pdf" }), nome, periodi: testo };
  }
  async function carica() { try { modulo = await idbGet("m151"); } catch (e) { modulo = null; } return modulo; }
  async function salva(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error("Serve il Word (.docx) della 151");
    const info = await analizza(bytes);
    modulo = { nome: file.name.replace(/\.docx?$/i, ""), caricato: fmt(new Date()), docx: bytes, righe: info.righe, tot: info.tot, data: info.data };
    await idbSet("m151", modulo);
    return modulo;
  }
  async function togli() { modulo = null; await idbSet("m151", null); }
  window.M151 = { carica, salva, togli, crea, giaFruiti, totaleFruito, MAX_GIORNI, attuale: () => modulo };
  carica().then(() => { if (typeof pronto151 === "function") pronto151(); });
})();
