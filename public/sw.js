const CACHE_NAME = "cube-split-timer-pwa-v2";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isCacheableResponse(response) {
  return response && response.ok && (response.type === "basic" || response.type === "default");
}

function isStaticRequest(request, url) {
  return (
    url.pathname.startsWith("/assets/") ||
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "worker" ||
    request.destination === "font" ||
    request.destination === "image" ||
    request.destination === "manifest"
  );
}

async function cacheCoreAssets() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: "reload" })));
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  const requests = urls
    .map((url) => {
      try {
        const parsedUrl = new URL(url, self.location.origin);

        if (!isSameOrigin(parsedUrl)) {
          return null;
        }

        parsedUrl.hash = "";
        return new Request(parsedUrl.href, { cache: "reload" });
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  await Promise.all(
    requests.map(async (request) => {
      try {
        const response = await fetch(request);

        if (isCacheableResponse(response)) {
          await cache.put(request, response);
        }
      } catch {
        // Offline or interrupted asset refreshes should not break the app shell cache.
      }
    }),
  );
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (isCacheableResponse(response)) {
      await cache.put("/index.html", response.clone());
    }

    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      (await cache.match("/index.html")) ||
      new Response("Cube Split Timer is offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirstStatic(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);

  if (isCacheableResponse(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheCoreAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) {
    return;
  }

  event.waitUntil(cacheUrls(event.data.urls));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (!isSameOrigin(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticRequest(request, url)) {
    event.respondWith(cacheFirstStatic(request));
  }
});
