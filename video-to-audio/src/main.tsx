import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./App";

// FFmpeg WASM requires cross-origin isolation (SharedArrayBuffer).
// The service worker injects COOP/COEP headers for this app, but only after it
// controls the page. If the SW is active but headers weren't applied yet, reload once.
if (!crossOriginIsolated && "serviceWorker" in navigator) {
  if (navigator.serviceWorker.controller) {
    window.location.reload();
  } else {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if ((event.data as { type?: string })?.type === "SW_ACTIVATED" && !crossOriginIsolated) {
        window.location.reload();
      }
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
