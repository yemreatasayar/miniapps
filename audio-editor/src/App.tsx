import { useState } from "react";
import AudioConverter from "./tools/AudioConverter";
import AudioCutter from "./tools/AudioCutter";
import VolumeNormalizer from "./tools/VolumeNormalizer";
import TabNav from "./components/TabNav";
import Toast from "./components/Toast";
import type { Tab } from "./lib/types";

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/audio-editor-logo.svg`;
  const [activeTab, setActiveTab] = useState<Tab>("cutter");
  const [toast, setToast] = useState<string | null>(null);

  return (
    <main className="audio-editor-shell">
      <header className="saas-header">
        <img className="brand-logo" src={logoUrl} alt="Audio Editor" />
      </header>

      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="tab-content">
        {activeTab === "cutter" ? <AudioCutter onToast={setToast} /> : null}
        {activeTab === "normalizer" ? <VolumeNormalizer onToast={setToast} /> : null}
        {activeTab === "converter" ? <AudioConverter onToast={setToast} /> : null}
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </main>
  );
}
