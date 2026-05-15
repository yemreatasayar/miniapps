import { useLang } from "../lib/LangContext";
import type { ProcessSettings, VideoFormat } from "../lib/types";

type Props = {
  settings: ProcessSettings;
  onSettingsChange: (s: ProcessSettings) => void;
  disabled: boolean;
};

const FORMAT_VALUES: VideoFormat[] = ["original", "mp4", "webm", "mov"];

export default function CompressPanel({ settings, onSettingsChange, disabled }: Props) {
  const { t } = useLang();

  function update<K extends keyof ProcessSettings>(key: K, value: ProcessSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  function crfLabel(crf: number): string {
    if (crf <= 20) return t.crfLossless;
    if (crf <= 26) return t.crfBalanced;
    if (crf <= 32) return t.crfSmall;
    return t.crfVerySmall;
  }

  const formatLabels: Record<VideoFormat, { label: string; desc: string }> = {
    original: { label: t.fmtOriginalLabel, desc: t.fmtOriginalDesc },
    mp4:      { label: "MP4 (H.264)",       desc: t.fmtMp4Desc },
    webm:     { label: "WebM (VP9)",         desc: t.fmtWebmDesc },
    mov:      { label: "MOV (H.264)",        desc: t.fmtMovDesc },
  };

  return (
    <div className="workspace-section settings-panel">
      <div className="section-header">
        <div>
          <h2>{t.compressTitle}</h2>
          <p>{t.compressDesc}</p>
        </div>
      </div>

      <div className="settings-group">
        <label className="settings-label">{t.outputFormatLabel}</label>
        <div className="format-grid">
          {FORMAT_VALUES.map((fmt) => (
            <button
              key={fmt}
              type="button"
              className={`format-option ${settings.outputFormat === fmt ? "is-active" : ""}`}
              onClick={() => update("outputFormat", fmt)}
              disabled={disabled}
            >
              <strong>{formatLabels[fmt].label}</strong>
              <span>{formatLabels[fmt].desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <label className="settings-label">
          {t.qualityLabel(settings.videoCrf)}
          <span className="crf-badge">({crfLabel(settings.videoCrf)})</span>
        </label>
        <div className="slider-row">
          <span className="slider-edge-label">{t.qualityHigh}</span>
          <input
            type="range"
            min={16}
            max={40}
            step={1}
            value={settings.videoCrf}
            onChange={(e) => update("videoCrf", Number(e.target.value))}
            disabled={disabled}
            className="quality-slider"
          />
          <span className="slider-edge-label">{t.qualitySmall}</span>
        </div>
        <p className="settings-hint">{t.qualityHint}</p>
      </div>

      <div className="settings-group">
        <div className="audio-header">
          <label className="settings-label">{t.audioLabel}</label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.includeAudio}
              onChange={(e) => update("includeAudio", e.target.checked)}
              disabled={disabled}
            />
            <span className={`toggle-track ${settings.includeAudio ? "is-on" : ""}`}>
              <span className="toggle-thumb" />
            </span>
            <span>{settings.includeAudio ? t.audioOn : t.audioOff}</span>
          </label>
        </div>

        {settings.includeAudio ? (
          <div className="radio-group">
            {(["64", "128", "192"] as const).map((bitrate) => (
              <label
                key={bitrate}
                className={`radio-option ${settings.audioBitrate === bitrate ? "is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="audioBitrate"
                  value={bitrate}
                  checked={settings.audioBitrate === bitrate}
                  onChange={() => update("audioBitrate", bitrate)}
                  disabled={disabled}
                />
                {bitrate} kbps{bitrate === "128" ? t.audioRecommended : ""}
              </label>
            ))}
          </div>
        ) : (
          <p className="settings-muted">{t.audioMuted}</p>
        )}
      </div>
    </div>
  );
}
