import { useState } from "react";
import { computeSmartQualities } from "../lib/quality-estimator";
import type { LoadedImage, SmartCompressSettings } from "../lib/types";

type SmartCompressPanelProps = {
  images: LoadedImage[];
  settings: SmartCompressSettings;
  onSettingsChange: (settings: SmartCompressSettings) => void;
  onCompress: () => void;
  busy: boolean;
  keepOriginalName: boolean;
  onKeepOriginalNameChange: (v: boolean) => void;
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

export default function SmartCompressPanel({
  images,
  settings,
  onSettingsChange,
  onCompress,
  busy,
  keepOriginalName,
  onKeepOriginalNameChange,
}: SmartCompressPanelProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const qualities = computeSmartQualities(
    images.map((image) => image.normalizedScore),
    settings.slider
  );

  return (
    <section className="compress-panel">
      <div className="section-header">
        <div><h2>Smart Compress</h2></div>
      </div>

      <div className="preset-group">
        {(["jpg", "webp", "png"] as const).map((format) => (
          <button
            key={format}
            type="button"
            className={settings.format === format ? "is-active" : ""}
            onClick={() => onSettingsChange({ ...settings, format })}
          >
            <strong>{format.toUpperCase()}</strong>
          </button>
        ))}
      </div>

      <div className="slider-panel">
        <div className="slider-label-row">
          <span>Sıkıştırma yok</span>
          <span>Maksimum eşitleme</span>
        </div>
        <input
          className="quality-slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.slider}
          onChange={(event) => onSettingsChange({ ...settings, slider: Number(event.target.value) })}
        />
      </div>

      {settings.format === "png" ? (
        <div className="status-banner is-warning">PNG çıktısı kayıpsızdır; boyut küçülmesi sınırlı olabilir.</div>
      ) : null}

      <ul className="quality-list">
        {images.map((image, index) => {
          const quality = qualities[index] ?? 1;
          const estimatedSize = image.fileSize * quality;

          return (
            <li key={image.id} className="quality-item">
              <span className="quality-name">{image.fileName}</span>
              <div className="quality-bar">
                <div className="quality-bar-fill" style={{ width: `${Math.round(quality * 100)}%` }} />
              </div>
              <span className="quality-percent">{Math.round(quality * 100)}%</span>
              <span className="quality-size">
                {formatBytes(image.fileSize)} → ~{formatBytes(estimatedSize)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="compress-name-row">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={keepOriginalName}
            onChange={(event) => onKeepOriginalNameChange(event.target.checked)}
          />
          <span className={`toggle-track ${keepOriginalName ? "is-on" : ""}`}>
            <span className="toggle-thumb" />
          </span>
          <span>Dosya adını koru</span>
        </label>
        <button
          type="button"
          className="infotip-trigger"
          aria-label="Bilgi"
          onClick={() => setInfoOpen((v) => !v)}
        >
          i
        </button>
        {infoOpen ? (
          <div className="infotip-box">
            Aktifken çıktı dosyalarına ".comp" eki eklenmez; orijinal dosya adı korunur.
          </div>
        ) : null}
      </div>

      <button type="button" className="compress-button" onClick={onCompress} disabled={busy || images.length === 0}>
        {busy ? "İşleniyor..." : "Tümünü Sıkıştır ve İndir"}
      </button>
    </section>
  );
}
