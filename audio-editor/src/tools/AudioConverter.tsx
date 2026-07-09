import { useEffect, useState } from "react";
import DropZone from "../components/DropZone";
import ProgressPanel from "../components/ProgressPanel";
import ResultPanel from "../components/ResultPanel";
import Waveform from "../components/Waveform";
import { convertAudio, loadFFmpeg, terminateFFmpeg } from "../lib/ffmpeg-service";
import { trackAppEvent, trackProcessSuccess } from "../lib/analytics";
import type { ConverterSettings, LoadedAudio, ProcessStatus } from "../lib/types";
import { decodeAudioFile, formatTime } from "../lib/waveform";

const SETTINGS_KEY = "audio-editor.converter-settings";

function getDefaultSettings(): ConverterSettings {
  return { outputFormat: "mp3", mp3Bitrate: "192", wavBitDepth: "16" };
}

function loadSettings(): ConverterSettings {
  if (typeof window === "undefined") return getDefaultSettings();

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as ConverterSettings) : getDefaultSettings();
  } catch {
    return getDefaultSettings();
  }
}

type AudioConverterProps = {
  onToast: (message: string) => void;
};

export default function AudioConverter({ onToast }: AudioConverterProps) {
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [settings, setSettings] = useState<ConverterSettings>(loadSettings);
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

  async function handleConvert(): Promise<void> {
    if (!audio) return;

    try {
      setStatus({ kind: "loading-ffmpeg", progress: 0 });
      await loadFFmpeg((progress) => setStatus({ kind: "loading-ffmpeg", progress }));

      const label =
        settings.outputFormat === "mp3"
          ? `MP3'e dönüştürülüyor (${settings.mp3Bitrate} kbps)`
          : `WAV'e dönüştürülüyor (${settings.wavBitDepth}-bit PCM)`;

      setStatus({ kind: "processing", progress: 0, label });
      const { blob, fileName } = await convertAudio(audio, settings, (progress) =>
        setStatus({ kind: "processing", progress, label })
      );

      setStatus({
        kind: "success",
        outputUrl: URL.createObjectURL(blob),
        outputFileName: fileName,
        outputSize: blob.size,
      });
      trackProcessSuccess({
        process_type: "audio_convert",
        export_format: settings.outputFormat,
        file_count: 1,
        input_size_kb: Math.max(1, Math.round(audio.fileSize / 1024)),
        output_size_kb: Math.max(1, Math.round(blob.size / 1024)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dönüştürme başarısız.";
      setStatus({ kind: "error", message });
      onToast(message);
      trackAppEvent("process_error", {
        process_type: "audio_convert",
        error_code: "conversion_failed",
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

  const formatSummary =
    settings.outputFormat === "mp3"
      ? `MP3 · ${settings.mp3Bitrate} kbps`
      : `WAV · ${settings.wavBitDepth}-bit PCM · Kayıpsız`;

  return (
    <div className="tool-panel">
      {!audio ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h1>Ses formatını dönüştür.</h1>
            <p className="hero-description">
              MP3 veya WAV olarak dışa aktar.
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
              <p className="hero-description">
                {formatTime(audio.duration)} · {formatSummary}
              </p>

              <div className="hero-actions">
                <button type="button" className="hero-secondary" onClick={handleReset}>
                  Başka Dosya
                </button>
                {status.kind === "idle" || status.kind === "error" ? (
                  <button type="button" className="hero-primary" onClick={() => void handleConvert()}>
                    Dönüştür
                  </button>
                ) : null}
              </div>
            </div>

            <div className="hero-side hero-side-summary">
              <div className="summary-card">
                <span className="summary-label">Kaynak</span>
                <strong>{audio.fileName.split(".").pop()?.toUpperCase() ?? "AUDIO"}</strong>
                <span>{formatTime(audio.duration)}</span>
              </div>
              <div className="summary-card summary-card-accent">
                <span className="summary-label">Çıktı</span>
                <strong>{settings.outputFormat.toUpperCase()}</strong>
                <span>{formatSummary}</span>
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
                <h2>Çıktı Formatı</h2>
              </div>
            </div>

            <div className="preset-group">
              <button
                type="button"
                className={settings.outputFormat === "mp3" ? "is-active" : ""}
                onClick={() => setSettings((current) => ({ ...current, outputFormat: "mp3" }))}
                disabled={isBusy}
              >
                <strong>MP3</strong>
                <span>Küçük dosya</span>
              </button>

              <button
                type="button"
                className={settings.outputFormat === "wav" ? "is-active" : ""}
                onClick={() => setSettings((current) => ({ ...current, outputFormat: "wav" }))}
                disabled={isBusy}
              >
                <strong>WAV</strong>
                <span>PCM · Kayıpsız</span>
              </button>
            </div>

            {settings.outputFormat === "mp3" ? (
              <div className="bitrate-row">
                <p className="bitrate-label">Bitrate</p>
                <div className="preset-group">
                  {(["128", "192", "320"] as const).map((bitrate) => (
                    <button
                      key={bitrate}
                      type="button"
                      className={settings.mp3Bitrate === bitrate ? "is-active" : ""}
                      onClick={() =>
                        setSettings((current) => ({ ...current, mp3Bitrate: bitrate }))
                      }
                      disabled={isBusy}
                    >
                      <strong>{bitrate} kbps</strong>
                      <span>
                        {bitrate === "128"
                          ? "Standart"
                          : bitrate === "192"
                            ? "Yüksek"
                            : "Maksimum"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {settings.outputFormat === "wav" ? (
              <div className="bitrate-row">
                <p className="bitrate-label">Bit Derinliği</p>
                <div className="preset-group">
                  {(["16", "24"] as const).map((bitDepth) => (
                    <button
                      key={bitDepth}
                      type="button"
                      className={settings.wavBitDepth === bitDepth ? "is-active" : ""}
                      onClick={() =>
                        setSettings((current) => ({ ...current, wavBitDepth: bitDepth }))
                      }
                      disabled={isBusy}
                    >
                      <strong>{bitDepth}-bit</strong>
                      <span>{bitDepth === "16" ? "CD kalitesi" : "Stüdyo kalitesi"}</span>
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
              onDownload={() => trackAppEvent("export_download", { export_format: settings.outputFormat, file_count: 1 })}
              onReset={handleReset}
            />
          ) : null}

          {status.kind === "error" ? <div className="status-banner is-error">{status.message}</div> : null}
        </>
      )}
    </div>
  );
}
