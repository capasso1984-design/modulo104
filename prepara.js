/* Modulo 104 - preparazione del modulo dal telefono, partendo da un PDF (senza PC).
   Legge il PDF con pdf.js, trova le righe "____" e le caselle, propone cosa metterci,
   e salva un pacchetto .m104 uguale a quello fatto dal PC. Tutto resta sul telefono. */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const OPZ_CAMPO = [
    ["vuoto", "— lascia vuoto —"], ["firma", "Firma"],
    ["fisso:grado_nome", "Grado, categoria, cognome e nome"], ["fisso:reparto", "Reparto"],
    ["fisso:assistito", "Persona assistita"], ["fisso:parentela", "Grado di parentela"],
    ["fisso:grado", "Grado"], ["fisso:cognome_nome", "Cognome e nome"], ["fisso:extra1", "Altro dato fisso 1"], ["fisso:extra2", "Altro dato fisso 2"],
    ["var:mese", "Mese"], ["var:anno", "Anno"], ["var:mese_anno", "Mese e anno"],
    ["var:giorni_lettere", "Numero giorni in lettere"], ["var:giorni_numero", "Numero giorni in cifre"],
    ["var:data_compilazione", "Data di compilazione"], ["var:motivo", "Motivo (se non chiedi permessi)"],
  ];
  for (let i = 1; i <= 3; i++) OPZ_CAMPO.push([`var:dal${i}`, `Periodo ${i}: dal`], [`var:al${i}`, `Periodo ${i}: al`]);
  for (let i = 1; i <= 8; i++) OPZ_CAMPO.push([`var:og${i}_giorno`, `Permesso orario ${i}: giorno`], [`var:og${i}_dalle`, `Permesso orario ${i}: dalle`], [`var:og${i}_alle`, `Permesso orario ${i}: alle`]);
  const OPZ_CASELLA = [["sempre", "Sempre spuntata"], ["mai", "Mai spuntata"], ["se_giorni", "Se chiedo giorni"], ["se_orari", "Se chiedo permessi orari"], ["se_nessuno", "Se non chiedo permessi"]];

  let stato = null; // {nome, bytes, pagine:[{w,h,righe,rett}], campi:[], caselle:[]}

  // larghezza approssimata dei caratteri (Times), in em
  function largh(ch) {
    if (ch === "_") return 0.5; if (ch === " ") return 0.25; if ("/.,;:'".includes(ch)) return 0.278;
    if (/[0-9]/.test(ch)) return 0.5; if (/[A-Z]/.test(ch)) return 0.68; if (/[fijlrt]/.test(ch)) return 0.3; if (/[mw]/.test(ch)) return 0.75;
    return 0.47;
  }

  async function caricaPdfjs() {
    if (window.pdfjsLib) return;
    await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "lib/pdf.min.js"; s.onload = ok; s.onerror = ko; document.head.append(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
  }

  // ------------------------------------------------------------ analisi
  async function analizza(bytes) {
    await caricaPdfjs();
    const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const pagine = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n);
      const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      const pezzi = [];
      for (const it of tc.items) {
        if (!it.str) continue;
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const size = Math.hypot(it.transform[2], it.transform[3]) || 10;
        pezzi.push({ s: it.str, x, b: y, w: it.width * (vp.scale || 1), size });
      }
      pagine.push({ n, w: vp.width, h: vp.height, pezzi, rett: await rettangoli(pg, vp), pg, vp });
    }
    return pagine;
  }

  // caselle disegnate: piccoli rettangoli nel PDF
  async function rettangoli(pg, vp) {
    const out = [];
    try {
      const ops = await pg.getOperatorList();
      const O = pdfjsLib.OPS;
      let ctm = [1, 0, 0, 1, 0, 0]; const pila = [];
      const molt = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
      const punto = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const f = ops.fnArray[i], a = ops.argsArray[i];
        if (f === O.save) pila.push(ctm);
        else if (f === O.restore) ctm = pila.pop() || [1, 0, 0, 1, 0, 0];
        else if (f === O.transform) ctm = molt(ctm, a);
        else if (f === O.constructPath) {
          const sub = a[0], args = a[1]; let k = 0;
          const pts = [];
          for (const op of sub) {
            if (op === O.rectangle) {
              const [rx, ry, rw, rh] = args.slice(k, k + 4); k += 4;
              pts.push([[rx, ry], [rx + rw, ry + rh]]);
            } else if (op === O.moveTo || op === O.lineTo) { pts.push([[args[k], args[k + 1]]]); k += 2; }
            else if (op === O.curveTo) k += 6; else if (op === O.curveTo2 || op === O.curveTo3) k += 4;
          }
          const tutti = pts.flat().map(([px, py]) => vp.convertToViewportPoint(...punto(ctm, px, py)));
          if (tutti.length < 2) continue;
          const xs = tutti.map((p) => p[0]), ys = tutti.map((p) => p[1]);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          const w = x1 - x0, h = y1 - y0;
          if (w >= 4 && w <= 26 && h >= 3 && h <= 22) out.push({ x: x0, y: y0, w, h });
        }
      }
    } catch (e) { /* niente caselle trovate */ }
    // toglie i doppioni (bordo + riempimento)
    return out.filter((r, i) => !out.slice(0, i).some((q) => Math.abs(q.x - r.x) < 2 && Math.abs(q.y - r.y) < 2));
  }

  // righe "____" con la loro posizione
  function trovaCampi(pagine) {
    const campi = [];
    for (const p of pagine) {
      const grezzi = [];
      for (const z of p.pezzi) {
        const re = /_{3,}/g; let m;
        const pesi = Array.from(z.s).map(largh), tot = pesi.reduce((a, b) => a + b, 0) || 1, sc = z.w / tot;
        const xDi = (i) => z.x + pesi.slice(0, i).reduce((a, b) => a + b, 0) * sc;
        while ((m = re.exec(z.s))) grezzi.push({ pag: p.n, x: xDi(m.index), x2: xDi(m.index + m[0].length), b: z.b, size: z.size, t: m[0], z0: z, i0: m.index, z1: z, i1: m.index + m[0].length });
      }
      grezzi.sort((a, b) => (Math.abs(a.b - b.b) > 1.5 ? a.b - b.b : a.x - b.x));
      // unisce i pezzi vicini sulla stessa riga (es. date "__/__/____")
      for (const g of grezzi) {
        const u = campi[campi.length - 1];
        if (u && u.pag === g.pag && Math.abs(u.b - g.b) < 1.5 && g.x - u.x2 < 6) {
          if (g.x - u.x2 > 0.8) u.t += "/"; u.t += g.t; u.x2 = g.x2; u.z1 = g.z1; u.i1 = g.i1;
        } else campi.push({ ...g });
      }
    }
    // testo prima e dopo sulla stessa riga, per capire cosa va scritto
    for (const c of campi) {
      const p = pagine[c.pag - 1];
      const riga = p.pezzi.filter((z) => Math.abs(z.b - c.b) < 2.5).sort((a, b) => a.x - b.x);
      const i0 = riga.indexOf(c.z0), i1 = riga.indexOf(c.z1);
      c.prima = (riga.slice(0, i0).map((z) => z.s).join("") + c.z0.s.slice(0, c.i0)).replace(/[_\s/]+$/, " ").replace(/^\s+$/, "");
      c.dopo = c.z1.s.slice(c.i1) + riga.slice(i1 + 1).map((z) => z.s).join("");
      // se lo spazio è all'inizio della riga, guarda la fine della riga sopra
      if (!c.prima.trim()) {
        const sopra = p.pezzi.filter((z) => z.b < c.b - 3 && z.b > c.b - 30);
        const bmax = Math.max(...sopra.map((z) => z.b), -1);
        c.sopra = sopra.filter((z) => Math.abs(z.b - bmax) < 2).sort((a, b) => a.x - b.x).map((z) => z.s).join("");
      }
      c.y = c.b - c.size * 0.86;
      delete c.z0; delete c.z1;
    }
    return campi;
  }

  function indovinaCampi(campi) {
    let nDal = 0, nOg = 0;
    for (const c of campi) {
      const b = (c.prima || c.sopra || "").replace(/_+/g, " ").trim().toLowerCase();
      const a = (c.dopo || "").replace(/_+/g, " ").trim().toLowerCase();
      const coda = b.slice(-25);
      let v = "vuoto";
      if (!c.prima.trim() && /richiedente/i.test(c.sopra || "")) v = "firma";
      else if (!c.prima.trim() && !c.sopra) v = "vuoto";
      else if (coda.includes("sottoscritto")) v = "fisso:grado_nome";
      else if (/[-–]$/.test(b) && /servizio presso|aeroporto|comando/.test(b)) v = "fisso:reparto";
      else if (/mese( di)?$/.test(b)) v = /^anno/.test(a) || a.slice(0, 15).includes("anno") ? "var:mese" : "var:mese_anno";
      else if (/anno$/.test(b)) v = "var:anno";
      else if (/sig\.?(re\/ra)?$/.test(b)) v = "fisso:assistito";
      else if (coda.includes("parentela")) v = "fisso:parentela";
      else if (/giorni$/.test(b)) v = "var:giorni_lettere";
      else if (/\($/.test(b) && b.slice(-30).includes("giorni")) v = "var:giorni_numero";
      else if (/(^|\s)dal$/.test(b)) { nDal++; v = nDal <= 3 ? `var:dal${nDal}` : "vuoto"; }
      else if (/(^|\s)al$/.test(b)) v = nDal >= 1 && nDal <= 3 ? `var:al${nDal}` : "vuoto";
      else if (/il giorno$/.test(b)) { nOg++; v = nOg <= 8 ? `var:og${nOg}_giorno` : "vuoto"; }
      else if (/dalle ore$/.test(b)) v = nOg >= 1 && nOg <= 8 ? `var:og${nOg}_dalle` : "vuoto";
      else if (/alle ore$/.test(b)) v = nOg >= 1 && nOg <= 8 ? `var:og${nOg}_alle` : "vuoto";
      else if (/,$/.test(b) && b.length < 40) v = "var:data_compilazione";
      else if (coda.includes("in quanto")) v = "var:motivo";
      c.a = v;
    }
  }

  function testoAccanto(p, r) {
    return p.pezzi.filter((z) => z.x > r.x + r.w - 1 && Math.abs(z.b - (r.y + r.h)) < 9).sort((a, b) => a.x - b.x).map((z) => z.s).join("").trim();
  }
  function regolaCasella(t) {
    t = t.toLowerCase();
    if (t.includes("non si sovrappongono")) return "sempre";
    if (t.includes("sovrappongono")) return "mai";
    if (t.includes("orari")) return "se_orari";
    if (t.includes("lavorativi") || t.includes("mensili")) return "se_giorni";
    if (t.includes("non richiede")) return "se_nessuno";
    if (t.includes("nessun altro")) return "sempre";
    return "mai";
  }
  function trovaCaselle(pagine) {
    const out = [];
    for (const p of pagine) for (const r of p.rett) {
      const t = testoAccanto(p, r);
      if (!t) continue; // un rettangolo senza testo accanto non è una casella
      out.push({ pag: p.n, x: r.x, y: r.y, w: r.w, h: r.h, testo: t.slice(0, 70), regola: regolaCasella(t) });
    }
    return out.sort((a, b) => a.pag - b.pag || a.y - b.y);
  }
  // un campo segue la casella sopra di lui (vicina): resta vuoto se la casella non è spuntata
  function collegaCaselle() {
    for (const c of stato.campi) {
      const cand = stato.caselle.filter((k) => k.pag === c.pag && k.y <= c.b + 2 && c.b - k.y < 60);
      const k = cand.sort((a, b) => b.y - a.y)[0];
      c.casella = k ? stato.caselle.indexOf(k) : null;
    }
  }

  // ------------------------------------------------------------ interfaccia
  async function apriPdf(file) {
    const box = $("prep-stato");
    box.textContent = "Leggo il PDF…";
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pagine = await analizza(bytes);
      const campi = trovaCampi(pagine);
      indovinaCampi(campi);
      stato = { nome: file.name.replace(/\.pdf$/i, ""), bytes, pagine, campi, caselle: trovaCaselle(pagine) };
      collegaCaselle();
      box.textContent = `Trovati ${campi.length} spazi da compilare e ${stato.caselle.length} caselle. Controlla le scelte qui sotto.`;
      await disegna();
      elenco();
      $("prep-salva").disabled = false;
    } catch (e) {
      console.error(e);
      box.textContent = "Non riesco a leggere questo PDF. Prova a crearlo di nuovo (Stampa → Salva come PDF).";
    }
  }

  async function disegna() {
    const cont = $("prep-pagine"); cont.innerHTML = "";
    for (const p of stato.pagine) {
      const larg = cont.clientWidth || 340, sc = larg / p.w, dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = p.pg.getViewport({ scale: sc * dpr });
      const wrap = document.createElement("div"); wrap.className = "prep-pag"; wrap.style.height = p.h * sc + "px";
      const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; cv.style.width = "100%";
      wrap.append(cv); cont.append(wrap);
      await p.pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      p.sc = sc; p.wrap = wrap;
      wrap.addEventListener("click", (e) => tocco(p, e));
    }
    segni();
  }
  function segni() {
    for (const p of stato.pagine) {
      p.wrap.querySelectorAll(".prep-segno").forEach((x) => x.remove());
      stato.campi.forEach((c, i) => {
        if (c.pag !== p.n) return;
        const d = document.createElement("div"); d.className = "prep-segno prep-campo" + (c.a === "vuoto" ? " is-vuoto" : "");
        Object.assign(d.style, { left: c.x * p.sc + "px", top: (c.b - c.size) * p.sc + "px", width: Math.max(10, (c.x2 - c.x) * p.sc) + "px", height: c.size * 1.25 * p.sc + "px" });
        d.textContent = i + 1; d.dataset.campo = i; p.wrap.append(d);
      });
      stato.caselle.forEach((k, i) => {
        if (k.pag !== p.n) return;
        const d = document.createElement("div"); d.className = "prep-segno prep-casella";
        Object.assign(d.style, { left: (k.x - 3) * p.sc + "px", top: (k.y - 3) * p.sc + "px", width: (k.w + 6) * p.sc + "px", height: (k.h + 6) * p.sc + "px" });
        d.textContent = "C" + (i + 1); d.dataset.casella = i; p.wrap.append(d);
      });
    }
  }
  // tocco sul modulo: su un campo apre la sua scelta, altrove aggiunge una casella
  function tocco(p, e) {
    const t = e.target.closest(".prep-segno");
    if (t) { const el = document.querySelector(t.dataset.campo !== undefined ? `#prep-c${t.dataset.campo}` : `#prep-k${t.dataset.casella}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.focus(); return; }
    const r = p.wrap.getBoundingClientRect(), x = (e.clientX - r.left) / p.sc, y = (e.clientY - r.top) / p.sc;
    // aggancia al rettangolo disegnato più vicino, se c'è
    const vic = p.rett.map((q) => ({ q, d: Math.hypot(q.x + q.w / 2 - x, q.y + q.h / 2 - y) })).sort((a, b) => a.d - b.d)[0];
    const k = vic && vic.d < 18 ? { ...vic.q } : { x: x - 7, y: y - 4.5, w: 14, h: 9 };
    if (stato.caselle.some((c) => c.pag === p.n && Math.abs(c.x - k.x) < 4 && Math.abs(c.y - k.y) < 4)) return;
    if (!confirm("Aggiungo una casella in questo punto?")) return;
    const testo = testoAccanto(p, k);
    stato.caselle.push({ pag: p.n, ...k, testo: testo.slice(0, 70), regola: regolaCasella(testo) });
    stato.caselle.sort((a, b) => a.pag - b.pag || a.y - b.y);
    collegaCaselle(); segni(); elenco();
  }
  function opzioni(lista, sel) { return lista.map(([v, l]) => `<option value="${v}"${v === sel ? " selected" : ""}>${l}</option>`).join(""); }
  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function elenco() {
    const h = [];
    h.push('<h2 class="shub__sezione">Spazi da compilare</h2><div class="shub__elenco">');
    stato.campi.forEach((c, i) => {
      const ctx = (c.prima || c.sopra || "").replace(/_+/g, "…").slice(-38);
      const dip = c.casella !== null ? ` · solo se C${c.casella + 1} è spuntata` : "";
      h.push(`<div class="prep-voce"><span class="prep-num">${i + 1}</span><div class="prep-dx"><small>…${esc(ctx)} [____] ${esc((c.dopo || "").replace(/_+/g, "…").slice(0, 18))}${dip}</small>
        <select id="prep-c${i}" data-i="${i}">${opzioni(OPZ_CAMPO, c.a)}</select></div></div>`);
    });
    h.push("</div>");
    h.push('<h2 class="shub__sezione">Caselle</h2><div class="shub__elenco">');
    if (!stato.caselle.length) h.push('<div class="prep-voce"><small>Nessuna casella trovata. Tocca il modulo dove c\'è una casella per aggiungerla.</small></div>');
    stato.caselle.forEach((k, i) => {
      h.push(`<div class="prep-voce"><span class="prep-num prep-num--c">C${i + 1}</span><div class="prep-dx"><small>${esc(k.testo || "(senza testo)")}</small>
        <div class="row"><select id="prep-k${i}" data-k="${i}">${opzioni(OPZ_CASELLA, k.regola)}</select><button class="btn sec prep-del" data-del="${i}" style="flex:0 0 auto;width:auto;margin:0">Togli</button></div></div></div>`);
    });
    h.push("</div>");
    $("prep-elenco").innerHTML = h.join("");
    $("prep-elenco").querySelectorAll("select[data-i]").forEach((s) => s.addEventListener("change", () => { stato.campi[+s.dataset.i].a = s.value; segni(); }));
    $("prep-elenco").querySelectorAll("select[data-k]").forEach((s) => s.addEventListener("change", () => { stato.caselle[+s.dataset.k].regola = s.value; }));
    $("prep-elenco").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { stato.caselle.splice(+b.dataset.del, 1); collegaCaselle(); segni(); elenco(); }));
  }

  function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }

  async function salva() {
    if (!stato) return;
    const nome = ($("prep-nome").value || stato.nome).trim();
    const p1 = stato.pagine[0];
    const pacchetto = {
      formato: "m104", versione: 2, origine: "telefono",
      nome, creato: new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }),
      pagina: { w: p1.w, h: p1.h },
      campi: stato.campi.filter((c) => c.a !== "vuoto").map((c) => ({
        a: c.a, pag: c.pag, x: +c.x.toFixed(2), x2: +c.x2.toFixed(2), y: +c.y.toFixed(2), y2: +c.y.toFixed(2), b: +c.b.toFixed(2),
        size: +c.size.toFixed(1), t: c.t, regola: c.casella !== null ? stato.caselle[c.casella].regola : null })),
      caselle: stato.caselle.map((k) => ({ pag: k.pag, x: +k.x.toFixed(2), y: +k.y.toFixed(2), w: +k.w.toFixed(2), h: +k.h.toFixed(2), regola: k.regola })),
      basi: { unico: b64(stato.bytes) },
    };
    await window.M104.salvaPacchetto(pacchetto);
    window.M104.toast("Modulo pronto ✔ Ora puoi compilare il mese");
    stato = null; $("prep-elenco").innerHTML = ""; $("prep-pagine").innerHTML = ""; $("prep-salva").disabled = true;
    $("prep-stato").textContent = "";
    window.M104.vai("s-home");
  }

  $("prep-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) { $("prep-nome").value = f.name.replace(/\.pdf$/i, ""); apriPdf(f); } e.target.value = ""; });
  $("prep-salva").addEventListener("click", () => salva().catch((e) => { console.error(e); window.M104.toast("Errore nel salvataggio: " + e.message); }));
  window.M104prep = { apriPdf, stato: () => stato };
})();
