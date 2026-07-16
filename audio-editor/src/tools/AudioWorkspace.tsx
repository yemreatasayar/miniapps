import { useCallback, useEffect, useRef, useState } from "react";
import DropZone from "../components/DropZone";
import ProgressPanel from "../components/ProgressPanel";
import ResultPanel from "../components/ResultPanel";
import Waveform, { type WaveformTarget } from "../components/Waveform";
import { loadFFmpeg, processAudio, terminateFFmpeg } from "../lib/ffmpeg-service";
import { trackAppEvent, trackProcessSuccess } from "../lib/analytics";
import type {
  AudioProcessingSettings,
  CutterSelection,
  LoadedAudio,
  ProcessStatus,
} from "../lib/types";
import { decodeAudioFile, formatTime } from "../lib/waveform";

const SETTINGS_KEY = "audio-editor.workspace-settings";

const DEFAULT_SETTINGS: AudioProcessingSettings = {
  normalizationEnabled: false,
  normalizer: {
    mode: "loudness",
    targetDbFs: -1,
    targetLufs: -14,
  },
  converter: {
    outputFormat: "mp3",
    mp3Bitrate: "192",
    wavBitDepth: "16",
  },
};

function loadSettings(): AudioProcessingSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as
      | Partial<AudioProcessingSettings>
      | null;
    if (!stored) return DEFAULT_SETTINGS;

    return {
      normalizationEnabled: stored.normalizationEnabled === true,
      normalizer: {
        ...DEFAULT_SETTINGS.normalizer,
        ...stored.normalizer,
      },
      converter: {
        ...DEFAULT_SETTINGS.converter,
        ...stored.converter,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(file.name);
}

type AudioWorkspaceProps = {
  onToast: (message: string) => void;
};

export default function AudioWorkspace({ onToast }: AudioWorkspaceProps) {
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [selection, setSelection] = useState<CutterSelection>({ startSec: 0, endSec: 0 });
  const [settings, setSettings] = useState<AudioProcessingSettings>(loadSettings);
  const [status, setStatus] = useState<ProcessStatus>({ kind: "idle" });
  const [playheadSec, setPlayheadSec] = useState(-1);
  const [activeWaveformTarget, setActiveWaveformTarget] = useState<WaveformTarget>("start");
  const [isPlaying, setIsPlaying] = useState(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const selectionRef = useRef(selection);

  const isBusy = status.kind === "loading-ffmpeg" || status.kind === "processing";

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Local storage can be unavailable in restricted browser contexts.
    }
  }, [settings]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    const audioElement = new window.Audio();

    const handleTimeUpdate = () => {
      const currentSelection = selectionRef.current;
      if (audioElement.currentTime >= currentSelection.endSec) {
        audioElement.pause();
        audioElement.currentTime = currentSelection.endSec;
        setPlayheadSec(currentSelection.endSec);
        return;
      }
      setPlayheadSec(audioElement.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setPlayheadSec(selectionRef.current.endSec);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audioElement.addEventListener("timeupdate", handleTimeUpdate);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);
    audioElementRef.current = audioElement;

    return () => {
      audioElement.pause();
      audioElement.src = "";
      audioElement.removeEventListener("timeupdate", handleTimeUpdate);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      audioElementRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    let animationFrameId = 0;
    const syncPlayhead = () => {
      const audioElement = audioElementRef.current;
      if (!audioElement || audioElement.paused) return;

      const currentSelection = selectionRef.current;
      if (audioElement.currentTime >= currentSelection.endSec) {
        audioElement.pause();
        audioElement.currentTime = currentSelection.endSec;
        setPlayheadSec(currentSelection.endSec);
        return;
      }

      setPlayheadSec(audioElement.currentTime);
      animationFrameId = window.requestAnimationFrame(syncPlayhead);
    };

    animationFrameId = window.requestAnimationFrame(syncPlayhead);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  async function handleFileSelected(file: File): Promise<void> {
    if (!isAudioFile(file)) {
      onToast("Lütfen bir ses dosyası seç.");
      return;
    }

    try {
      const { waveformData, duration } = await decodeAudioFile(file);
      const previewUrl = URL.createObjectURL(file);

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (status.kind === "success") URL.revokeObjectURL(status.outputUrl);

      previewUrlRef.current = previewUrl;
      setAudio({
        file,
        fileName: file.name,
        fileSize: file.size,
        duration,
        waveformData,
      });
      setSelection({ startSec: 0, endSec: duration });
      setStatus({ kind: "idle" });
      setPlayheadSec(-1);
      setActiveWaveformTarget("start");
      setIsPlaying(false);

      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = previewUrl;
      }
    } catch {
      onToast("Ses dosyası okunamadı.");
    }
  }

  const handleSelectionChange = useCallback(
    (start: number, end: number) => {
      if (!audio) return;
      const clampedStart = Math.max(0, Math.min(start, audio.duration - 0.1));
      const clampedEnd = Math.min(audio.duration, Math.max(end, clampedStart + 0.1));
      setSelection({ startSec: clampedStart, endSec: clampedEnd });
      setPlayheadSec((current) =>
        current < 0 ? current : Math.max(clampedStart, Math.min(current, clampedEnd))
      );
    },
    [audio]
  );

  const handleStartChange = useCallback(
    (nextStartSec: number) => {
      if (!audio) return;
      const startSec = Math.max(0, Math.min(nextStartSec, selection.endSec - 0.1));
      setSelection((current) => ({
        ...current,
        startSec,
      }));
      setPlayheadSec((current) => (current < 0 ? current : Math.max(startSec, current)));
    },
    [audio, selection.endSec]
  );

  const handleEndChange = useCallback(
    (nextEndSec: number) => {
      if (!audio) return;
      const endSec = Math.min(audio.duration, Math.max(nextEndSec, selection.startSec + 0.1));
      setSelection((current) => ({
        ...current,
        endSec,
      }));
      setPlayheadSec((current) => (current < 0 ? current : Math.min(endSec, current)));
    },
    [audio, selection.startSec]
  );

  const handlePlayheadChange = useCallback(
    (nextSec: number) => {
      if (!audio) return;
      const clampedSec = Math.max(selection.startSec, Math.min(nextSec, selection.endSec));
      if (audioElementRef.current) audioElementRef.current.currentTime = clampedSec;
      setPlayheadSec(clampedSec);
    },
    [audio, selection.endSec, selection.startSec]
  );

  const handleWaveformTargetChange = useCallback(
    (target: WaveformTarget) => {
      setActiveWaveformTarget(target);
      if (target === "playhead" && playheadSec < 0) {
        handlePlayheadChange(selection.startSec);
      }
    },
    [handlePlayheadChange, playheadSec, selection.startSec]
  );

  const handleWaveformNudge = useCallback(
    (deltaSec: number) => {
      if (!audio) return;

      if (activeWaveformTarget === "start") {
        handleStartChange(selection.startSec + deltaSec);
        return;
      }

      if (activeWaveformTarget === "end") {
        handleEndChange(selection.endSec + deltaSec);
        return;
      }

      const currentPlayhead = playheadSec >= 0 ? playheadSec : selection.startSec;
      handlePlayheadChange(currentPlayhead + deltaSec);
    },
    [
      activeWaveformTarget,
      audio,
      handlePlayheadChange,
      handleEndChange,
      handleStartChange,
      playheadSec,
      selection.endSec,
      selection.startSec,
    ]
  );

  function handlePlay(): void {
    const audioElement = audioElementRef.current;
    if (!audioElement) return;

    const currentTime = audioElement.currentTime;
    const canResume =
      currentTime >= selection.startSec && currentTime < selection.endSec - 0.01;
    const nextTime = canResume ? currentTime : selection.startSec;

    audioElement.currentTime = nextTime;
    setActiveWaveformTarget("playhead");
    setPlayheadSec(nextTime);
    void audioElement.play().catch(() => onToast("Önizleme başlatılamadı."));
  }

  function handleStop(): void {
    const audioElement = audioElementRef.current;
    if (!audioElement) return;
    audioElement.pause();
    setIsPlaying(false);
    setPlayheadSec(audioElement.currentTime);
  }

  function handleTogglePlayback(): void {
    if (isPlaying) {
      handleStop();
      return;
    }
    handlePlay();
  }

  async function handleProcess(): Promise<void> {
    if (!audio) return;
    if (selection.endSec - selection.startSec < 0.1) {
      onToast("Seçim en az 0.1 saniye olmalı.");
      return;
    }

    try {
      if (status.kind === "success") URL.revokeObjectURL(status.outputUrl);
      setStatus({ kind: "loading-ffmpeg", progress: 0 });
      await loadFFmpeg((progress) => setStatus({ kind: "loading-ffmpeg", progress }));

      const label = "Ses düzenleniyor...";
      setStatus({ kind: "processing", progress: 0, label });
      const { blob, fileName } = await processAudio(audio, selection, settings, (progress) =>
        setStatus({ kind: "processing", progress, label })
      );

      setStatus({
        kind: "success",
        outputUrl: URL.createObjectURL(blob),
        outputFileName: fileName,
        outputSize: blob.size,
      });
      trackProcessSuccess({
        process_type: "audio_edit",
        export_format: settings.converter.outputFormat,
        normalization: settings.normalizationEnabled,
        trimmed:
          selection.startSec > 0.05 || selection.endSec < audio.duration - 0.05,
        input_size_kb: Math.max(1, Math.round(audio.fileSize / 1024)),
        output_size_kb: Math.max(1, Math.round(blob.size / 1024)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ses işlenemedi.";
      setStatus({ kind: "error", message });
      onToast(message);
      trackAppEvent("process_error", {
        process_type: "audio_edit",
        error_code: "audio_edit_failed",
        error_stage: "process",
      });
    }
  }

  function handleReset(): void {
    if (isBusy) terminateFFmpeg();
    handleStop();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (status.kind === "success") URL.revokeObjectURL(status.outputUrl);
    setAudio(null);
    setSelection({ startSec: 0, endSec: 0 });
    setActiveWaveformTarget("start");
    setStatus({ kind: "idle" });
  }

  const selectionDuration = Math.max(0, selection.endSec - selection.startSec);
  const formatSummary =
    settings.converter.outputFormat === "mp3"
      ? `MP3 · ${settings.converter.mp3Bitrate} kbps`
      : `WAV · ${settings.converter.wavBitDepth}-bit PCM`;
  const normalizationSummary = settings.normalizationEnabled
    ? settings.normalizer.mode === "loudness"
      ? `${settings.normalizer.targetLufs} LUFS`
      : `${settings.normalizer.targetDbFs} dBFS Peak`
    : "Kapalı";

  return (
    <div className="tool-panel integrated-audio-workspace">
      {!audio ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h1 className="audio-hero-title">
              <span>Sesi kes, dengele</span>
              <span>ve dönüştür.</span>
            </h1>
            <p className="hero-description">
              Tek yüklemede kırp, normalize et ve istediğin formatta dışa aktar.
            </p>
          </div>

          <div className="hero-side">
            <DropZone onFileSelected={(file) => void handleFileSelected(file)} loading={isBusy} />
          </div>
        </section>
      ) : (
        <>
          <section className="hero-panel hero-panel-loaded">
            <div className="loaded-hero-top">
              <div className="loaded-file-copy">
                <h1>{audio.fileName}</h1>
                <p className="hero-description">Toplam süre {formatTime(audio.duration)}</p>
              </div>

              <div className="hero-actions loaded-hero-actions">
                <button type="button" className="hero-secondary" onClick={handleReset}>
                  Başka Dosya
                </button>
                <button
                  type="button"
                  className="hero-primary"
                  onClick={() => void handleProcess()}
                  disabled={isBusy}
                >
                  Dışa Aktar
                </button>
              </div>
            </div>

            <div className="loaded-summary-grid">
              <div className="summary-card">
                <span className="summary-label">Seçim</span>
                <strong>{formatTime(selectionDuration)}</strong>
                <span>{formatTime(selection.startSec)} - {formatTime(selection.endSec)}</span>
              </div>
              <div className="summary-card summary-card-accent">
                <span className="summary-label">Çıktı</span>
                <strong>{formatSummary}</strong>
                <span>Normalizasyon: {normalizationSummary}</span>
              </div>
            </div>
          </section>

          {isBusy && (status.kind === "loading-ffmpeg" || status.kind === "processing") ? (
            <ProgressPanel status={status} />
          ) : null}

          {status.kind === "error" ? <div className="status-banner is-error">{status.message}</div> : null}

          <section className="workspace-section waveform-section">
            <div className="section-header">
              <div>
                <h2>Kes ve önizle</h2>
              </div>
            </div>

            <Waveform
              data={audio.waveformData}
              duration={audio.duration}
              startSec={selection.startSec}
              endSec={selection.endSec}
              playheadSec={playheadSec}
              onSelectionChange={handleSelectionChange}
              onPlayheadChange={handlePlayheadChange}
              onTogglePlayback={handleTogglePlayback}
              activeTarget={activeWaveformTarget}
              onActiveTargetChange={handleWaveformTargetChange}
              onNudge={handleWaveformNudge}
            />

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
                  onChange={(event) => handleStartChange(Number.parseFloat(event.target.value) || 0)}
                />
                <span className="unit">sn</span>
              </label>
              <button
                type="button"
                className={`time-marker-control ${activeWaveformTarget === "playhead" ? "is-active" : ""}`}
                onClick={() => handleWaveformTargetChange("playhead")}
              >
                <span>Oynatma imleci</span>
                <strong>{formatTime(playheadSec >= 0 ? playheadSec : selection.startSec)}</strong>
              </button>
              <label
                className={`time-input-group ${activeWaveformTarget === "end" ? "is-active" : ""}`}
                onFocus={() => setActiveWaveformTarget("end")}
              >
                <span>Bitiş</span>
                <input
                  type="number"
                  min={selection.startSec + 0.1}
                  max={audio.duration}
                  step={0.1}
                  value={selection.endSec.toFixed(1)}
                  onChange={(event) =>
                    handleEndChange(Number.parseFloat(event.target.value) || audio.duration)
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
          </section>

          <div className="audio-settings-grid">
            <section className="workspace-section setting-section">
              <div className="section-header">
                <div>
                  <h2>Ses seviyesi</h2>
                  <p>İstersen çıktıya normalizasyon uygula.</p>
                </div>
                <button
                  type="button"
                  className={`normalization-toggle ${settings.normalizationEnabled ? "is-active" : ""}`}
                  aria-pressed={settings.normalizationEnabled}
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      normalizationEnabled: !current.normalizationEnabled,
                    }))
                  }
                  disabled={isBusy}
                >
                  <span className="toggle-indicator" aria-hidden="true"><span /></span>
                  <span className="toggle-copy">
                    <strong>Normalizasyon</strong>
                    <span>{settings.normalizationEnabled ? "Açık" : "Kapalı"}</span>
                  </span>
                </button>
              </div>

              {settings.normalizationEnabled ? (
                <div className="settings-body">
                  <div className="preset-group is-two">
                    <button
                      type="button"
                      className={settings.normalizer.mode === "loudness" ? "is-active" : ""}
                      onClick={() =>
                        setSettings((current) => ({
                          ...current,
                          normalizer: { ...current.normalizer, mode: "loudness" },
                        }))
                      }
                      disabled={isBusy}
                    >
                      <strong>Loudness</strong>
                      <span>LUFS hedefine göre</span>
                    </button>
                    <button
                      type="button"
                      className={settings.normalizer.mode === "peak" ? "is-active" : ""}
                      onClick={() =>
                        setSettings((current) => ({
                          ...current,
                          normalizer: { ...current.normalizer, mode: "peak" },
                        }))
                      }
                      disabled={isBusy}
                    >
                      <strong>Peak</strong>
                      <span>Pik dBFS değerine göre</span>
                    </button>
                  </div>

                  {settings.normalizer.mode === "loudness" ? (
                    <div className="bitrate-row">
                      <div className="preset-group target-presets">
                        {([-9, -14, -16, -23] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={settings.normalizer.targetLufs === value ? "is-active" : ""}
                            onClick={() =>
                              setSettings((current) => ({
                                ...current,
                                normalizer: { ...current.normalizer, targetLufs: value },
                              }))
                            }
                            disabled={isBusy}
                          >
                            <strong>{value}</strong>
                            <span>{value === -14 ? "Streaming" : value === -16 ? "Podcast" : value === -23 ? "EBU" : "Yüksek"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bitrate-row">
                      <div className="preset-group target-presets">
                        {([-0.1, -1, -3, -6] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={settings.normalizer.targetDbFs === value ? "is-active" : ""}
                            onClick={() =>
                              setSettings((current) => ({
                                ...current,
                                normalizer: { ...current.normalizer, targetDbFs: value },
                              }))
                            }
                            disabled={isBusy}
                          >
                            <strong>{value}</strong>
                            <span>{value === -1 ? "Güvenli" : value === -3 ? "Dengeli" : value === -6 ? "Headroom" : "Maksimum"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            <section className="workspace-section setting-section">
              <div className="section-header">
                <div>
                  <h2>Çıktı formatı</h2>
                  <p>Dosya türünü ve kaliteyi seç.</p>
                </div>
              </div>

              <div className="output-format-layout">
                <div className="preset-group output-format-options">
                  <button
                    type="button"
                    className={settings.converter.outputFormat === "mp3" ? "is-active" : ""}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        converter: { ...current.converter, outputFormat: "mp3" },
                      }))
                    }
                    disabled={isBusy}
                  >
                    <strong>MP3</strong>
                    <span>Küçük dosya</span>
                  </button>
                  <button
                    type="button"
                    className={settings.converter.outputFormat === "wav" ? "is-active" : ""}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        converter: { ...current.converter, outputFormat: "wav" },
                      }))
                    }
                    disabled={isBusy}
                  >
                    <strong>WAV</strong>
                    <span>PCM · Kayıpsız</span>
                  </button>
                </div>

                <div className="output-quality-options">
                  {settings.converter.outputFormat === "mp3" ? (
                    <div className="preset-group output-quality-grid is-mp3">
                      {(["128", "192", "320"] as const).map((bitrate) => (
                        <button
                          key={bitrate}
                          type="button"
                          className={settings.converter.mp3Bitrate === bitrate ? "is-active" : ""}
                          onClick={() =>
                            setSettings((current) => ({
                              ...current,
                              converter: { ...current.converter, mp3Bitrate: bitrate },
                            }))
                          }
                          disabled={isBusy}
                        >
                          <strong>{bitrate} kbps</strong>
                          <span>{bitrate === "128" ? "Standart" : bitrate === "192" ? "Yüksek" : "Maksimum"}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="preset-group output-quality-grid is-wav">
                      {(["16", "24"] as const).map((bitDepth) => (
                        <button
                          key={bitDepth}
                          type="button"
                          className={settings.converter.wavBitDepth === bitDepth ? "is-active" : ""}
                          onClick={() =>
                            setSettings((current) => ({
                              ...current,
                              converter: { ...current.converter, wavBitDepth: bitDepth },
                            }))
                          }
                          disabled={isBusy}
                        >
                          <strong>{bitDepth}-bit</strong>
                          <span>{bitDepth === "16" ? "CD kalitesi" : "Stüdyo kalitesi"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {status.kind === "success" ? (
            <ResultPanel
              outputUrl={status.outputUrl}
              outputFileName={status.outputFileName}
              outputSize={status.outputSize}
              originalSize={audio.fileSize}
              onDownload={() =>
                trackAppEvent("export_download", {
                  export_format: settings.converter.outputFormat,
                  file_count: 1,
                })
              }
              onReset={handleReset}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
