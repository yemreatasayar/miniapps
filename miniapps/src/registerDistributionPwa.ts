const PWA_ENABLED = import.meta.env.VITE_MINIAPPS_ENABLE_PWA === "true";

function canRegisterServiceWorker(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  return window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function registerDistributionPwa(): void {
  if (!PWA_ENABLED || !canRegisterServiceWorker()) {
    return;
  }

  const serviceWorkerUrl = `${import.meta.env.BASE_URL}service-worker.js`;
  const scope = import.meta.env.BASE_URL;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(serviceWorkerUrl, { scope }).catch((error) => {
      console.warn("miniapps PWA registration skipped:", error);
    });
  });
}
