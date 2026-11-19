/* Modulo 104 - «Visualizza» un mese dell'archivio: calendario in sola lettura con turni, 104 e 151.
   Lo stesso disegno diventa l'immagine da condividere (WhatsApp, email, ...). */
"use strict";
(function () {
  const C = { pri: "#1d5fc4", txt: "#1b2a41", muted: "#4d5e78", line: "#d3ddee", cella: "#f3f6fc", rosa: "#f9e3e2", rosso: "#9b1c14",
    verde: "#d9f2e8", verdeB: "#0f8a6c", verdeT: "#0b5e4a", rosso104: "#dc2626", blu151: "#2563eb", anello: "#10b981", grigio: "#eef0f4" };
  const SETT = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

  function tondo(x, ctx, a, b, w, h, r) {
    ctx.beginPath(); ctx.moveTo(a + r, b); ctx.arcTo(a + w, b, a + w, b + h, r); ctx.arcTo(a + w, b + h, a, b + h, r);
    ctx.arcTo(a, b + h, a, b, r); ctx.arcTo(a, b, a + w, b, r); ctx.closePath(); void x;
  }
  // testo che va a capo entro una larghezza; restituisce la y finale
  function paragrafo(ctx, t, x, y, larg, alt) {
    const parole = String(t).split(" "); let riga = "";
    for (const p of parole) {
      const prova = riga ? riga + " " + p : p;
      if (ctx.measureText(prova).width > larg && riga) { ctx.fillText(riga, x, y); y += alt; riga = p; } else riga = prova;
    }
    if (riga) { ctx.fillText(riga, x, y); y += alt; }
    return y;
  }

  // d = { anno, mese, chi, richiedente, giorni:[], g151:[], turni:[], orari:[], nessuno, motivo }
  function disegna(d) {
    const W = 1080, M = 54, gw = W - 2 * M, cw = gw / 7, ch = 112;
    const primo = new Date(d.anno, d.mese - 1, 1), vuoti = (primo.getDay() + 6) % 7, nG = new Date(d.anno, d.mese, 0).getDate();
    const righe = Math.ceil((vuoti + nG) / 7);
    const fest = typeof festivi === "function" ? festivi(d.anno) : {};
    const sel = new Set(d.giorni || []), s5 = new Set(d.g151 || []), tu = new Set(d.turni || []);
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    const font = (w, s) => `${w} ${s}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    // altezza: intestazione + griglia + riepilogo (stima generosa, poi si ritaglia)
    cv.width = W; cv.height = 2000;
    ctx.fillStyle = "#eef2f8"; ctx.fillRect(0, 0, W, cv.height);
    // fascia blu
    const gr = ctx.createLinearGradient(0, 0, 0, 170); gr.addColorStop(0, "#2a6fd6"); gr.addColorStop(1, "#1d5fc4");
    ctx.fillStyle = gr; tondo(0, ctx, 24, 24, W - 48, 150, 34); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = font(800, 54); ctx.fillText(`${MESI[d.mese - 1]} ${d.anno}`, 70, 100);
    ctx.font = font(500, 28); ctx.fillStyle = "#dce8fb";
    ctx.fillText([d.richiedente, d.chi ? "per " + d.chi : ""].filter(Boolean).join(" · ").slice(0, 70), 72, 146);
    // card bianca con il calendario
    let y = 204;
    const altCard = 70 + righe * (ch + 12) + 20;
    ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(20,40,80,.10)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    tondo(0, ctx, 24, y, W - 48, altCard, 30); ctx.fill(); ctx.shadowColor = "transparent";
    ctx.font = font(800, 24); ctx.textAlign = "center";
    SETT.forEach((s, i) => { ctx.fillStyle = i >= 5 ? "#b42318" : C.muted; ctx.fillText(s, M + cw * i + cw / 2, y + 48); });
    y += 70;
    for (let k = 0; k < righe * 7; k++) {
      const g = k - vuoti + 1; if (g < 1 || g > nG) continue;
      const col = k % 7, rig = Math.floor(k / 7), x = M + col * cw + 5, yy = y + rig * (ch + 12), w = cw - 10;
      const wd = new Date(d.anno, d.mese - 1, g).getDay(), we = wd === 0 || wd === 6, fe = fest[`${d.mese}-${g}`];
      const a104 = sel.has(g), a151 = s5.has(g), t = tu.has(g);
      let bg = C.cella, fg = C.txt, et = "";
      if (a104) { bg = C.rosso104; fg = "#fff"; }
      else if (a151) { bg = C.blu151; fg = "#fff"; }
      else if (t) { bg = C.verde; fg = we || fe ? C.rosso : C.verdeT; }
      else if (we || fe) { bg = C.grigio; fg = "#b42318"; }
      et = a104 ? "104" : a151 ? "151" : t ? "turno" : "";
      const su = t || a104 || a151;   // turni, 104 e 151 sono "in rilievo"
      if (su) { ctx.shadowColor = a104 ? "rgba(185,28,28,.35)" : a151 ? "rgba(29,78,216,.35)" : "rgba(15,90,70,.28)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; }
      ctx.fillStyle = bg; tondo(0, ctx, x, yy - (su ? 4 : 0), w, ch, 20); ctx.fill(); ctx.shadowColor = "transparent";
      if (su) { const lu = ctx.createLinearGradient(0, yy - 4, 0, yy + ch / 2); lu.addColorStop(0, "rgba(255,255,255,.35)"); lu.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = lu; tondo(0, ctx, x, yy - 4, w, ch / 2, 20); ctx.fill(); }
      if (t && !(a104 || a151)) { ctx.strokeStyle = C.verdeB; ctx.lineWidth = 2.5; tondo(0, ctx, x, yy - 4, w, ch, 20); ctx.stroke(); }
      if (t && (a104 || a151)) { ctx.strokeStyle = C.anello; ctx.lineWidth = 6; tondo(0, ctx, x - 2, yy - 6, w + 4, ch + 4, 22); ctx.stroke(); }
      ctx.fillStyle = fg; ctx.font = font(800, 38); ctx.fillText(String(g), x + w / 2, yy + (et ? 52 : 68) - (su ? 4 : 0));
      if (et) { ctx.font = font(800, 21); ctx.fillText(et, x + w / 2, yy + 88 - (su ? 4 : 0)); }
    }
    ctx.textAlign = "left";
    y = 204 + altCard + 30;
    // riepilogo a righe colorate (come le card della Cassa)
    const dd = (gs) => [...gs].sort((a, b) => a - b).map((g) => `${BREVI_G[new Date(d.anno, d.mese - 1, g).getDay()]} ${pad2(g)}`).join(" · ");
    const voci = [];
    if (d.nessuno) voci.push(["#b7791f", "104", "Nessun permesso 104", d.motivo ? `«${d.motivo}»` : "", ""]);
    else if (sel.size || (d.orari || []).length) voci.push(["#dc2626", "104", "Permessi 104", [dd(sel), (d.orari || []).map(([g, a, b]) => `${pad2(g)} ${a}-${b}`).join(" · ")].filter(Boolean).join(" · "), `${sel.size}/3`]);
    if (s5.size) voci.push(["#2563eb", "151", "Congedo 151", dd(s5), `${s5.size} gg`]);
    if (tu.size) voci.push(["#0f8a6c", "T", "Turni di servizio", dd(tu), String(tu.size)]);
    if (!voci.length) voci.push(["#4d5e78", "—", "Nessun giorno segnato", "", ""]);
    for (const [acc, ico, tit, testo, n] of voci) {
      ctx.font = font(500, 26);
      const linee = Math.max(1, Math.ceil(ctx.measureText(testo).width / (W - 48 - 190))), h = 64 + linee * 34;
      ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(20,40,80,.08)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
      tondo(0, ctx, 24, y, W - 48, h, 24); ctx.fill(); ctx.shadowColor = "transparent";
      ctx.fillStyle = acc; tondo(0, ctx, 24, y, 10, h, 5); ctx.fill();
      ctx.globalAlpha = 0.14; tondo(0, ctx, 56, y + 18, 72, 72, 18); ctx.fill(); ctx.globalAlpha = 1;
      ctx.font = font(800, 26); ctx.textAlign = "center"; ctx.fillText(ico, 92, y + 64); ctx.textAlign = "left";
      ctx.fillStyle = C.txt; ctx.font = font(800, 30); ctx.fillText(tit, 150, y + 50);
      if (n) { ctx.fillStyle = acc; ctx.textAlign = "right"; ctx.fillText(n, W - 60, y + 50); ctx.textAlign = "left"; }
      ctx.fillStyle = C.muted; ctx.font = font(500, 26); paragrafo(ctx, testo, 150, y + 88, W - 48 - 190, 34);
      y += h + 16;
    }
    // legenda
    y += 6; ctx.font = font(600, 22); let lx = 40;
    for (const [c, t, bordo] of [[C.rosso104, "104"], [C.blu151, "151"], [C.verde, "Turno", C.verdeB], [C.grigio, "Festivo / fine settimana", "#e3b0ab"], ["#fff", "104 o 151 su un turno", C.anello]]) {
      ctx.fillStyle = c; tondo(0, ctx, lx, y, 26, 26, 7); ctx.fill(); if (bordo) { ctx.strokeStyle = bordo; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = C.muted; ctx.fillText(t, lx + 34, y + 21); lx += 34 + ctx.measureText(t).width + 26;
      if (lx > W - 260) { lx = 40; y += 40; }
    }
    y += 60; ctx.font = font(500, 20); ctx.fillStyle = "#8a97ab"; ctx.fillText("Creato con Modulo 104", 40, y); y += 30;
    // ritaglio all'altezza usata
    const out = document.createElement("canvas"); out.width = W; out.height = y;
    out.getContext("2d").drawImage(cv, 0, 0); return out;
  }
  function blob(cv) { return new Promise((ok) => cv.toBlob(ok, "image/png")); }
  window.M104vedi = { disegna, blob };
})();
