import type { Tab } from "../lib/types";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "cutter", label: "Audio Cutter", desc: "Kes & Kırp" },
  { id: "normalizer", label: "Normalizer", desc: "Ses Seviyesi" },
  { id: "converter", label: "Converter", desc: "Format Dönüştür" },
];

type TabNavProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export default function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="tab-nav">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-button ${activeTab === tab.id ? "is-active" : ""}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="tab-label">{tab.label}</span>
          <span className="tab-desc">{tab.desc}</span>
        </button>
      ))}
    </nav>
  );
}
