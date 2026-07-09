import type { CompressPreset, CompressStatus, LoadedPdf } from "../lib/types";
import { getPdfLocale } from "../lib/i18n";

type CompressPanelProps = {
  available: boolean | null;
  status: CompressStatus;
  preset: CompressPreset;
  onPresetChange: (preset: CompressPreset) => void;
  onCompress: () => void;
  onDownload?: () => void;
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
  onDownload,
  loadedPdf,
}: CompressPanelProps) {
  const locale = getPdfLocale();
  const copy =
    locale === "en"
      ? {
          title: "Compress",
          checking: "Checking compress engine...",
          unavailable: "Compress engine is not running. Start `pdf-compress-server` with Ghostscript ready.",
          web: "Small file, lower quality",
          balanced: "Balanced compression",
          strong: "Stronger compression",
          compressing: "Compressing...",
          button: "Compress PDF",
          download: "Download",
          resultNote: "Results depend on PDF content.",
          smaller: "smaller",
        }
      : {
          title: "Sıkıştır",
          checking: "Sıkıştırma motoru kontrol ediliyor...",
          unavailable: "Sıkıştırma motoru çalışmıyor. `pdf-compress-server` açık ve Ghostscript hazır olmalı.",
          web: "Küçük dosya, düşük kalite",
          balanced: "Dengeli sıkıştırma",
          strong: "Daha güçlü sıkıştırma",
          compressing: "Sıkıştırılıyor...",
          button: "PDF'i Sıkıştır",
          download: "İndir",
          resultNote: "Sonuç PDF içeriğine bağlıdır.",
          smaller: "küçüldü",
        };
  const reduction =
    status.kind === "success" && status.sizeOriginal > 0
      ? Math.round(((status.sizeOriginal - status.sizeResult) / status.sizeOriginal) * 100)
      : 0;

  return (
    <section className="compress-panel">
      <div className="section-header">
        <div><h2>{copy.title}</h2></div>
      </div>

      {available === null ? <div className="status-banner">{copy.checking}</div> : null}

      {available === false ? (
        <div className="status-banner is-warning">
          {status.kind === "web-disabled"
            ? status.message
            : copy.unavailable}
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
              <span>{copy.web}</span>
            </button>
            <button
              type="button"
              className={preset === "balanced" ? "is-active" : ""}
              onClick={() => onPresetChange("balanced")}
            >
              <strong>Balanced</strong>
              <span>{copy.balanced}</span>
            </button>
            <button
              type="button"
              className={preset === "strong" ? "is-active" : ""}
              onClick={() => onPresetChange("strong")}
            >
              <strong>Strong</strong>
              <span>{copy.strong}</span>
            </button>
          </div>

          <button
            type="button"
            className="compress-button"
            disabled={!loadedPdf || status.kind === "loading"}
            onClick={onCompress}
          >
            {status.kind === "loading" ? copy.compressing : copy.button}
          </button>
        </>
      ) : null}

      {status.kind === "success" ? (
        <div className="compress-result">
          <strong>
            {formatBytes(status.sizeOriginal)} → {formatBytes(status.sizeResult)} ({reduction}% {copy.smaller})
          </strong>
          <a className="download-link" href={status.downloadUrl} download={status.fileName} onClick={onDownload}>
            {copy.download}
          </a>
          <p>{copy.resultNote}</p>
        </div>
      ) : null}

      {status.kind === "error" ? <div className="status-banner is-error">{status.message}</div> : null}
    </section>
  );
}
