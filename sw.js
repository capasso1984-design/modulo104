// Fa funzionare l'app anche senza internet.
const CACHE = "modulo104-v23";
const FILES = ["./", "index.html", "app.js", "pdf-lib.min.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "anteprima.png", "prepara.js", "lib/pdf.min.js", "lib/pdf.worker.min.js", "word.js", "lib/fflate.min.js", "firma.js", "accesso.js", "c151.js", "vedi.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))));
  self.clients.claim();
});
// prima la rete (per avere gli aggiornamenti), se manca usa la copia salvata
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {   // chiede sempre al sito se c'è una versione nuova
    const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
