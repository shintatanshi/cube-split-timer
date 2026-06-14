const SERVICE_WORKER_URL = "/sw.js";
const CACHE_READY_EVENT = "cube-split-timer:online";

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

interface LegacyMediaQueryList extends MediaQueryList {
  addListener(listener: () => void): void;
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as NavigatorWithStandalone).standalone === true
  );
}

function applyDisplayModeClass(): void {
  const isStandalone = isStandaloneDisplay();

  document.documentElement.classList.toggle("pwa-standalone", isStandalone);
  document.documentElement.classList.toggle("pwa-browser", !isStandalone);
}

function listenForDisplayModeChange(media: MediaQueryList, listener: () => void): void {
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return;
  }

  (media as LegacyMediaQueryList).addListener(listener);
}

function getCacheUrls(): string[] {
  const urls = new Set<string>([
    "/",
    "/index.html",
    "/manifest.json",
    "/icons/icon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
  ]);

  document
    .querySelectorAll<HTMLLinkElement | HTMLScriptElement>("link[href], script[src]")
    .forEach((element) => {
      const assetUrl =
        element instanceof HTMLLinkElement
          ? element.getAttribute("href")
          : element.getAttribute("src");

      if (!assetUrl) {
        return;
      }

      const absoluteUrl = new URL(assetUrl, window.location.href);

      if (absoluteUrl.origin === window.location.origin) {
        absoluteUrl.hash = "";
        urls.add(absoluteUrl.href);
      }
    });

  return [...urls];
}

function sendCacheUrls(registration: ServiceWorkerRegistration): void {
  const worker = registration.active ?? registration.waiting ?? registration.installing;

  worker?.postMessage({
    type: "CACHE_URLS",
    urls: getCacheUrls(),
  });
}

export function setupPwaShell(): void {
  applyDisplayModeClass();

  const standaloneMedia = window.matchMedia("(display-mode: standalone)");
  const fullscreenMedia = window.matchMedia("(display-mode: fullscreen)");
  const updateDisplayMode = () => applyDisplayModeClass();

  listenForDisplayModeChange(standaloneMedia, updateDisplayMode);
  listenForDisplayModeChange(fullscreenMedia, updateDisplayMode);
  window.addEventListener("pageshow", updateDisplayMode);
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SERVICE_WORKER_URL)
      .then((registration) => {
        sendCacheUrls(registration);
        void navigator.serviceWorker.ready.then(sendCacheUrls);
      })
      .catch(() => {
        // PWA support should never block the timer itself.
      });
  });

  window.addEventListener("online", () => {
    window.dispatchEvent(new CustomEvent(CACHE_READY_EVENT));
  });
}
