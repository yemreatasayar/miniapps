import { useLang } from "../lib/LangContext";
import type { ProcessStatus } from "../lib/types";

type ProgressPanelProps = {
  status: Extract<ProcessStatus, { kind: "loading-ffmpeg" | "processing" }>;
};

export default function ProgressPanel({ status }: ProgressPanelProps) {
  const { t } = useLang();
  const isLoading = status.kind === "loading-ffmpeg";
  const label = isLoading ? t.progressLoading : status.label;
  const progress = status.progress;
  const isIndeterminate = progress <= 0;

  return (
    <div className="workspace-section progress-section">
      <div className="progress-shell">
        <div className="section-header">
          <div>
            <h2>{label}</h2>
            <p className="progress-helper">
              {isIndeterminate ? t.progressWait : `${Math.round(progress * 100)}%`}
            </p>
          </div>
        </div>
        <div className="progress-track">
          <div
            className={`progress-fill ${isIndeterminate ? "progress-fill-indeterminate" : ""}`}
            style={isIndeterminate ? undefined : { width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
