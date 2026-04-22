import type { AudioSettings } from "../lib/types";

type AudioSettingsProps = {
  settings: AudioSettings;
  onSettingsChange: (settings: AudioSettings) => void;
  disabled: boolean;
};

export default function AudioSettings({ settings, onSettingsChange, disabled }: AudioSettingsProps) {
  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <h2>Ses Ayarları</h2>
          <p>Çıktı formatını ve MP3 kalite seviyesini seç.</p>
        </div>
      </div>

      <div className="preset-group">
        <button
          type="button"
          className={settings.format === "original" ? "is-active" : ""}
          onClick={() => onSettingsChange({ ...settings, format: "original" })}
          disabled={disabled}
        >
          <strong>Orijinal</strong>
          <span>Hızlı, encode yok</span>
        </button>
        <button
          type="button"
          className={settings.format === "mp3" ? "is-active" : ""}
          onClick={() => onSettingsChange({ ...settings, format: "mp3" })}
          disabled={disabled}
        >
          <strong>MP3</strong>
          <span>Evrensel uyumluluk</span>
        </button>
        <button
          type="button"
          className={settings.format === "wav" ? "is-active" : ""}
          onClick={() => onSettingsChange({ ...settings, format: "wav" })}
          disabled={disabled}
        >
          <strong>WAV</strong>
          <span>Kayıpsız, büyük dosya</span>
        </button>
      </div>

      {settings.format === "mp3" ? (
        <div className="bitrate-row">
          <span className="bitrate-label">Kalite</span>
          <div className="preset-group">
            {(["128", "192", "320"] as const).map((bitrate) => (
              <button
                key={bitrate}
                type="button"
                className={settings.bitrate === bitrate ? "is-active" : ""}
                onClick={() => onSettingsChange({ ...settings, bitrate })}
                disabled={disabled}
              >
                <strong>{bitrate} kbps</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
