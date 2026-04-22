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
  onReset,
}: ResultPanelProps) {
  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <h2>Hazır</h2>
          <p>Ses dosyası üretildi.</p>
        </div>
      </div>

      <div className="result-metrics">
        <strong>{formatBytes(originalSize)} → {formatBytes(outputSize)}</strong>
      </div>

      <div className="action-row">
        <a className="download-link" href={outputUrl} download={outputFileName}>
          İndir
        </a>
        <button type="button" onClick={onReset}>
          Yeni Video
        </button>
      </div>
    </section>
  );
}
