import { useEffect, useState } from "react";
import DropZone from "../components/DropZone";
import ProgressPanel from "../components/ProgressPanel";
import ResultPanel from "../components/ResultPanel";
import Waveform from "../components/Waveform";
import { loadFFmpeg, normalizeAudio, terminateFFmpeg } from "../lib/ffmpeg-service";
import { trackAppEvent, trackProcessSuccess } from "../lib/analytics";
import type { LoadedAudio, NormalizerSettings, ProcessStatus } from "../lib/types";
import { decodeAudioFile, formatTime } from "../lib/waveform";

const SETTINGS_KEY = "audio-editor.normalizer-settings";

function getDefaultSettings(): NormalizerSettings {
  return { mode: "loudness", targetDbFs: -1, targetLufs: -14 };
}

function loadSettings(): NormalizerSettings {
  if (typeof window === "undefined") return getDefaultSettings();

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as NormalizerSettings) : getDefaultSettings();
  } catch {
    return getDefaultSettings();
  }
}

type VolumeNormalizerProps = {
  onToast: (message: string) => void;
};

export default function VolumeNormalizer({ onToast }: VolumeNormalizerProps) {
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [settings, setSettings] = useState<NormalizerSettings>(loadSettings);
  const [status, setStatus] = useState<ProcessStatus>({ kind: "idle" });

  const isBusy = status.kind === "loading-ffmpeg" || status.kind === "processing";

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    return () => {
      if (status.kind === "success") {
        URL.revokeObjectURL(status.outputUrl);
      }
    };
  }, [status]);

  async function handleFileSelected(file: File): Promise<void> {
    if (!file.type.startsWith("audio/")) {
      onToast("Lütfen bir ses dosyası seç.");
      return;
    }

    try {
      const { waveformData, duration } = await decodeAudioFile(file);
      setAudio({
        file,
        fileName: file.name,
        fileSize: file.size,
        duration,
        waveformData,
      });
      setStatus({ kind: "idle" });
    } catch {
      onToast("Ses dosyası okunamadı.");
    }
  }

  async function handleNormalize(): Promise<void> {
    if (!audio) return;

    try {
      setStatus({ kind: "loading-ffmpeg", progress: 0 });
      await loadFFmpeg((progress) => setStatus({ kind: "loading-ffmpeg", progress }));

      const label =
        settings.mode === "peak"
          ? `Pik normalizasyonu (${settings.targetDbFs} dBFS)`
          : `Loudness normalizasyonu (${settings.targetLufs} LUFS)`;

      setStatus({ kind: "processing", progress: 0, label });
      const { blob, fileName } = await normalizeAudio(audio, settings, (progress) =>
        setStatus({ kind: "processing", progress, label })
      );

      setStatus({
        kind: "success",
        outputUrl: URL.createObjectURL(blob),
        outputFileName: fileName,
        outputSize: blob.size,
      });
      trackProcessSuccess({
        process_type: "audio_normalize",
        export_format: settings.mode,
        file_count: 1,
        input_size_kb: Math.max(1, Math.round(audio.fileSize / 1024)),
        output_size_kb: Math.max(1, Math.round(blob.size / 1024)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Normalizasyon başarısız.";
      setStatus({ kind: "error", message });
      onToast(message);
      trackAppEvent("process_error", {
        process_type: "audio_normalize",
        error_code: "normalization_failed",
        error_stage: "process",
      });
    }
  }

  function handleReset(): void {
    if (isBusy) {
      terminateFFmpeg();
    }

    setAudio(null);
    setStatus({ kind: "idle" });
  }

  return (
    <div className="tool-panel">
      {!audio ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h1>Ses seviyesini normalize et.</h1>
            <p className="hero-description">
              Peak veya LUFS hedefiyle seviyeyi dengede tut.
            </p>
          </div>

          <div className="hero-side">
            <DropZone onFileSelected={(file) => void handleFileSelected(file)} loading={isBusy} />
          </div>
        </section>
      ) : (
        <>
          <section className="hero-panel hero-panel-loaded">
            <div className="hero-copy">
              <h1>{audio.fileName}</h1>
              <p className="hero-description">{formatTime(audio.duration)}</p>

              <div className="hero-actions">
                <button type="button" className="hero-secondary" onClick={handleReset}>
                  Başka Dosya
                </button>
                {status.kind === "idle" || status.kind === "error" ? (
                  <button type="button" className="hero-primary" onClick={() => void handleNormalize()}>
                    Normalize Et
                  </button>
                ) : null}
              </div>
            </div>

            <div className="hero-side hero-side-summary">
              <div className="summary-card">
                <span className="summary-label">Mod</span>
                <strong>{settings.mode === "peak" ? "Peak" : "Loudness (LUFS)"}</strong>
              </div>
              <div className="summary-card summary-card-accent">
                <span className="summary-label">Hedef</span>
                <strong>
                  {settings.mode === "peak"
                    ? `${settings.targetDbFs} dBFS`
                    : `${settings.targetLufs} LUFS`}
                </strong>
              </div>
            </div>
          </section>

          <section className="workspace-section waveform-section">
            <div className="section-header">
              <div>
                <h2>Dalga Formu</h2>
              </div>
            </div>

            <Waveform
              data={audio.waveformData}
              duration={audio.duration}
              startSec={0}
              endSec={audio.duration}
              playheadSec={-1}
              onSelectionChange={() => {}}
              readOnly
            />
          </section>

          <section className="workspace-section">
            <div className="section-header">
              <div>
                <h2>Normalizasyon Ayarları</h2>
              </div>
            </div>

            <div className="preset-group">
              <button
                type="button"
                className={settings.mode === "loudness" ? "is-active" : ""}
                onClick={() => setSettings((current) => ({ ...current, mode: "loudness" }))}
                disabled={isBusy}
              >
                <strong>Loudness</strong>
                <span>LUFS hedefine göre</span>
              </button>

              <button
                type="button"
                className={settings.mode === "peak" ? "is-active" : ""}
                onClick={() => setSettings((current) => ({ ...current, mode: "peak" }))}
                disabled={isBusy}
              >
                <strong>Peak</strong>
                <span>Pik dBFS değerine göre</span>
              </button>
            </div>

            {settings.mode === "loudness" ? (
              <div className="bitrate-row">
                <p className="bitrate-label">Hedef LUFS: {settings.targetLufs}</p>
                <div className="preset-group">
                  {([-6, -9, -14, -16, -23] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={settings.targetLufs === value ? "is-active" : ""}
                      onClick={() => setSettings((current) => ({ ...current, targetLufs: value }))}
                      disabled={isBusy}
                    >
                      <strong>{value}</strong>
                      <span>
                        {value === -14
                          ? "Spotify / YouTube"
                          : value === -16
                            ? "Apple Music"
                            : value === -23
                              ? "EBU R128"
                              : value === -6
                                ? "Çok yüksek"
                                : "Dengeli"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {settings.mode === "peak" ? (
              <div className="bitrate-row">
                <p className="bitrate-label">Hedef Peak: {settings.targetDbFs} dBFS</p>
                <div className="preset-group">
                  {([-0.1, -1, -3, -6] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={settings.targetDbFs === value ? "is-active" : ""}
                      onClick={() => setSettings((current) => ({ ...current, targetDbFs: value }))}
                      disabled={isBusy}
                    >
                      <strong>{value}</strong>
                      <span>
                        {value === -0.1
                          ? "Maksimum"
                          : value === -1
                            ? "Güvenli"
                            : value === -3
                              ? "Dengeli"
                              : "Headroom"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {isBusy && (status.kind === "loading-ffmpeg" || status.kind === "processing") ? (
            <ProgressPanel status={status} />
          ) : null}

          {status.kind === "success" ? (
            <ResultPanel
              outputUrl={status.outputUrl}
              outputFileName={status.outputFileName}
              outputSize={status.outputSize}
              originalSize={audio.fileSize}
              onDownload={() => trackAppEvent("export_download", { export_format: settings.mode, file_count: 1 })}
              onReset={handleReset}
            />
          ) : null}

          {status.kind === "error" ? <div className="status-banner is-error">{status.message}</div> : null}
        </>
      )}
    </div>
  );
}
