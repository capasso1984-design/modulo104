/* Modulo 104 - editor della firma: importa la foto, la pulisce (luce zona per zona, niente ombre),
   permette di ritagliarla, mostra il risultato e la salva solo quando l'utente la accetta. */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  let foto = null;          // canvas con la foto ridotta
  let lum = null, sfondo = null, W = 0, H = 0;
  let ritaglio = null;      // {x, y, w, h} in pixel della foto
  let risultato = null;     // dataURL PNG pronto
  let alFine = null;        // callback(dataURL)

  function caricaImg(src) { return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; }); }

  // luminosità e "luce di fondo" stimata zona per zona (così le ombre non diventano inchiostro)
  function prepara(img) {
    const max = 1600, sc = Math.min(1, max / Math.max(img.width, img.height));
    W = Math.round(img.width * sc); H = Math.round(img.height * sc);
    foto = document.createElement("canvas"); foto.width = W; foto.height = H;
    const x = foto.getContext("2d"); x.drawImage(img, 0, 0, W, H);
    const p = x.getImageData(0, 0, W, H).data;
    lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = p[i * 4] * 0.299 + p[i * 4 + 1] * 0.587 + p[i * 4 + 2] * 0.114;
    // griglia di celle: in ogni cella il fondo è il valore "chiaro" (85° percentile)
    const cella = Math.max(16, Math.round(Math.max(W, H) / 40));
    const gw = Math.ceil(W / cella), gh = Math.ceil(H / cella), g = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const v = [];
      for (let y = gy * cella; y < Math.min(H, (gy + 1) * cella); y += 2) for (let xx = gx * cella; xx < Math.min(W, (gx + 1) * cella); xx += 2) v.push(lum[y * W + xx]);
      v.sort((a, b) => a - b); g[gy * gw + gx] = v[Math.floor(v.length * 0.85)] || 255;
    }
    // ammorbidisce la griglia (media 3x3) e la riporta a piena risoluzione
    const g2 = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = gy + dy, xx = gx + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) { s += g[yy * gw + xx]; n++; } }
      g2[gy * gw + gx] = Math.max(g[gy * gw + gx], s / n);
    }
    sfondo = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const fx = Math.min(gw - 1.001, Math.max(0, xx / cella - 0.5)), fy = Math.min(gh - 1.001, Math.max(0, y / cella - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      const a = g2[y0 * gw + x0], b = g2[y0 * gw + Math.min(gw - 1, x0 + 1)], c = g2[Math.min(gh - 1, y0 + 1) * gw + x0], d = g2[Math.min(gh - 1, y0 + 1) * gw + Math.min(gw - 1, x0 + 1)];
      sfondo[y * W + xx] = (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
    }
  }

  // maschera dell'inchiostro dentro un rettangolo, con la sensibilità scelta (0..100)
  function maschera(r, sens) {
    const k = 0.62 + sens * 0.0025;            // più alto = prende tratti più chiari
    const m = new Uint8Array(r.w * r.h), forza = new Float32Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const i = (r.y + y) * W + (r.x + x), bg = sfondo[i], l = lum[i];
      if (l < bg * k && bg - l > 22) { m[y * r.w + x] = 1; forza[y * r.w + x] = Math.min(1, (bg * k - l) / (bg * 0.25) + 0.35); }
    }
    // toglie i puntini isolati (macchie piccole)
    const minimo = Math.max(10, Math.round(r.w * r.h * 0.00012)), vis = new Uint8Array(r.w * r.h), coda = new Int32Array(r.w * r.h);
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || vis[s]) continue;
      let qa = 0, qb = 0; coda[qb++] = s; vis[s] = 1;
      while (qa < qb) {
        const c = coda[qa++], cx = c % r.w, cy = (c / r.w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
          const n = ny * r.w + nx; if (m[n] && !vis[n]) { vis[n] = 1; coda[qb++] = n; }
        }
      }
      if (qb < minimo) for (let t = 0; t < qb; t++) m[coda[t]] = 0;
    }
    return { m, forza };
  }

  // trova da sola la zona della firma (per proporre il ritaglio)
  function ritaglioAutomatico() {
    const bordo = Math.round(Math.min(W, H) * 0.03);
    const r = { x: bordo, y: bordo, w: W - 2 * bordo, h: H - 2 * bordo };
    const { m } = maschera(r, 40);
    let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (m[y * r.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return { x: 0, y: 0, w: W, h: H };
    const mx = (x1 - x0) * 0.08 + 10, my = (y1 - y0) * 0.15 + 10;
    const nx = Math.max(0, r.x + x0 - mx), ny = Math.max(0, r.y + y0 - my);
    return { x: Math.round(nx), y: Math.round(ny), w: Math.round(Math.min(W - nx, x1 - x0 + 2 * mx)), h: Math.round(Math.min(H - ny, y1 - y0 + 2 * my)) };
  }

  // crea la firma pulita (PNG trasparente, ritagliata stretta)
  function calcola() {
    const sens = +$("fe-sens").value, r = ritaglio;
    const { m, forza } = maschera(r, sens);
    let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (m[y * r.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const out = $("fe-risultato"), ox = out.getContext("2d");
    if (x1 < 0) { risultato = null; out.width = 300; out.height = 80; ox.fillStyle = "#fff"; ox.fillRect(0, 0, 300, 80); ox.fillStyle = "#b3261e"; ox.font = "14px sans-serif"; ox.fillText("Nessuna firma trovata: ritaglia meglio o alza la pulizia", 8, 44); $("fe-ok").disabled = true; return; }
    const mar = 6; x0 = Math.max(0, x0 - mar); y0 = Math.max(0, y0 - mar); x1 = Math.min(r.w - 1, x1 + mar); y1 = Math.min(r.h - 1, y1 + mar);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, c = document.createElement("canvas"); c.width = w; c.height = h;
    const cx = c.getContext("2d"), dati = cx.createImageData(w, h), p = dati.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (y0 + y) * r.w + (x0 + x), d = (y * w + x) * 4;
      if (m[s]) { p[d] = 18; p[d + 1] = 28; p[d + 2] = 75; p[d + 3] = Math.round(255 * forza[s]); }
    }
    cx.putImageData(dati, 0, 0);
    const sc = Math.min(1, 700 / w), fin = document.createElement("canvas"); fin.width = Math.round(w * sc); fin.height = Math.round(h * sc);
    fin.getContext("2d").drawImage(c, 0, 0, fin.width, fin.height);
    risultato = fin.toDataURL("image/png");
    // anteprima su fondo bianco, con una riga come sul modulo
    out.width = Math.max(320, fin.width + 40); out.height = fin.height + 50;
    ox.fillStyle = "#fff"; ox.fillRect(0, 0, out.width, out.height);
    ox.strokeStyle = "#999"; ox.beginPath(); ox.moveTo(10, out.height - 18); ox.lineTo(out.width - 10, out.height - 18); ox.stroke();
    ox.drawImage(fin, (out.width - fin.width) / 2, 12);
    $("fe-ok").disabled = false;
  }

  // disegna la foto con il riquadro del ritaglio
  function disegnaFoto() {
    const cv = $("fe-foto"), x = cv.getContext("2d");
    cv.width = W; cv.height = H; x.drawImage(foto, 0, 0);
    x.fillStyle = "rgba(0,0,0,.45)";
    x.fillRect(0, 0, W, ritaglio.y); x.fillRect(0, ritaglio.y + ritaglio.h, W, H - ritaglio.y - ritaglio.h);
    x.fillRect(0, ritaglio.y, ritaglio.x, ritaglio.h); x.fillRect(ritaglio.x + ritaglio.w, ritaglio.y, W - ritaglio.x - ritaglio.w, ritaglio.h);
    x.strokeStyle = "#ffcc00"; x.lineWidth = Math.max(3, W / 250); x.strokeRect(ritaglio.x, ritaglio.y, ritaglio.w, ritaglio.h);
  }

  let attesa = null;
  const aggiorna = () => { clearTimeout(attesa); attesa = setTimeout(calcola, 60); };

  // ritaglio con il dito: si trascina un rettangolo sulla foto
  (function () {
    const cv = $("fe-foto"); let inizio = null;
    const punto = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(W, (e.clientX - r.left) * W / r.width)), Math.max(0, Math.min(H, (e.clientY - r.top) * H / r.height))]; };
    cv.addEventListener("pointerdown", (e) => { if (!foto) return; inizio = punto(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => {
      if (!inizio) return; const [x, y] = punto(e);
      ritaglio = { x: Math.round(Math.min(x, inizio[0])), y: Math.round(Math.min(y, inizio[1])), w: Math.round(Math.abs(x - inizio[0])), h: Math.round(Math.abs(y - inizio[1])) };
      disegnaFoto();
    });
    const fine = () => { if (!inizio) return; inizio = null; if (ritaglio.w < 20 || ritaglio.h < 10) ritaglio = ritaglioAutomatico(); disegnaFoto(); aggiorna(); };
    cv.addEventListener("pointerup", fine); cv.addEventListener("pointercancel", fine);
  })();

  $("fe-sens").addEventListener("input", aggiorna);
  $("fe-auto").addEventListener("click", () => { ritaglio = ritaglioAutomatico(); disegnaFoto(); aggiorna(); });
  $("fe-tutta").addEventListener("click", () => { ritaglio = { x: 0, y: 0, w: W, h: H }; disegnaFoto(); aggiorna(); });
  $("fe-ruota").addEventListener("click", () => {
    const c = document.createElement("canvas"); c.width = H; c.height = W;
    const x = c.getContext("2d"); x.translate(H / 2, W / 2); x.rotate(Math.PI / 2); x.drawImage(foto, -W / 2, -H / 2);
    caricaImg(c.toDataURL("image/jpeg", 0.92)).then((img) => { prepara(img); ritaglio = ritaglioAutomatico(); disegnaFoto(); calcola(); });
  });
  $("fe-ok").addEventListener("click", () => { if (risultato && alFine) alFine(risultato); });
  $("fe-annulla").addEventListener("click", () => { window.M104.vai("s-anag"); });

  async function apri(file, callback) {
    alFine = callback;
    window.M104.vai("s-firma");
    $("fe-stato").textContent = "Leggo la foto…";
    const url = URL.createObjectURL(file);
    try {
      const img = await caricaImg(url);
      prepara(img);
      ritaglio = ritaglioAutomatico();
      $("fe-sens").value = 40;
      disegnaFoto(); calcola();
      $("fe-stato").textContent = "Ho trovato la firma e l'ho incorniciata in giallo. Se serve, trascina il dito sulla foto per ritagliare.";
    } catch (e) {
      $("fe-stato").textContent = "Non riesco a leggere questa immagine: prova con un'altra foto.";
    } finally { URL.revokeObjectURL(url); }
  }
  window.M104firma = { apri, _stato: () => ({ W, H, ritaglio, risultato: !!risultato }) };
})();
