import { useEffect, useMemo, useState } from "react";
import AudioSettingsPanel from "./components/AudioSettings";
import DropZone from "./components/DropZone";
import ProgressPanel from "./components/ProgressPanel";
import ResultPanel from "./components/ResultPanel";
import Toast from "./components/Toast";
import { extractAudio, loadFFmpeg, terminateFFmpeg } from "./lib/ffmpeg-service";
import type { AudioSettings, LoadedVideo, ProcessStatus } from "./lib/types";

const SETTINGS_KEY = "video-to-audio.settings";

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

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

function getFormatSummary(settings: AudioSettings): string {
  if (settings.format === "mp3") return `MP3 · ${settings.bitrate} kbps`;
  if (settings.format === "wav") return "WAV · kayıpsız çıktı";
  return "Orijinal · encode etmeden kopyala";
}

const isDistribution = window.location.hostname === "miniapps.tr";

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/video-to-audio-logo.svg`;
  const [loadedVideo, setLoadedVideo] = useState<LoadedVideo | null>(null);
  const [settings, setSettings] = useState<AudioSettings>(() =>
    readStoredValue(SETTINGS_KEY, { format: "mp3", bitrate: "192" })
  );
  const [status, setStatus] = useState<ProcessStatus>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);
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

  const fileSummary = useMemo(() => {
    if (!loadedVideo) return "Video bekleniyor";
    return `${loadedVideo.fileName} · ${formatBytes(loadedVideo.fileSize)}`;
  }, [loadedVideo]);

  const formatSummary = useMemo(() => getFormatSummary(settings), [settings]);

  function handleFileSelected(file: File) {
    if (!file.type.startsWith("video/")) {
      setToast("Lütfen bir video dosyası seç.");
      return;
    }

    if (status.kind === "success") {
      URL.revokeObjectURL(status.outputUrl);
    }

    setLoadedVideo({
      file,
      fileName: file.name,
      fileSize: file.size,
    });
    setStatus({ kind: "idle" });
  }

  async function handleConvert() {
    if (!loadedVideo) return;

    try {
      setStatus({ kind: "loading-ffmpeg", progress: 0 });
      await loadFFmpeg((progress) => setStatus({ kind: "loading-ffmpeg", progress }));

      setStatus({ kind: "processing", progress: 0 });
      const { blob, fileName } = await extractAudio(loadedVideo.file, settings, (progress) =>
        setStatus({ kind: "processing", progress })
      );

      const outputUrl = URL.createObjectURL(blob);
      setStatus({
        kind: "success",
        outputUrl,
        outputFileName: fileName,
        outputSize: blob.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dönüştürme başarısız.";
      setStatus({ kind: "error", message });
      setToast(message);
    }
  }

  function handleReset() {
    if (isBusy) {
      terminateFFmpeg();
    }
    if (status.kind === "success") {
      URL.revokeObjectURL(status.outputUrl);
    }
    setLoadedVideo(null);
    setStatus({ kind: "idle" });
  }

  return (
    <main className="video-audio-shell">
      <header className="saas-header">
        <img
          className="brand-logo"
          src={logoUrl}
          alt="Video to Audio"
        />
      </header>

      {!loadedVideo ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h1>Videoyu bırak, sesi temiz ve hızlı biçimde dışa aktar.</h1>
            <p className="hero-description">
              Video dosyanı yerelde MP3, WAV veya orijinal ses akışına dönüştür.
              Dosyaların tarayıcı dışına çıkmaz.
            </p>

            <div className="hero-stats">
              <div className="hero-stat">
                <strong>3 format</strong>
                <span>MP3, WAV, Original</span>
              </div>
              <div className="hero-stat">
                <strong>Yerelde işlem</strong>
                <span>Sunucuya yükleme yok</span>
              </div>
              <div className="hero-stat">
                <strong>Hızlı başlangıç</strong>
                <span>Drag & drop veya dosya seç</span>
              </div>
            </div>
          </div>

          <div className="hero-side">
            <DropZone onFileSelected={handleFileSelected} loading={isBusy} />
          </div>
        </section>
      ) : (
        <>
          <section className="hero-panel hero-panel-loaded">
            <div className="hero-copy">
              <h1>{loadedVideo.fileName}</h1>
              <p className="hero-description">
                {formatBytes(loadedVideo.fileSize)} · {formatSummary}
              </p>

              <div className="hero-actions">
                <button type="button" className="hero-secondary" onClick={handleReset}>
                  Başka Video Seç
                </button>
                {status.kind === "idle" ? (
                  <button
                    type="button"
                    className="hero-primary"
                    onClick={() => void handleConvert()}
                  >
                    Sesi Çıkar
                  </button>
                ) : null}
              </div>
            </div>

            <div className="hero-side hero-side-summary">
              <div className="summary-card">
                <span className="summary-label">Kaynak dosya</span>
                <strong>{loadedVideo.fileName}</strong>
                <span>{formatBytes(loadedVideo.fileSize)}</span>
              </div>
              <div className="summary-card summary-card-accent">
                <span className="summary-label">Çıktı modu</span>
                <strong>{settings.format.toUpperCase()}</strong>
                <span>{formatSummary}</span>
              </div>
            </div>
          </section>

          <section className="workspace-grid">
            <div className="workspace-main">
              {isBusy && loadedVideo ? (
                <ProgressPanel
                  status={status}
                  fileName={loadedVideo.fileName}
                  fileSize={loadedVideo.fileSize}
                />
              ) : null}

              {status.kind === "success" && loadedVideo ? (
                <ResultPanel
                  outputUrl={status.outputUrl}
                  outputFileName={status.outputFileName}
                  outputSize={status.outputSize}
                  originalSize={loadedVideo.fileSize}
                  onReset={handleReset}
                />
              ) : null}

              {status.kind === "error" ? (
                <div className="status-banner is-error">{status.message}</div>
              ) : null}

              <AudioSettingsPanel
                settings={settings}
                onSettingsChange={setSettings}
                disabled={isBusy}
              />
            </div>

            <aside className="workspace-aside">
              <section className="workspace-section info-card">
                <div className="section-header">
                  <div>
                    <h2>Özet</h2>
                    <p>{fileSummary}</p>
                  </div>
                </div>
                <div className="detail-list">
                  <div className="detail-item">
                    <span>Format</span>
                    <strong>{settings.format.toUpperCase()}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Kalite</span>
                    <strong>{settings.format === "mp3" ? `${settings.bitrate} kbps` : "Otomatik"}</strong>
                  </div>
                </div>
              </section>

              <section className="workspace-section info-card">
                <div className="section-header">
                  <div>
                    <h2>İpucu</h2>
                    <p>En pratik seçimler</p>
                  </div>
                </div>
                <div className="tip-list">
                  <div className="tip-item">
                    <strong>MP3</strong>
                    <span>Genel paylaşım ve uyumluluk için en güvenli seçenek.</span>
                  </div>
                  <div className="tip-item">
                    <strong>WAV</strong>
                    <span>Düzenleme ve arşiv için daha temiz ama daha büyük çıktı.</span>
                  </div>
                  <div className="tip-item">
                    <strong>Original</strong>
                    <span>Encode etmeden hızlı ses ayırmak istediğinde kullan.</span>
                  </div>
                </div>
              </section>
            </aside>
          </section>
        </>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
      {isDistribution && (
        <footer className="miniapps-footer">
          <a href="https://miniapps.tr" aria-label="miniapps.tr">
            <img
              src={`${import.meta.env.BASE_URL}assets/miniapps-logo-dark.svg`}
              alt="miniapps.tr"
              className="miniapps-footer-logo"
            />
          </a>
        </footer>
      )}
    </main>
  );
}
