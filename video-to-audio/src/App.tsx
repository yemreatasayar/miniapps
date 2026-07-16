import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AudioSettingsPanel from "./components/AudioSettings";
import DropZone from "./components/DropZone";
import ProgressPanel from "./components/ProgressPanel";
import ResultPanel from "./components/ResultPanel";
import Toast from "./components/Toast";
import Waveform, { type WaveformTarget } from "./components/Waveform";
import { extractAudio, loadFFmpeg, terminateFFmpeg } from "./lib/ffmpeg-service";
import { trackAppEvent, trackProcessSuccess } from "./lib/analytics";
import type { AudioSettings, CutterSelection, LoadedVideo, ProcessStatus } from "./lib/types";
import { decodeVideoWaveform, formatTime } from "./lib/waveform";

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
  const [selection, setSelection] = useState<CutterSelection>({ startSec: 0, endSec: 0 });
  const [playheadSec, setPlayheadSec] = useState(-1);
  const [activeWaveformTarget, setActiveWaveformTarget] = useState<WaveformTarget>("start");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const mediaElementRef = useRef<HTMLVideoElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const selectionRef = useRef(selection);
  const isProcessing = status.kind === "loading-ffmpeg" || status.kind === "processing";
  const isBusy = isPreparingPreview || isProcessing;

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

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    const mediaElement = document.createElement("video");
    mediaElement.preload = "metadata";
    mediaElement.playsInline = true;

    const handleTimeUpdate = () => {
      const currentSelection = selectionRef.current;
      if (currentSelection.endSec > 0 && mediaElement.currentTime >= currentSelection.endSec) {
        mediaElement.pause();
        mediaElement.currentTime = currentSelection.endSec;
        setPlayheadSec(currentSelection.endSec);
        return;
      }
      setPlayheadSec(mediaElement.currentTime);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setPlayheadSec(selectionRef.current.endSec);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    mediaElement.addEventListener("timeupdate", handleTimeUpdate);
    mediaElement.addEventListener("ended", handleEnded);
    mediaElement.addEventListener("play", handlePlay);
    mediaElement.addEventListener("pause", handlePause);
    mediaElementRef.current = mediaElement;

    return () => {
      mediaElement.pause();
      mediaElement.removeAttribute("src");
      mediaElement.load();
      mediaElement.removeEventListener("timeupdate", handleTimeUpdate);
      mediaElement.removeEventListener("ended", handleEnded);
      mediaElement.removeEventListener("play", handlePlay);
      mediaElement.removeEventListener("pause", handlePause);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      mediaElementRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    let animationFrameId = 0;
    const syncPlayhead = () => {
      const mediaElement = mediaElementRef.current;
      if (!mediaElement || mediaElement.paused) return;

      const currentSelection = selectionRef.current;
      if (mediaElement.currentTime >= currentSelection.endSec) {
        mediaElement.pause();
        mediaElement.currentTime = currentSelection.endSec;
        setPlayheadSec(currentSelection.endSec);
        return;
      }

      setPlayheadSec(mediaElement.currentTime);
      animationFrameId = window.requestAnimationFrame(syncPlayhead);
    };

    animationFrameId = window.requestAnimationFrame(syncPlayhead);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  const fileSummary = useMemo(() => {
    if (!loadedVideo) return "Video bekleniyor";
    return `${loadedVideo.fileName} · ${formatBytes(loadedVideo.fileSize)}`;
  }, [loadedVideo]);

  const formatSummary = useMemo(() => getFormatSummary(settings), [settings]);

  async function handleFileSelected(file: File) {
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)) {
      setToast("Lütfen bir video dosyası seç.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setIsPreparingPreview(true);

    try {
      const preview = await decodeVideoWaveform(file, previewUrl);
      if (status.kind === "success") URL.revokeObjectURL(status.outputUrl);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);

      previewUrlRef.current = previewUrl;
      setLoadedVideo({
        file,
        fileName: file.name,
        fileSize: file.size,
        duration: preview.duration,
        waveformData: preview.waveformData,
        waveformAvailable: preview.waveformAvailable,
      });
      setSelection({ startSec: 0, endSec: preview.duration });
      setPlayheadSec(-1);
      setActiveWaveformTarget("start");
      setIsPlaying(false);
      setStatus({ kind: "idle" });

      if (mediaElementRef.current) {
        mediaElementRef.current.pause();
        mediaElementRef.current.src = previewUrl;
        mediaElementRef.current.load();
      }

      if (preview.duration <= 0) {
        setToast("Ses önizlemesi bu video biçiminde kullanılamıyor. Video tam uzunlukta işlenebilir.");
      } else if (!preview.waveformAvailable) {
        setToast("Dalga formu bu video biçiminde gösterilemiyor; zaman seçimi kullanılabilir.");
      }
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      setToast(error instanceof Error ? error.message : "Video önizlemesi hazırlanamadı.");
    } finally {
      setIsPreparingPreview(false);
    }
  }

  const handleSelectionChange = useCallback(
    (start: number, end: number) => {
      if (!loadedVideo) return;
      const clampedStart = Math.max(0, Math.min(start, loadedVideo.duration - 0.1));
      const clampedEnd = Math.min(loadedVideo.duration, Math.max(end, clampedStart + 0.1));
      setSelection({ startSec: clampedStart, endSec: clampedEnd });
      setPlayheadSec((current) =>
        current < 0 ? current : Math.max(clampedStart, Math.min(current, clampedEnd))
      );
    },
    [loadedVideo]
  );

  const handleStartChange = useCallback(
    (nextStartSec: number) => {
      if (!loadedVideo) return;
      const startSec = Math.max(0, Math.min(nextStartSec, selection.endSec - 0.1));
      setSelection((current) => ({ ...current, startSec }));
      setPlayheadSec((current) => (current < 0 ? current : Math.max(startSec, current)));
    },
    [loadedVideo, selection.endSec]
  );

  const handleEndChange = useCallback(
    (nextEndSec: number) => {
      if (!loadedVideo) return;
      const endSec = Math.min(loadedVideo.duration, Math.max(nextEndSec, selection.startSec + 0.1));
      setSelection((current) => ({ ...current, endSec }));
      setPlayheadSec((current) => (current < 0 ? current : Math.min(endSec, current)));
    },
    [loadedVideo, selection.startSec]
  );

  const handlePlayheadChange = useCallback(
    (nextSec: number) => {
      const clampedSec = Math.max(selection.startSec, Math.min(nextSec, selection.endSec));
      if (mediaElementRef.current) mediaElementRef.current.currentTime = clampedSec;
      setPlayheadSec(clampedSec);
    },
    [selection.endSec, selection.startSec]
  );

  const handleWaveformTargetChange = useCallback(
    (target: WaveformTarget) => {
      setActiveWaveformTarget(target);
      if (target === "playhead" && playheadSec < 0) handlePlayheadChange(selection.startSec);
    },
    [handlePlayheadChange, playheadSec, selection.startSec]
  );

  const handleWaveformNudge = useCallback(
    (deltaSec: number) => {
      if (!loadedVideo) return;
      if (activeWaveformTarget === "start") {
        handleStartChange(selection.startSec + deltaSec);
      } else if (activeWaveformTarget === "end") {
        handleEndChange(selection.endSec + deltaSec);
      } else {
        handlePlayheadChange((playheadSec >= 0 ? playheadSec : selection.startSec) + deltaSec);
      }
    },
    [
      activeWaveformTarget,
      handleEndChange,
      handlePlayheadChange,
      handleStartChange,
      loadedVideo,
      playheadSec,
      selection.endSec,
      selection.startSec,
    ]
  );

  function handlePlay(): void {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;
    const canResume =
      mediaElement.currentTime >= selection.startSec && mediaElement.currentTime < selection.endSec - 0.01;
    const nextTime = canResume ? mediaElement.currentTime : selection.startSec;
    mediaElement.currentTime = nextTime;
    setActiveWaveformTarget("playhead");
    setPlayheadSec(nextTime);
    void mediaElement.play().catch(() => setToast("Bu video biçiminde ses önizlemesi başlatılamadı."));
  }

  function handleTogglePlayback(): void {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;
    if (isPlaying) {
      mediaElement.pause();
      setPlayheadSec(mediaElement.currentTime);
      return;
    }
    handlePlay();
  }

  async function handleConvert() {
    if (!loadedVideo) return;
    if (loadedVideo.duration > 0 && selection.endSec - selection.startSec < 0.1) {
      setToast("Seçim en az 0,1 saniye olmalı.");
      return;
    }

    try {
      mediaElementRef.current?.pause();
      setStatus({ kind: "loading-ffmpeg", progress: 0 });
      await loadFFmpeg((progress) => setStatus({ kind: "loading-ffmpeg", progress }));

      setStatus({ kind: "processing", progress: 0 });
      const { blob, fileName } = await extractAudio(
        loadedVideo.file,
        settings,
        selection,
        loadedVideo.duration,
        (progress) => setStatus({ kind: "processing", progress })
      );

      const outputUrl = URL.createObjectURL(blob);
      setStatus({
        kind: "success",
        outputUrl,
        outputFileName: fileName,
        outputSize: blob.size,
      });
      trackProcessSuccess({
        process_type: "extract_audio",
        export_format: settings.format,
        trimmed:
          loadedVideo.duration > 0 &&
          (selection.startSec > 0.05 || selection.endSec < loadedVideo.duration - 0.05),
        input_size_kb: Math.max(1, Math.round(loadedVideo.fileSize / 1024)),
        output_size_kb: Math.max(1, Math.round(blob.size / 1024)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dönüştürme başarısız.";
      setStatus({ kind: "error", message });
      setToast(message);
      trackAppEvent("process_error", {
        process_type: "extract_audio",
        error_code: "conversion_failed",
        error_stage: "process",
      });
    }
  }

  function handleReset() {
    if (isBusy) {
      terminateFFmpeg();
    }
    if (status.kind === "success") {
      URL.revokeObjectURL(status.outputUrl);
    }
    if (mediaElementRef.current) {
      mediaElementRef.current.pause();
      mediaElementRef.current.removeAttribute("src");
      mediaElementRef.current.load();
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setLoadedVideo(null);
    setSelection({ startSec: 0, endSec: 0 });
    setPlayheadSec(-1);
    setActiveWaveformTarget("start");
    setIsPlaying(false);
    setStatus({ kind: "idle" });
  }

  const selectionDuration = Math.max(0, selection.endSec - selection.startSec);

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
            <h1>Videodan ses çıkar.</h1>
            <p className="hero-description">
              MP3, WAV veya orijinal ses akışı olarak indir.
            </p>

            <div className="hero-stats">
              <div className="hero-stat">
                <strong>3 format</strong>
                <span>MP3, WAV, Original</span>
              </div>
              <div className="hero-stat">
                <strong>Yerelde işlem</strong>
                <span>Tarayıcıda çalışır</span>
              </div>
              <div className="hero-stat">
                <strong>Kolay yükle</strong>
                <span>Seç veya sürükle</span>
              </div>
            </div>
          </div>

          <div className="hero-side">
            <DropZone onFileSelected={(file) => void handleFileSelected(file)} loading={isBusy} />
          </div>
        </section>
      ) : (
        <>
          <section className="hero-panel hero-panel-loaded">
            <div className="hero-copy">
              <div className="loaded-file-copy">
                <h1>{loadedVideo.fileName}</h1>
                <p className="hero-description">
                  {formatBytes(loadedVideo.fileSize)}
                  {loadedVideo.duration > 0 ? ` · Seçim ${formatTime(selectionDuration)}` : ""}
                  {` · ${formatSummary}`}
                </p>
              </div>

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
          </section>

          <section className="workspace-section waveform-section">
            <div className="section-header">
              <div>
                <h2>Kes ve önizle</h2>
              </div>
            </div>

            {loadedVideo.duration > 0 ? (
              <>
                <Waveform
                  data={loadedVideo.waveformData}
                  duration={loadedVideo.duration}
                  startSec={selection.startSec}
                  endSec={selection.endSec}
                  playheadSec={playheadSec}
                  activeTarget={activeWaveformTarget}
                  disabled={isBusy}
                  onSelectionChange={handleSelectionChange}
                  onPlayheadChange={handlePlayheadChange}
                  onActiveTargetChange={handleWaveformTargetChange}
                  onNudge={handleWaveformNudge}
                  onTogglePlayback={handleTogglePlayback}
                />

                {!loadedVideo.waveformAvailable ? (
                  <p className="waveform-note">
                    Dalga formu bu video biçiminde gösterilemiyor. Zaman seçimi ve ses önizlemesi
                    kullanılabilir.
                  </p>
                ) : null}

                <div className="time-inputs">
                  <label
                    className={`time-input-group ${activeWaveformTarget === "start" ? "is-active" : ""}`}
                    onFocus={() => setActiveWaveformTarget("start")}
                  >
                    <span>Başlangıç</span>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, selection.endSec - 0.1)}
                      step={0.1}
                      value={selection.startSec.toFixed(1)}
                      disabled={isBusy}
                      onChange={(event) =>
                        handleStartChange(Number.parseFloat(event.target.value) || 0)
                      }
                    />
                    <span className="unit">sn</span>
                  </label>

                  <button
                    type="button"
                    className={`time-marker-control ${activeWaveformTarget === "playhead" ? "is-active" : ""}`}
                    onClick={() => handleWaveformTargetChange("playhead")}
                    disabled={isBusy}
                  >
                    <span>Oynatma imleci</span>
                    <strong>
                      {formatTime(playheadSec >= 0 ? playheadSec : selection.startSec)}
                    </strong>
                  </button>

                  <label
                    className={`time-input-group ${activeWaveformTarget === "end" ? "is-active" : ""}`}
                    onFocus={() => setActiveWaveformTarget("end")}
                  >
                    <span>Bitiş</span>
                    <input
                      type="number"
                      min={selection.startSec + 0.1}
                      max={loadedVideo.duration}
                      step={0.1}
                      value={selection.endSec.toFixed(1)}
                      disabled={isBusy}
                      onChange={(event) =>
                        handleEndChange(
                          Number.parseFloat(event.target.value) || loadedVideo.duration
                        )
                      }
                    />
                    <span className="unit">sn</span>
                  </label>

                  <div className="precision-nudge" role="group" aria-label="Hassas zaman ayarı">
                    <button
                      type="button"
                      onClick={() => handleWaveformNudge(-0.1)}
                      disabled={isBusy}
                      aria-label="Seçili noktayı 0,1 saniye geri al"
                      title="0,1 saniye geri"
                    >
                      ←
                    </button>
                    <span>0,1 sn</span>
                    <button
                      type="button"
                      onClick={() => handleWaveformNudge(0.1)}
                      disabled={isBusy}
                      aria-label="Seçili noktayı 0,1 saniye ileri al"
                      title="0,1 saniye ileri"
                    >
                      →
                    </button>
                  </div>

                  <div className="selection-duration">
                    <span>Seçim süresi</span>
                    <strong>{formatTime(selectionDuration)}</strong>
                  </div>

                  <button
                    type="button"
                    className="waveform-playback-toggle"
                    onClick={handleTogglePlayback}
                    disabled={isBusy}
                    aria-pressed={isPlaying}
                  >
                    {isPlaying ? "Duraklat" : "Oynat"}
                  </button>
                </div>
              </>
            ) : (
              <div className="preview-unavailable">
                <strong>Ses önizlemesi bu video biçiminde kullanılamıyor.</strong>
                <span>Video yine tam uzunlukta ses dosyasına dönüştürülebilir.</span>
              </div>
            )}
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
                  onDownload={() => trackAppEvent("export_download", { export_format: settings.format, file_count: 1 })}
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
                  {settings.format === "mp3" ? (
                    <div className="detail-item">
                      <span>Kalite</span>
                      <strong>{settings.bitrate} kbps</strong>
                    </div>
                  ) : null}
                  <div className="detail-item">
                    <span>Seçim</span>
                    <strong>
                      {loadedVideo.duration > 0 ? formatTime(selectionDuration) : "Tüm video"}
                    </strong>
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
