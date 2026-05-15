import { useCallback, useEffect, useMemo, useState } from "react";
import CompressPanel from "./components/CompressPanel";
import CutPanel from "./components/CutPanel";
import DropZone from "./components/DropZone";
import ProgressPanel from "./components/ProgressPanel";
import ResultPanel from "./components/ResultPanel";
import Toast from "./components/Toast";
import { useLang } from "./lib/LangContext";
import { loadFFmpeg, processVideo, terminateFFmpeg } from "./lib/ffmpeg-service";
import type { LoadedVideo, ProcessSettings, ProcessStatus } from "./lib/types";

const SETTINGS_KEY = "video-compressor.settings";

type StoredSettings = Omit<ProcessSettings, "segments">;

const DEFAULT_STORED: StoredSettings = {
  outputFormat: "mp4",
  videoCrf: 28,
  includeAudio: true,
  audioBitrate: "128",
};

function readStoredSettings(): StoredSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_STORED;
    return { ...DEFAULT_STORED, ...(JSON.parse(raw) as Partial<StoredSettings>) };
  } catch {
    return DEFAULT_STORED;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(1)} ${units[i]}`;
}

async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const url = URL.createObjectURL(file);
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

const isDistribution = typeof window !== "undefined" && window.location.hostname === "miniapps.tr";

export default function App() {
  const { t } = useLang();
  const logoUrl = `${import.meta.env.BASE_URL}assets/video-compressor-logo.svg`;
  const miniappsLogoUrl = `${import.meta.env.BASE_URL}assets/miniapps-logo-dark.svg`;

  const [loadedVideo, setLoadedVideo] = useState<LoadedVideo | null>(null);
  const [settings, setSettings] = useState<ProcessSettings>(() => ({
    ...readStoredSettings(),
    segments: [],
  }));
  const [status, setStatus] = useState<ProcessStatus>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);

  const isBusy = status.kind === "loading-ffmpeg" || status.kind === "processing";

  useEffect(() => {
    const { segments: _, ...toStore } = settings;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(toStore));
  }, [settings]);

  useEffect(() => {
    return () => {
      if (status.kind === "success") URL.revokeObjectURL(status.outputUrl);
    };
  }, [status]);

  const fileSummary = useMemo(() => {
    if (!loadedVideo) return t.waiting;
    return `${loadedVideo.fileName} · ${formatBytes(loadedVideo.fileSize)}`;
  }, [loadedVideo, t]);

  const hasCuts = useMemo(() => {
    if (!loadedVideo) return false;
    const segs = settings.segments;
    return segs.length > 1 ||
      (segs.length === 1 && (segs[0].start > 0.1 || segs[0].end < loadedVideo.duration - 0.1));
  }, [settings.segments, loadedVideo]);

  const processSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${settings.outputFormat.toUpperCase()} · CRF ${settings.videoCrf}`);
    if (!settings.includeAudio) parts.push(t.audioOff);
    if (hasCuts) parts.push(t.pieceCount(settings.segments.length));
    return parts.join(" · ");
  }, [settings, hasCuts, t]);

  const handleFileSelected = useCallback(async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setToast(t.notVideoFile);
      return;
    }
    if (status.kind === "success") URL.revokeObjectURL(status.outputUrl);

    const duration = await getVideoDuration(file);
    const previewUrl = URL.createObjectURL(file);

    setLoadedVideo({ file, fileName: file.name, fileSize: file.size, duration, previewUrl });
    setSettings(prev => ({
      ...prev,
      segments: [{ id: crypto.randomUUID(), start: 0, end: Math.max(duration, 0.1) }],
    }));
    setStatus({ kind: "idle" });
  }, [status, t]);

  async function handleProcess() {
    if (!loadedVideo) return;
    try {
      setStatus({ kind: "loading-ffmpeg", progress: 0 });
      await loadFFmpeg(p => setStatus({ kind: "loading-ffmpeg", progress: p }));

      const label = hasCuts ? t.processingSegments : t.processingVideo;
      setStatus({ kind: "processing", progress: 0, label });
      const { blob, fileName } = await processVideo(
        loadedVideo,
        settings,
        p => setStatus({ kind: "processing", progress: p, label })
      );
      const outputUrl = URL.createObjectURL(blob);
      setStatus({ kind: "success", outputUrl, outputFileName: fileName, outputSize: blob.size });
    } catch (error) {
      const message = error instanceof Error ? error.message : t.processFailed;
      setStatus({ kind: "error", message });
      setToast(message);
    }
  }

  function handleReset() {
    if (isBusy) terminateFFmpeg();
    if (status.kind === "success") URL.revokeObjectURL(status.outputUrl);
    if (loadedVideo) URL.revokeObjectURL(loadedVideo.previewUrl);
    setLoadedVideo(null);
    setStatus({ kind: "idle" });
  }

  const canProcess = loadedVideo && !isBusy && status.kind !== "success";

  return (
    <main className="video-compressor-shell">
      <header className="saas-header">
        <img className="brand-logo" src={logoUrl} alt="Video Compressor" />
      </header>

      {!loadedVideo ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h1>{t.heroTitle}</h1>
            <p className="hero-description">{t.heroDesc}</p>
            <div className="hero-stats">
              <div className="hero-stat">
                <strong>{t.stat1Title}</strong>
                <span>{t.stat1Desc}</span>
              </div>
              <div className="hero-stat">
                <strong>{t.stat2Title}</strong>
                <span>{t.stat2Desc}</span>
              </div>
              <div className="hero-stat">
                <strong>{t.stat3Title}</strong>
                <span>{t.stat3Desc}</span>
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
              <p className="hero-description">{fileSummary}</p>
              <div className="hero-actions">
                <button type="button" className="hero-secondary" onClick={handleReset}>
                  {t.changeVideo}
                </button>
                {canProcess ? (
                  <button type="button" className="hero-primary" onClick={() => void handleProcess()}>
                    {t.processBtn}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="hero-side hero-side-summary">
              <div className="summary-card">
                <span className="summary-label">{t.sourceFileLabel}</span>
                <strong>{loadedVideo.fileName}</strong>
                <span>{formatBytes(loadedVideo.fileSize)}</span>
              </div>
              <div className="summary-card summary-card-accent">
                <span className="summary-label">{t.operationsLabel}</span>
                <strong>{processSummary}</strong>
                <span>{loadedVideo.duration > 0 ? `${loadedVideo.duration.toFixed(1)}s` : "—"}</span>
              </div>
            </div>
          </section>

          <section className="workspace-grid">
            <div className="workspace-main">
              {isBusy && (status.kind === "loading-ffmpeg" || status.kind === "processing") ? (
                <ProgressPanel status={status} />
              ) : null}

              {status.kind === "success" ? (
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

              <CompressPanel settings={settings} onSettingsChange={setSettings} disabled={isBusy} />
              <CutPanel video={loadedVideo} settings={settings} onSettingsChange={setSettings} disabled={isBusy} />
            </div>

            <aside className="workspace-aside">
              <section className="workspace-section info-card">
                <div className="section-header">
                  <div><h2>{t.summaryTitle}</h2><p>{fileSummary}</p></div>
                </div>
                <div className="detail-list">
                  <div className="detail-item"><span>{t.sizeLabel}</span><strong>{formatBytes(loadedVideo.fileSize)}</strong></div>
                  <div className="detail-item"><span>{t.durationLabel}</span><strong>{loadedVideo.duration > 0 ? `${loadedVideo.duration.toFixed(1)}s` : "—"}</strong></div>
                  <div className="detail-item"><span>{t.outputFormatSummary}</span><strong>{settings.outputFormat.toUpperCase()}</strong></div>
                  <div className="detail-item"><span>CRF</span><strong>{settings.videoCrf}</strong></div>
                  <div className="detail-item"><span>{t.audioSummaryLabel}</span><strong>{settings.includeAudio ? `${settings.audioBitrate} kbps` : t.audioOff}</strong></div>
                  <div className="detail-item"><span>{t.segmentLabel}</span><strong>{hasCuts ? t.pieceCount(settings.segments.length) : t.fullVideo}</strong></div>
                </div>
              </section>

              <section className="workspace-section info-card">
                <div className="section-header">
                  <div><h2>{t.tipsTitle}</h2><p>{t.tipsBest}</p></div>
                </div>
                <div className="tip-list">
                  <div className="tip-item"><strong>{t.tip1Title}</strong><span>{t.tip1Desc}</span></div>
                  <div className="tip-item"><strong>{t.tip2Title}</strong><span>{t.tip2Desc}</span></div>
                  <div className="tip-item"><strong>{t.tip3Title}</strong><span>{t.tip3Desc}</span></div>
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
            <img src={miniappsLogoUrl} alt="miniapps.tr" className="miniapps-footer-logo" />
          </a>
        </footer>
      )}
    </main>
  );
}
