import type { CompressPreset, CompressStatus, LoadedPdf } from "../lib/types";

type CompressPanelProps = {
  available: boolean | null;
  status: CompressStatus;
  preset: CompressPreset;
  onPresetChange: (preset: CompressPreset) => void;
  onCompress: () => void;
  loadedPdf: LoadedPdf | null;
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

export default function CompressPanel({
  available,
  status,
  preset,
  onPresetChange,
  onCompress,
  loadedPdf,
}: CompressPanelProps) {
  const reduction =
    status.kind === "success" && status.sizeOriginal > 0
      ? Math.round(((status.sizeOriginal - status.sizeResult) / status.sizeOriginal) * 100)
      : 0;

  return (
    <section className="compress-panel">
      <div className="section-header">
        <div><h2>Compress</h2></div>
      </div>

      {available === null ? <div className="status-banner">Compress motoru kontrol ediliyor...</div> : null}

      {available === false ? (
        <div className="status-banner is-warning">
          {status.kind === "web-disabled"
            ? status.message
            : "Compress motoru çalışmıyor. `pdf-compress-server` açık ve Ghostscript hazır olmalı."}
        </div>
      ) : null}

      {available === true ? (
        <>
          <div className="preset-group">
            <button
              type="button"
              className={preset === "web" ? "is-active" : ""}
              onClick={() => onPresetChange("web")}
            >
              <strong>Web</strong>
              <span>Küçük dosya, düşük kalite</span>
            </button>
            <button
              type="button"
              className={preset === "balanced" ? "is-active" : ""}
              onClick={() => onPresetChange("balanced")}
            >
              <strong>Balanced</strong>
              <span>Dengeli sıkıştırma</span>
            </button>
            <button
              type="button"
              className={preset === "strong" ? "is-active" : ""}
              onClick={() => onPresetChange("strong")}
            >
              <strong>Strong</strong>
              <span>Agresif sıkıştırma, kalite düşebilir</span>
            </button>
          </div>

          <button
            type="button"
            className="compress-button"
            disabled={!loadedPdf || status.kind === "loading"}
            onClick={onCompress}
          >
            {status.kind === "loading" ? "Sıkıştırılıyor..." : "PDF'i Sıkıştır"}
          </button>
        </>
      ) : null}

      {status.kind === "success" ? (
        <div className="compress-result">
          <strong>
            {formatBytes(status.sizeOriginal)} → {formatBytes(status.sizeResult)} ({reduction}% küçüldü)
          </strong>
          <a className="download-link" href={status.downloadUrl} download={status.fileName}>
            İndir
          </a>
          <p>Sonuç PDF içeriğine bağlıdır.</p>
        </div>
      ) : null}

      {status.kind === "error" ? <div className="status-banner is-error">{status.message}</div> : null}
    </section>
  );
}
