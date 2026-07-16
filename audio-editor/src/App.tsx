import { useState } from "react";
import AudioWorkspace from "./tools/AudioWorkspace";
import Toast from "./components/Toast";

const isDistribution = window.location.hostname === "miniapps.tr";

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/audio-editor-logo.svg`;
  const [toast, setToast] = useState<string | null>(null);

  return (
    <main className="audio-editor-shell">
      <header className="saas-header">
        <img className="brand-logo" src={logoUrl} alt="Audio Editor" />
      </header>

      <AudioWorkspace onToast={setToast} />

      <Toast message={toast} onClose={() => setToast(null)} />
      {isDistribution && (
        <footer className="miniapps-footer">
          <a href="https://miniapps.tr" aria-label="miniapps.tr">
            <img
              src={`${import.meta.env.BASE_URL}assets/miniapps-logo-dark.svg`}
              alt="miniapps.tr"
              className="miniapps-footer-logo"
            />
          </a>
        </footer>
      )}
    </main>
  );
}
