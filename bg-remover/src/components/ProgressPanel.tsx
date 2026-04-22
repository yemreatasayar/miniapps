import type { ProcessStatus } from "../lib/types";

type Props = {
  status: Extract<ProcessStatus, { kind: "processing" }>;
  batchLabel?: string;
  currentFileLabel?: string;
};

const STAGE_LABELS: Record<string, string> = {
  "ort:Session.run": "AI modeli çalışıyor",
  "fetch:model": "Model indiriliyor",
  "fetch:wasm": "WASM hazırlanıyor",
  "fetch:assets": "Varlıklar yükleniyor",
};

function stageLabel(key: string): string {
  for (const [pattern, label] of Object.entries(STAGE_LABELS)) {
    if (key.includes(pattern)) return label;
  }
  return "İşleniyor";
}

export default function ProgressPanel({ status, batchLabel, currentFileLabel }: Props) {
  const isFinalizing = status.progress >= 0.98;
  const label = isFinalizing ? "Çıktı hazırlanıyor" : stageLabel(status.stage);
  const isIndeterminate = status.progress <= 0;
  const percentLabel = `%${Math.round(status.progress * 100)}`;

  return (
    <div className="workspace-section progress-section">
      <div className="progress-shell">
        <div className="progress-header">
          <div className="progress-copy">
            <h2>{label}</h2>
            <p className="progress-helper">
              {isIndeterminate
                ? "Lütfen bekleyin…"
                : isFinalizing
                  ? "Son dosya hazırlanıyor…"
                  : batchLabel ?? "İşlem devam ediyor"}
            </p>
            {currentFileLabel ? <p className="progress-helper">{currentFileLabel}</p> : null}
          </div>
          <strong className="progress-percent">{percentLabel}</strong>
        </div>
        <div className="progress-track">
          <div
            className={`progress-fill ${isIndeterminate ? "progress-fill-indeterminate" : ""}`}
            style={isIndeterminate ? undefined : { width: `${status.progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
