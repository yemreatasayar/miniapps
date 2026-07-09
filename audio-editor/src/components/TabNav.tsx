import type { Tab } from "../lib/types";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "cutter", label: "Kes", desc: "Kırp" },
  { id: "normalizer", label: "Normalize", desc: "Ses seviyesi" },
  { id: "converter", label: "Dönüştür", desc: "Format" },
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
