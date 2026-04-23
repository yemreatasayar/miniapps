const CACHE_VERSION = "20260423t101134554z";
const CACHE_PREFIX = "miniapps-github-pages";
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`;
const APP_CACHE = `${CACHE_PREFIX}-apps-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = "./offline.html";
const SHELL_PRECACHE_URLS = [
  "./",
  "./index.html",
  "./distribution-config.json",
  "./manifest.webmanifest",
  "./offline.html",
  "./assets/audio-editor-card.svg",
  "./assets/bg-remover-card.svg",
  "./assets/csv-toolkit-card.svg",
  "./assets/dev-toolkit-card.svg",
  "./assets/exif-cleaner-card.svg",
  "./assets/filtre-card.svg",
  "./assets/image-format-converter-card.svg",
  "./assets/image-toolkit-card.svg",
  "./assets/index-BS2x4HWG.css",
  "./assets/index-DU34wGoQ.js",
  "./assets/miniapps-icon-maskable.svg",
  "./assets/miniapps-icon.svg",
  "./assets/miniapps-logo.svg",
  "./assets/pdf-toolkit-card.svg",
  "./assets/qr-generator-card.svg",
  "./assets/stem-splitter-card.svg",
  "./assets/video-to-audio-card.svg"
];
const APP_ENTRY_URLS = [
  "./apps/pdf-toolkit/",
  "./apps-en/pdf-toolkit/",
  "./apps/csv-toolkit/",
  "./apps-en/csv-toolkit/",
  "./apps/qr-generator/",
  "./apps-en/qr-generator/",
  "./apps/image-toolkit/",
  "./apps-en/image-toolkit/",
  "./apps/exif-cleaner/",
  "./apps-en/exif-cleaner/",
  "./apps/image-format-converter/",
  "./apps-en/image-format-converter/",
  "./apps/bg-remover/",
  "./apps-en/bg-remover/",
  "./apps/video-to-audio/",
  "./apps-en/video-to-audio/",
  "./apps/audio-editor/",
  "./apps-en/audio-editor/",
  "./apps/stem-splitter/",
  "./apps-en/stem-splitter/",
  "./apps/dev-toolkit/",
  "./apps-en/dev-toolkit/"
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isAppRequest(url) {
  return APP_ENTRY_URLS.some((entryUrl) => url.pathname.startsWith(new URL(entryUrl, self.registration.scope).pathname));
}

function isExcludedRuntimeRequest(url) {
  return url.pathname.includes("/downloads/");
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigationNetworkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }

    const fallback = await caches.match(OFFLINE_FALLBACK_URL, { ignoreSearch: true });
    if (fallback) {
      return fallback;
    }
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keepCaches = new Set([SHELL_CACHE, APP_CACHE, RUNTIME_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !keepCaches.has(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url) || url.pathname.endsWith("/service-worker.js")) {
    return;
  }

  if (isExcludedRuntimeRequest(url)) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(navigationNetworkFirst(request, isAppRequest(url) ? APP_CACHE : SHELL_CACHE));
    return;
  }

  if (isAppRequest(url)) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});
