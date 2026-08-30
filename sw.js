// Cachea únicamente el "shell" de la app (HTML/CSS/JS/manifest/icono).
// Los pesos del modelo Whisper los cachea transformers.js por su cuenta
// (Cache Storage propia), así que no los tocamos aquí.
const CACHE_NAME = "syncstory-shell-v1";
const SHELL_FILES = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Solo intervenimos peticiones al propio origen (el shell). Todo lo demás
  // (CDN de modelos, etc.) pasa directo a la red / su propio cache.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
