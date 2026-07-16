type ResultPanelProps = {
  outputUrl: string;
  outputFileName: string;
  outputSize: number;
  originalSize: number;
  onDownload?: () => void;
  onReset: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function ResultPanel({
  outputUrl,
  outputFileName,
  outputSize,
  originalSize,
  onDownload,
  onReset,
}: ResultPanelProps) {
  return (
    <section className="workspace-section result-panel">
      <div className="result-heading">
        <h2>Ses dosyası üretildi</h2>
      </div>

      <div className="result-footer-row">
        <div className="result-metrics">
          <strong>{formatBytes(originalSize)} → {formatBytes(outputSize)}</strong>
        </div>

        <div className="action-row">
          <a className="download-link" href={outputUrl} download={outputFileName} onClick={onDownload}>
            İndir
          </a>
          <button type="button" onClick={onReset}>
            Yeni Video
          </button>
        </div>
      </div>
    </section>
  );
}
