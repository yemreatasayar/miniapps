import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./App";
import { LangProvider } from "./lib/LangContext";

// FFmpeg WASM requires cross-origin isolation (SharedArrayBuffer).
// SW injects COOP/COEP headers, but only after it controls the page.
// sessionStorage guard prevents infinite reload if SW update is still pending.
const COI_RELOAD_KEY = "miniapps.coi-reload.video-compressor";
if (!crossOriginIsolated && "serviceWorker" in navigator) {
  if (navigator.serviceWorker.controller && !sessionStorage.getItem(COI_RELOAD_KEY)) {
    sessionStorage.setItem(COI_RELOAD_KEY, "1");
    window.location.reload();
  } else {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if ((event.data as { type?: string })?.type === "SW_ACTIVATED" && !crossOriginIsolated) {
        sessionStorage.setItem(COI_RELOAD_KEY, "1");
        window.location.reload();
      }
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>
);
