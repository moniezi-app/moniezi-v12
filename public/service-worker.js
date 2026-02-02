/* Moniezi PWA Service Worker
   - Fully bundled app - no CDN dependencies
   - Caches all assets for true offline support on all devices
   - V11: Added Tesseract.js OCR engine for offline receipt scanning
*/

// Bump this on every deploy
const CACHE_VERSION = "moniezi-pwa-v11-ocr-2026-01-29";
const CACHE_NAME = `moniezi-cache-${CACHE_VERSION}`;

// Resolve an asset relative to the service worker scope
const toScopeUrl = (path) => new URL(path, self.registration.scope).toString();

// Core assets to pre-cache
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./favicon.ico",
  "./favicon-32.png",
].map(toScopeUrl);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.addAll(CORE_ASSETS);
      } catch (e) {
        console.warn("[SW] Some core assets failed to cache:", e);
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clean up ALL old moniezi caches
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => 
          key.startsWith("moniezi-cache-") && key !== CACHE_NAME 
            ? caches.delete(key) 
            : null
        )
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first, fallback to cached index.html
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          const cache = await caches.open(CACHE_NAME);
          const cachedNav = await cache.match(req);
          if (cachedNav) return cachedNav;
          
          const cachedIndex = await cache.match(toScopeUrl("./index.html"));
          if (cachedIndex) return cachedIndex;
          
          const cachedRoot = await cache.match(toScopeUrl("./"));
          return cachedRoot || Response.error();
        }
      })()
    );
    return;
  }

  // All other assets: cache-first, then network
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.ok) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })()
  );
});
