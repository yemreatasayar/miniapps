import { useCallback, useEffect, useRef, useState } from "react";
import DropZone from "../components/DropZone";
import ProgressPanel from "../components/ProgressPanel";
import ResultPanel from "../components/ResultPanel";
import Waveform from "../components/Waveform";
import { loadFFmpeg, terminateFFmpeg, trimAudio } from "../lib/ffmpeg-service";
import type { CutterSelection, LoadedAudio, ProcessStatus } from "../lib/types";
import { decodeAudioFile, formatTime } from "../lib/waveform";

type AudioCutterProps = {
  onToast: (message: string) => void;
};

export default function AudioCutter({ onToast }: AudioCutterProps) {
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [selection, setSelection] = useState<CutterSelection>({ startSec: 0, endSec: 0 });
  const [status, setStatus] = useState<ProcessStatus>({ kind: "idle" });
  const [playheadSec, setPlayheadSec] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const selectionRef = useRef(selection);

  const isBusy = status.kind === "loading-ffmpeg" || status.kind === "processing";

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    const audioElement = new window.Audio();

    const handleTimeUpdate = () => {
      const currentSelection = selectionRef.current;
      if (audioElement.currentTime >= currentSelection.endSec) {
        audioElement.pause();
        setPlayheadSec(-1);
        return;
      }

      setPlayheadSec(audioElement.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setPlayheadSec(-1);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

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
      audioElementRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (status.kind === "success") {
        URL.revokeObjectURL(status.outputUrl);
      }
    };
  }, [previewUrl, status]);

  async function handleFileSelected(file: File): Promise<void> {
    if (!file.type.startsWith("audio/")) {
      onToast("Lütfen bir ses dosyası seç.");
      return;
    }

    try {
      const { waveformData, duration } = await decodeAudioFile(file);
      const nextPreviewUrl = URL.createObjectURL(file);

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
      setIsPlaying(false);
      setPreviewUrl(nextPreviewUrl);

      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = nextPreviewUrl;
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

      setSelection({
        startSec: clampedStart,
        endSec: clampedEnd,
      });
    },
    [audio]
  );

  function handlePlay(): void {
    const audioElement = audioElementRef.current;
    if (!audioElement) return;

    audioElement.currentTime = selection.startSec;
    void audioElement.play().catch(() => {
      onToast("Önizleme başlatılamadı.");
    });
  }

  function handleStop(): void {
    const audioElement = audioElementRef.current;
    if (!audioElement) return;

    audioElement.pause();
    audioElement.currentTime = 0;
    setIsPlaying(false);
    setPlayheadSec(-1);
  }

  function handleTogglePlayback(): void {
    const audioElement = audioElementRef.current;
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
      return;
    }

    if (
      audioElement.currentTime < selection.startSec ||
      audioElement.currentTime >= selection.endSec
    ) {
      audioElement.currentTime = selection.startSec;
    }

    void audioElement.play().catch(() => {
      onToast("Önizleme başlatılamadı.");
    });
  }

  async function handleCut(): Promise<void> {
    if (!audio) return;

    if (selection.endSec - selection.startSec < 0.1) {
      onToast("Seçim en az 0.1 saniye olmalı.");
      return;
    }

    try {
      setStatus({ kind: "loading-ffmpeg", progress: 0 });
      await loadFFmpeg((progress) => setStatus({ kind: "loading-ffmpeg", progress }));

      setStatus({ kind: "processing", progress: 0, label: "Kesiliyor..." });
      const { blob, fileName } = await trimAudio(audio, selection, (progress) =>
        setStatus({ kind: "processing", progress, label: "Kesiliyor..." })
      );

      setStatus({
        kind: "success",
        outputUrl: URL.createObjectURL(blob),
        outputFileName: fileName,
        outputSize: blob.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kesme işlemi başarısız.";
      setStatus({ kind: "error", message });
      onToast(message);
    }
  }

  function handleReset(): void {
    if (isBusy) {
      terminateFFmpeg();
    }

    handleStop();
    setAudio(null);
    setSelection({ startSec: 0, endSec: 0 });
    setStatus({ kind: "idle" });
    setIsPlaying(false);
    setPreviewUrl(null);
  }

  const selectionDuration = selection.endSec - selection.startSec;

  return (
    <div className="tool-panel">
      {!audio ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h1>Ses dosyasını kes ve kırp.</h1>
            <p className="hero-description">
              Dalga formu üzerinde başlangıç ve bitiş noktasını sürükle, istediğin bölümü tek
              tıkla dışa aktar.
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
                {formatTime(audio.duration)} · Seçim: {formatTime(selection.startSec)} -{" "}
                {formatTime(selection.endSec)} ({formatTime(selectionDuration)})
              </p>

              <div className="hero-actions">
                <button type="button" className="hero-secondary" onClick={handleReset}>
                  Başka Dosya
                </button>
                <button type="button" className="hero-secondary" onClick={handlePlay} disabled={isBusy}>
                  Önizle
                </button>
                <button type="button" className="hero-secondary" onClick={handleStop}>
                  Durdur
                </button>
                {status.kind === "idle" || status.kind === "error" ? (
                  <button type="button" className="hero-primary" onClick={() => void handleCut()}>
                    Kes
                  </button>
                ) : null}
              </div>
            </div>

            <div className="hero-side hero-side-summary">
              <div className="summary-card">
                <span className="summary-label">Toplam Süre</span>
                <strong>{formatTime(audio.duration)}</strong>
              </div>
              <div className="summary-card summary-card-accent">
                <span className="summary-label">Seçim Süresi</span>
                <strong>{formatTime(selectionDuration)}</strong>
                <span>
                  {formatTime(selection.startSec)} - {formatTime(selection.endSec)}
                </span>
              </div>
            </div>
          </section>

          <section className="workspace-section waveform-section">
            <div className="section-header">
              <div>
                <h2>Dalga Formu</h2>
                <p>Başlangıç ve bitiş noktalarını sürükle veya aşağıdaki alanlardan gir.</p>
              </div>
            </div>

            <Waveform
              data={audio.waveformData}
              duration={audio.duration}
              startSec={selection.startSec}
              endSec={selection.endSec}
              playheadSec={playheadSec}
              onSelectionChange={handleSelectionChange}
              onTogglePlayback={handleTogglePlayback}
            />

            <div className="time-inputs">
              <label className="time-input-group">
                <span>Başlangıç</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, selection.endSec - 0.1)}
                  step={0.1}
                  value={selection.startSec.toFixed(1)}
                  onChange={(event) =>
                    handleSelectionChange(Number.parseFloat(event.target.value) || 0, selection.endSec)
                  }
                />
                <span className="unit">sn</span>
              </label>

              <label className="time-input-group">
                <span>Bitiş</span>
                <input
                  type="number"
                  min={selection.startSec + 0.1}
                  max={audio.duration}
                  step={0.1}
                  value={selection.endSec.toFixed(1)}
                  onChange={(event) =>
                    handleSelectionChange(
                      selection.startSec,
                      Number.parseFloat(event.target.value) || audio.duration
                    )
                  }
                />
                <span className="unit">sn</span>
              </label>
            </div>
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
              onReset={handleReset}
            />
          ) : null}

          {status.kind === "error" ? <div className="status-banner is-error">{status.message}</div> : null}
        </>
      )}
    </div>
  );
}
