import type { ProcessStatus } from "../lib/types";

type ProgressPanelProps = {
  status: ProcessStatus;
  fileName: string;
  fileSize: number;
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

export default function ProgressPanel({ status, fileName, fileSize }: ProgressPanelProps) {
  const isLoading = status.kind === "loading-ffmpeg";
  const isProcessing = status.kind === "processing";
  const progress = Math.round(
    (isLoading || isProcessing ? status.progress : 0) * 100
  );
  const isLargeFile = fileSize > 200 * 1024 * 1024;

  return (
    <section className="workspace-section progress-section">
      <div className="section-header">
        <div>
          <h2>{isLoading ? "Dönüştürme motoru hazırlanıyor" : "İşleniyor..."}</h2>
          <p>{fileName} · {formatBytes(fileSize)}</p>
        </div>
      </div>

      <div className="progress-shell">
        {isLoading ? (
          <>
            <span className="progress-helper">
              WebAssembly modülü indiriliyor ve derleniyor. İlk açılışta 15–30 saniye sürebilir;
              sonraki kullanımlarda tarayıcı önbelleğinden anlık yüklenir.
            </span>
            <div className="progress-track">
              <div className="progress-fill progress-fill-indeterminate" />
            </div>
          </>
        ) : (
          <>
            <span className="progress-helper">
              Ses akışı çıkarılıyor. Bu sırada sayfayı açık bırakman yeterli.
            </span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <strong>{progress}%</strong>
          </>
        )}
      </div>

      {isLargeFile ? (
        <div className="status-banner is-warning">Büyük dosyalar birkaç dakika alabilir.</div>
      ) : null}
    </section>
  );
}
