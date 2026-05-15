import { useLang } from "../lib/LangContext";

type ResultPanelProps = {
  outputUrl: string;
  outputFileName: string;
  outputSize: number;
  originalSize: number;
  onReset: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)} ${units[index]}`;
}

export default function ResultPanel({
  outputUrl,
  outputFileName,
  outputSize,
  originalSize,
  onReset,
}: ResultPanelProps) {
  const { t } = useLang();
  const savedPercent = originalSize > 0 ? Math.round((1 - outputSize / originalSize) * 100) : 0;

  return (
    <div className="workspace-section">
      <div className="section-header">
        <div>
          <h2>{t.resultDone}</h2>
          <p>{outputFileName}</p>
        </div>
      </div>

      <div className="result-metrics">
        <div className="detail-item">
          <span>{t.resultOutputSize}</span>
          <strong>{formatBytes(outputSize)}</strong>
        </div>
        {savedPercent !== 0 ? (
          <div className="detail-item">
            <span>{t.resultSizeDiff}</span>
            <strong>{savedPercent > 0 ? t.resultSmaller(savedPercent) : t.resultLarger(Math.abs(savedPercent))}</strong>
          </div>
        ) : null}
      </div>

      <div className="action-row">
        <a className="download-link" href={outputUrl} download={outputFileName}>
          {t.resultDownload}
        </a>
        <button type="button" onClick={onReset}>
          {t.resultNewFile}
        </button>
      </div>
    </div>
  );
}
