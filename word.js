/* Modulo 104 - impaginazione automatica di un Word (.docx) in un PDF A4, direttamente sul telefono.
   Legge testo, grassetto/corsivo/sottolineato, dimensioni, allineamento, rientri, spaziature, elenchi,
   tabulazioni e caselle; ricompone il modulo vuoto e lo passa alla preparazione (che trova gli spazi da compilare).
   Il risultato ha lo stesso testo dell'originale, ma l'impaginazione è ricostruita: può differire un po'. */
"use strict";
(function () {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const TW = 1 / 20;            // twip -> punti
  const EMU = 1 / 12700;        // EMU -> punti
  const SIMBOLI_CASELLA = ["F06F", "F070", "F071", "F072", "F0A8", "F06D", "F0A1", "F0FE", "F0FD", "F078"];

  function caricaScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.append(s); });
  }
  const figli = (el, nome) => el ? Array.from(el.children).filter((c) => c.localName === nome) : [];
  const figlio = (el, nome) => figli(el, nome)[0] || null;
  const att = (el, nome) => (el ? el.getAttributeNS(W, nome) ?? el.getAttribute("w:" + nome) : null);
  const num = (v, d = 0) => (v === null || v === undefined || v === "" || isNaN(+v) ? d : +v);
  const vero = (el) => el && !["0", "false", "off"].includes(att(el, "val") || "");

  // ------------------------------------------------------------------ stili
  function leggiRPr(rPr, base = {}) {
    const r = { ...base };
    if (!rPr) return r;
    for (const [tag, k] of [["b", "b"], ["i", "i"], ["caps", "caps"]]) { const e = figlio(rPr, tag); if (e) r[k] = vero(e); }
    const u = figlio(rPr, "u"); if (u) r.u = (att(u, "val") || "single") !== "none";
    const sz = figlio(rPr, "sz"); if (sz) r.sz = num(att(sz, "val"), 22) / 2;
    const f = figlio(rPr, "rFonts"); if (f) r.font = att(f, "ascii") || att(f, "hAnsi") || r.font;
    const v = figlio(rPr, "vanish"); if (v) r.nascosto = vero(v);
    return r;
  }
  function leggiPPr(pPr, base = {}) {
    const p = { ...base, ind: { ...(base.ind || {}) }, sp: { ...(base.sp || {}) } };
    if (!pPr) return p;
    const jc = figlio(pPr, "jc"); if (jc) p.jc = att(jc, "val");
    const ind = figlio(pPr, "ind");
    if (ind) {
      for (const [a, k] of [["left", "l"], ["start", "l"], ["right", "r"], ["end", "r"], ["firstLine", "fl"], ["hanging", "h"]]) {
        const v = att(ind, a); if (v !== null && v !== "") p.ind[k] = num(v) * TW;
      }
      if (att(ind, "hanging") !== null) p.ind.fl = 0;
      if (att(ind, "firstLine") !== null) p.ind.h = 0;
    }
    const sp = figlio(pPr, "spacing");
    if (sp) {
      if (att(sp, "before") !== null) p.sp.prima = num(att(sp, "before")) * TW;
      if (att(sp, "after") !== null) p.sp.dopo = num(att(sp, "after")) * TW;
      if (vero(sp) && att(sp, "beforeAutospacing") === "1") p.sp.prima = 14;
      if (att(sp, "afterAutospacing") === "1") p.sp.dopo = 14;
      if (att(sp, "line") !== null) { p.sp.linea = num(att(sp, "line"), 240); p.sp.regola = att(sp, "lineRule") || "auto"; }
    }
    const cs = figlio(pPr, "contextualSpacing"); if (cs) p.ctx = vero(cs);
    const np = figlio(pPr, "numPr");
    if (np) { const id = figlio(np, "numId"), lv = figlio(np, "ilvl"); p.num = { id: att(id, "val"), lv: num(att(lv, "val")) }; }
    return p;
  }
  function leggiStili(xml) {
    const stili = {}, def = { p: {}, r: { sz: 11 } };
    if (!xml) return { stili, def };
    const d = new DOMParser().parseFromString(xml, "application/xml");
    const dd = d.getElementsByTagNameNS(W, "docDefaults")[0];
    if (dd) {
      def.r = leggiRPr(dd.getElementsByTagNameNS(W, "rPr")[0], def.r);
      def.p = leggiPPr(dd.getElementsByTagNameNS(W, "pPr")[0], def.p);
    }
    for (const s of d.getElementsByTagNameNS(W, "style")) {
      const id = att(s, "styleId");
      stili[id] = { tipo: att(s, "type"), base: att(figlio(s, "basedOn"), "val"), pPr: figlio(s, "pPr"), rPr: figlio(s, "rPr"), def: att(s, "default") === "1" };
    }
    return { stili, def };
  }
  function stileRisolto(S, id, giro = 0) {
    const s = S.stili[id];
    if (!s || giro > 10) return { p: S.def.p, r: S.def.r };
    const b = s.base ? stileRisolto(S, s.base, giro + 1) : { p: S.def.p, r: S.def.r };
    return { p: leggiPPr(s.pPr, b.p), r: leggiRPr(s.rPr, b.r) };
  }
  function leggiNumerazione(xml) {
    const out = { num: {}, astratti: {} };
    if (!xml) return out;
    const d = new DOMParser().parseFromString(xml, "application/xml");
    for (const a of d.getElementsByTagNameNS(W, "abstractNum")) {
      const liv = {};
      for (const l of figli(a, "lvl")) {
        const lv = num(att(l, "ilvl"));
        liv[lv] = { testo: att(figlio(l, "lvlText"), "val") || "", fmt: att(figlio(l, "numFmt"), "val") || "bullet", inizio: num(att(figlio(l, "start"), "val"), 1), p: leggiPPr(figlio(l, "pPr")), r: leggiRPr(figlio(l, "rPr")) };
      }
      out.astratti[att(a, "abstractNumId")] = liv;
    }
    for (const n of d.getElementsByTagNameNS(W, "num")) out.num[att(n, "numId")] = att(figlio(n, "abstractNumId"), "val");
    return out;
  }

  // ------------------------------------------------------------------ lettura del documento
  function leggiParagrafo(p, S, N, contatori) {
    const pPr = figlio(p, "pPr");
    const idStile = att(figlio(pPr, "pStyle"), "val") || Object.keys(S.stili).find((k) => S.stili[k].def && S.stili[k].tipo === "paragraph") || "";
    const st = stileRisolto(S, idStile);
    const pp = leggiPPr(pPr, st.p);
    const rBase = st.r;
    const segno = leggiRPr(figlio(pPr, "rPr"), st.r);
    const par = { pp, pezzi: [], forme: [], stile: idStile, dimSegno: segno.sz || 11 };
    // elenco puntato / numerato
    if (pp.num && pp.num.id && pp.num.id !== "0") {
      const astr = N.astratti[N.num[pp.num.id]], lv = astr && astr[pp.num.lv];
      if (lv) {
        par.pp = leggiPPr(null, { ...pp, ind: { ...lv.p.ind, ...(pPr && figlio(pPr, "ind") ? pp.ind : {}) } });
        const k = pp.num.id + ":" + pp.num.lv; contatori[k] = (contatori[k] ?? lv.inizio - 1) + 1;
        let m = lv.testo.replace(/%\d/g, String(contatori[k]));
        if (lv.fmt === "bullet") m = /[-]/.test(m) || m === "" ? "•" : m;
        par.marcatore = { t: m, st: { ...rBase, ...lv.r, b: false, i: false, u: false } };
      }
    }
    const visita = (el) => {
      for (const c of Array.from(el.children)) {
        const n = c.localName;
        if (n === "r") leggiRun(c);
        else if (n === "hyperlink" || n === "smartTag" || n === "ins" || n === "sdt" || n === "sdtContent" || n === "fldSimple") visita(c);
        else if (n === "AlternateContent") { const ch = figlio(c, "Choice"); if (ch) visita(ch); }
      }
    };
    const leggiRun = (r) => {
      const st2 = (() => { const rPr = figlio(r, "rPr"); const rs = att(figlio(rPr, "rStyle"), "val"); return leggiRPr(rPr, rs ? stileRisolto(S, rs).r : rBase); })();
      if (st2.nascosto) return;
      for (const c of Array.from(r.children)) {
        const n = c.localName;
        if (n === "t") par.pezzi.push({ tipo: "testo", t: st2.caps ? c.textContent.toUpperCase() : c.textContent, st: st2 });
        else if (n === "tab") par.pezzi.push({ tipo: "tab", st: st2 });
        else if (n === "br" || n === "cr") par.pezzi.push({ tipo: att(c, "type") === "page" ? "pagina" : "a_capo", st: st2 });
        else if (n === "sym") {
          const ch = (att(c, "char") || "").toUpperCase(), font = (att(c, "font") || "").toLowerCase();
          if (font.includes("wingdings") && SIMBOLI_CASELLA.includes(ch)) par.pezzi.push({ tipo: "casella", spuntata: ["F0FE", "F0FD", "F078"].includes(ch), st: st2 });
        } else if (n === "drawing" || n === "AlternateContent") leggiDisegno(n === "drawing" ? c : figlio(c, "Choice"), st2);
      }
    };
    // caselle disegnate (piccoli rettangoli ancorati al paragrafo)
    const leggiDisegno = (el, st2) => {
      if (!el) return;
      const anc = el.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "anchor")[0];
      const ext = el.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "extent")[0];
      if (!anc || !ext) return;
      const w = num(ext.getAttribute("cx")) * EMU, h = num(ext.getAttribute("cy")) * EMU;
      if (w > 30 || h > 30 || w < 3) return; // non è una casella
      const ph = Array.from(anc.children).find((x) => x.localName === "positionH"), pv = Array.from(anc.children).find((x) => x.localName === "positionV");
      const off = (pos) => { const o = pos && Array.from(pos.children).find((x) => x.localName === "posOffset"); return o ? num(o.textContent) * EMU : null; };
      par.forme.push({ w, h, rifH: ph ? ph.getAttribute("relativeFrom") : "column", x: off(ph), rifV: pv ? pv.getAttribute("relativeFrom") : "paragraph", y: off(pv) ?? 0 });
      void st2;
    };
    visita(p);
    return par;
  }

  function leggiCorpo(body, S, N) {
    const blocchi = [], contatori = {};
    const visita = (el) => {
      for (const c of Array.from(el.children)) {
        if (c.localName === "p") blocchi.push(leggiParagrafo(c, S, N, contatori));
        else if (c.localName === "tbl") for (const tr of figli(c, "tr")) for (const tc of figli(tr, "tc")) visita(tc);
        else if (c.localName === "sdt") { const sc = figlio(c, "sdtContent"); if (sc) visita(sc); }
      }
    };
    visita(body);
    return blocchi;
  }

  // ------------------------------------------------------------------ impaginazione
  function pulisci(s, font) {
    let out = "";
    for (const ch of s) { try { font.encodeText(ch); out += ch; } catch (e) { out += ({ "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "-", " ": " " }[ch] ?? ""); } }
    return out;
  }
  async function impagina(blocchi, pagina, F, scala, disegna) {
    const { PDFDocument, rgb } = PDFLib;
    const nero = rgb(0, 0, 0);
    let doc = null, pg = null, y = 0, pagine = 1;
    const area = { x: pagina.ml, w: pagina.w - pagina.ml - pagina.mr, top: pagina.h - pagina.mt, bottom: pagina.mb };
    if (disegna) { doc = disegna; pg = doc.addPage([pagina.w, pagina.h]); }
    y = area.top;
    const nuovaPagina = () => { pagine++; y = area.top; if (disegna) pg = doc.addPage([pagina.w, pagina.h]); };
    const fontDi = (st) => F.scegli(st);
    blocchi.forEach((b, ib) => {
      const pp = b.pp, ind = pp.ind || {}, sp = pp.sp || {};
      const prec = blocchi[ib - 1], succ = blocchi[ib + 1];
      const stessoPrima = prec && pp.ctx && prec.stile === b.stile, stessoDopo = succ && pp.ctx && succ.stile === b.stile;
      const sx = area.x + (ind.l || 0) * scala, dx = area.x + area.w - (ind.r || 0) * scala;
      const primaRiga = ((ind.fl || 0) - (ind.h || 0)) * scala;
      if (!stessoPrima) y -= (sp.prima || 0) * scala;
      // parole e spazi
      const toks = [];
      const dimBase = ((b.pezzi.find((z) => z.st && z.st.sz) || {}).st || { sz: b.dimSegno || 11 }).sz;
      if (b.marcatore) toks.push({ tipo: "marc", t: b.marcatore.t, st: b.marcatore.st });
      for (const z of b.pezzi) {
        if (z.tipo === "testo") for (const parte of z.t.split(/( +)/)) { if (parte) toks.push({ tipo: /^ +$/.test(parte) ? "spazio" : "parola", t: parte, st: z.st }); }
        else toks.push(z);
      }
      // misura
      const misura = (t) => {
        const sz = (t.st && t.st.sz ? t.st.sz : dimBase) * scala;
        t.sz = sz;
        if (t.tipo === "parola" || t.tipo === "spazio" || t.tipo === "marc") { t.font = fontDi(t.st); t.txt = pulisci(t.t, t.font); t.w = t.font.widthOfTextAtSize(t.txt, sz); }
        else if (t.tipo === "casella") t.w = sz * 0.95;
        else t.w = 0;
      };
      toks.forEach(misura);
      for (let k = toks.length - 1; k > 0; k--) {
        const a = toks[k - 1], b2 = toks[k];
        if (a.tipo === "parola" && b2.tipo === "parola") {
          const parti = (a.parti || [a]).concat(b2.parti || [b2]);
          toks.splice(k - 1, 2, { tipo: "parola", parti, w: parti.reduce((x, q) => x + q.w, 0), sz: Math.max(...parti.map((q) => q.sz)), txt: parti.map((q) => q.txt).join(""), font: parti[0].font, st: parti[0].st });
        }
      }
      // righe
      const righe = []; let riga = { toks: [], w: 0 }, x0 = sx + primaRiga;
      const largh = () => dx - (righe.length === 0 ? x0 : sx);
      const chiudi = (forzata) => { riga.forzata = forzata; righe.push(riga); riga = { toks: [], w: 0 }; };
      for (const t of toks) {
        if (t.tipo === "a_capo") { chiudi(true); continue; }
        if (t.tipo === "pagina") { chiudi(true); righe.push({ toks: [], w: 0, pagina: true }); continue; }
        if (t.tipo === "marc") {
          // il marcatore sta nel rientro sporgente, poi si va al rientro del testo
          t.w = Math.max(t.w + 4, (ind.h || 0) * scala); riga.toks.push(t); riga.w += t.w; continue;
        }
        if (t.tipo === "tab") {
          const passo = 35.4 * scala, posAss = (righe.length === 0 ? x0 : sx) + riga.w, base = area.x + (ind.l || 0) * scala;
          const prossima = base + Math.ceil((posAss - base + 0.5) / passo) * passo;
          t.w = Math.max(2, prossima - posAss);
          if (riga.w + t.w > largh()) { chiudi(false); continue; }
          riga.toks.push(t); riga.w += t.w; continue;
        }
        if (t.tipo === "spazio" && riga.toks.length === 0 && righe.length > 0) continue;
        if (riga.w + t.w <= largh() + 0.01 || riga.toks.length === 0 && t.w <= largh()) { riga.toks.push(t); riga.w += t.w; continue; }
        if (t.tipo === "spazio") { chiudi(false); continue; }
        // parola composta troppo larga: si mettono i pezzi uno alla volta (spezzando anche quelli troppo lunghi)
        const spezza = (t) => {
          let resto = t.txt;
          while (resto) {
            let n = resto.length;
            while (n > 1 && riga.w + t.font.widthOfTextAtSize(resto.slice(0, n), t.sz) > largh()) n--;
            if (riga.toks.length && riga.w + t.font.widthOfTextAtSize(resto.slice(0, 1), t.sz) > largh()) { chiudi(false); continue; }
            const pezzo = { ...t, parti: undefined, txt: resto.slice(0, n), w: t.font.widthOfTextAtSize(resto.slice(0, n), t.sz) };
            riga.toks.push(pezzo); riga.w += pezzo.w; resto = resto.slice(n);
            if (resto) chiudi(false);
          }
        };
        if (t.parti && t.w > largh()) {
          for (const q of t.parti) {
            if (riga.w + q.w <= largh() + 0.01) { riga.toks.push(q); riga.w += q.w; }
            else if (q.w <= largh() && riga.toks.length) { chiudi(false); riga.toks.push(q); riga.w += q.w; }
            else spezza(q);
          }
          continue;
        }
        if (riga.toks.length === 0 || t.w > largh()) {
          // parola più lunga della riga (es. lineette): si spezza
          let resto = t.txt;
          while (resto) {
            let n = resto.length;
            while (n > 1 && riga.w + t.font.widthOfTextAtSize(resto.slice(0, n), t.sz) > largh()) n--;
            if (riga.toks.length && riga.w + t.font.widthOfTextAtSize(resto.slice(0, 1), t.sz) > largh()) { chiudi(false); continue; }
            const pezzo = { ...t, txt: resto.slice(0, n), w: t.font.widthOfTextAtSize(resto.slice(0, n), t.sz) };
            riga.toks.push(pezzo); riga.w += pezzo.w; resto = resto.slice(n);
            if (resto) chiudi(false);
          }
          continue;
        }
        while (riga.toks.length && riga.toks[riga.toks.length - 1].tipo === "spazio") riga.w -= riga.toks.pop().w;
        chiudi(false); riga.toks.push(t); riga.w += t.w;
      }
      if (riga.toks.length || righe.length === 0) chiudi(true);
      // altezza riga
      const molt = sp.regola === "auto" || !sp.regola ? (sp.linea || 240) / 240 : 1;
      const yInizio = y;
      righe.forEach((r, i) => {
        if (r.pagina) { nuovaPagina(); return; }
        const maxSz = Math.max(dimBase * scala, ...r.toks.map((t) => t.sz || 0));
        const alt = sp.regola === "exact" || sp.regola === "atLeast" ? Math.max(sp.regola === "exact" ? 0 : maxSz * 1.15, (sp.linea || 240) * TW * scala) : maxSz * 1.15 * molt;
        if (y - alt < area.bottom && y < area.top - 1) nuovaPagina();
        const base = y - maxSz * 0.9;
        if (disegna) {
          let x = i === 0 ? x0 : sx;
          const ultima = i === righe.length - 1 || r.forzata;
          let extra = 0;
          while (r.toks.length && r.toks[r.toks.length - 1].tipo === "spazio") r.w -= r.toks.pop().w;
          const spazi = r.toks.filter((t) => t.tipo === "spazio").length;
          const libero = dx - x - r.w;
          if (pp.jc === "center") x += libero / 2;
          else if (pp.jc === "right" || pp.jc === "end") x += libero;
          else if (pp.jc === "both" && !ultima && spazi) extra = libero / spazi;
          for (const t of r.toks) {
            if (t.parti) {
              let xx = x;
              for (const q of t.parti) {
                pg.drawText(q.txt, { x: xx, y: base, size: q.sz, font: q.font, color: nero });
                if (q.st && q.st.u && !/^_+$/.test(q.txt)) pg.drawLine({ start: { x: xx, y: base - q.sz * 0.12 }, end: { x: xx + q.w, y: base - q.sz * 0.12 }, thickness: Math.max(0.4, q.sz * 0.05), color: nero });
                xx += q.w;
              }
            } else if (t.tipo === "parola" || t.tipo === "marc" || t.tipo === "spazio") {
              if (t.tipo !== "spazio") pg.drawText(t.txt, { x, y: base, size: t.sz, font: t.font, color: nero });
              if (t.st && t.st.u && t.tipo !== "marc" && !/^_+$/.test(t.txt)) pg.drawLine({ start: { x, y: base - t.sz * 0.12 }, end: { x: x + t.w + (t.tipo === "spazio" ? extra : 0), y: base - t.sz * 0.12 }, thickness: Math.max(0.4, t.sz * 0.05), color: nero });
            } else if (t.tipo === "casella") {
              const l = t.sz * 0.7;
              pg.drawRectangle({ x: x + 0.5, y: base - t.sz * 0.05, width: l, height: l, borderColor: nero, borderWidth: 0.8, color: t.spuntata ? nero : undefined });
            }
            x += t.w + (t.tipo === "spazio" ? extra : 0);
          }
        }
        y -= alt;
      });
      // caselle disegnate ancorate al paragrafo
      if (disegna) for (const f of b.forme) {
        const fx = f.x === null ? area.x : (f.rifH === "page" ? 0 : area.x) + f.x * 1;
        const fy = yInizio - (f.rifV === "paragraph" || f.rifV === "line" ? f.y : 0) - f.h;
        pg.drawRectangle({ x: fx, y: fy, width: f.w, height: f.h, borderColor: nero, borderWidth: 0.9 });
      }
      if (!stessoDopo) y -= (sp.dopo || 0) * scala;
    });
    return { pagine, avanzo: y - area.bottom };
  }

  async function docxInPdf(bytes) {
    if (!window.fflate) await caricaScript("lib/fflate.min.js");
    const z = fflate.unzipSync(bytes);
    const testo = (n) => (z[n] ? new TextDecoder().decode(z[n]) : null);
    const docXml = testo("word/document.xml");
    if (!docXml) throw new Error("Questo file non sembra un Word (.docx)");
    const S = leggiStili(testo("word/styles.xml"));
    const N = leggiNumerazione(testo("word/numbering.xml"));
    const d = new DOMParser().parseFromString(docXml, "application/xml");
    const body = d.getElementsByTagNameNS(W, "body")[0];
    const sect = Array.from(body.children).find((c) => c.localName === "sectPr") || body.getElementsByTagNameNS(W, "sectPr")[0];
    const pgSz = figlio(sect, "pgSz"), pgMar = figlio(sect, "pgMar");
    // si impagina sempre in A4, con i margini del Word (entro limiti ragionevoli)
    const lim = (v, d) => Math.min(90, Math.max(28, num(v, d * 20) * TW));
    const pagina = { w: 595.28, h: 841.89, ml: lim(att(pgMar, "left"), 56.7), mr: lim(att(pgMar, "right"), 56.7), mt: lim(att(pgMar, "top"), 56.7), mb: lim(att(pgMar, "bottom"), 56.7) };
    void pgSz;
    const blocchi = leggiCorpo(body, S, N);
    const { PDFDocument, StandardFonts } = PDFLib;
    const doc = await PDFDocument.create();
    const f = {
      tr: await doc.embedFont(StandardFonts.TimesRoman), tb: await doc.embedFont(StandardFonts.TimesRomanBold),
      ti: await doc.embedFont(StandardFonts.TimesRomanItalic), tbi: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
      hr: await doc.embedFont(StandardFonts.Helvetica), hb: await doc.embedFont(StandardFonts.HelveticaBold),
      hi: await doc.embedFont(StandardFonts.HelveticaOblique), hbi: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    };
    const F = { scegli: (st = {}) => { const sans = /calibri|arial|helvetica|verdana|segoe|tahoma|aptos/i.test(st.font || ""); const k = (sans ? "h" : "t") + (st.b && st.i ? "bi" : st.b ? "b" : st.i ? "i" : "r"); return f[k]; } };
    // se sfora di poco la pagina, rimpicciolisce un po' (fino all'80%) per restare in una pagina
    let scala = 1;
    const prova = await impagina(blocchi, pagina, F, 1, null);
    if (prova.pagine > 1) {
      // il modulo deve stare sempre in una pagina: si riduce un po' alla volta finché ci sta
      for (let s = 0.97; s >= 0.6; s -= 0.02) { scala = +s.toFixed(2); const r = await impagina(blocchi, pagina, F, scala, null); if (r.pagine === 1) break; }
    }
    await impagina(blocchi, pagina, F, scala, doc);
    doc.setTitle("Modulo impaginato da Word");
    return { pdf: await doc.save(), scala };
  }

  window.M104word = { docxInPdf };
})();
