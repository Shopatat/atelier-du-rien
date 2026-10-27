// Service worker : garde l'appli en cache pour qu'elle marche hors ligne.
// Pense à changer VERSION à chaque mise à jour, sinon les téléphones gardent l'ancienne version.
const VERSION = "atelier-du-rien-v5";
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./css/style.css",
  "./js/app.js", "./js/sujets.js", "./js/discussion.js",
  "./fonts/fraunces-latin.woff2", "./fonts/bricolage-latin.woff2",
  "./fonts/spacemono-400-latin.woff2", "./fonts/spacemono-700-latin.woff2",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord : dès qu'une mise à jour est en ligne, on la voit au lancement suivant.
// « no-cache » évite que le cache du navigateur (10 min sur GitHub Pages) ressorte l'ancienne version.
// Sans réseau, on sert ce qui est en cache.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      try{
        const res = await fetch(e.request.url, { cache:"no-cache" });
        if (res && res.ok) cache.put(e.request, res.clone());
        return res;
      }catch(err){
        const cached = await cache.match(e.request, { ignoreSearch:true });
        if (cached) return cached;
        throw err;
      }
    })
  );
});
