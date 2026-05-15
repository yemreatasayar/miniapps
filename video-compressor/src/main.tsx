import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./App";
import { LangProvider } from "./lib/LangContext";

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
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>
);
