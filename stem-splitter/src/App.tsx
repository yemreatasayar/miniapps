import { useEffect, useRef, useState } from "react";
import {
  cancelSplitJob,
  cancelSplitJobOnUnload,
  fetchBackendHealth,
  fetchJob,
  resolveDownloadUrl,
  startSplitJob,
} from "./lib/api";
import {
  AUDIO_INPUT_ACCEPT,
  formatBytes,
  formatDuration,
  loadTrack,
} from "./lib/audio";
import type { LoadedTrack } from "./lib/audio";
import type { BackendHealth } from "./lib/api";

type Status = "idle" | "loading" | "ready" | "processing" | "done" | "error";

function getProgressLabel(progress: number): string {
  if (progress < 12) return "Model hazırlanıyor...";
  if (progress < 45) return "Ses katmanları ayrılıyor...";
  if (progress < 80) return "Stem dosyaları işleniyor...";
  return "Çıktılar hazırlanıyor...";
}

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/stem-splitter-logo.svg`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [track, setTrack] = useState<LoadedTrack | null>(null);
  const [jobId, setJobId] = useState("");
  const [downloads, setDownloads] = useState<{ vocals: string; instrumental: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const isBusy = status === "loading" || status === "processing";

  useEffect(() => {
    let active = true;
    const poll = () => {
      void fetchBackendHealth()
        .then((health) => {
          if (!active) return;
          setBackendHealth(health);
        })
        .catch((nextError) => {
          if (active) setError(nextError instanceof Error ? nextError.message : "Backend erişilemedi.");
        });
    };

    poll();
    const timer = window.setInterval(poll, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!jobId || status !== "processing") return;

    const timer = window.setInterval(() => {
      void fetchJob(jobId)
        .then((job) => {
          setProgress(job.progress);
          setProgressMessage(job.progressMessage ?? "");

          if (job.status === "done" && job.downloads) {
            setDownloads({
              vocals: resolveDownloadUrl(job.downloads.vocals),
              instrumental: resolveDownloadUrl(job.downloads.instrumental),
            });
            setStatus("done");
          }

          if (job.status === "error") {
            setError(job.error ?? "Stem separation başarısız oldu.");
            setStatus("error");
          }
        })
        .catch((nextError) => {
          setError(nextError instanceof Error ? nextError.message : "Job durumu alınamadı.");
          setStatus("error");
        });
    }, 1500);

    return () => window.clearInterval(timer);
  }, [jobId, status]);

  useEffect(() => {
    if (!jobId || status !== "processing") return;

    const handlePageHide = () => {
      cancelSplitJobOnUnload(jobId);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [jobId, status]);

  async function handleFile(file: File) {
    try {
      setStatus("loading");
      setError("");
      setDownloads(null);
      setJobId("");
      setProgress(0);
      setProgressMessage("");
      const loaded = await loadTrack(file);
      setTrack(loaded);
      setStatus("ready");
    } catch (nextError) {
      setTrack(null);
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Dosya yüklenemedi.");
    }
  }

  async function handleSplit() {
    if (!track) return;

    try {
      setStatus("processing");
      setError("");
      setDownloads(null);
      setProgress(2);
      setProgressMessage("Stem separation başlatıldı.");
      const nextJob = await startSplitJob(track.file);
      setJobId(nextJob.jobId);
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Stem separation başlatılamadı.");
    }
  }

  function resetWorkspace() {
    if (jobId && status === "processing") {
      void cancelSplitJob(jobId);
    }
    setTrack(null);
    setDownloads(null);
    setJobId("");
    setProgress(0);
    setProgressMessage("");
    setError("");
    setStatus("idle");
  }

  return (
    <main className="stem-shell">
      <header className="app-header">
        <img className="brand-logo" src={logoUrl} alt="Stem Splitter" />
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <h2>Vocals ve instrumental stem'lerini yerelde ayır.</h2>
          <p>
            Yerel worker gerçek model tabanlı `Demucs` akışını kullanır. İlk kurulumdan sonra model warm-up ile hazır
            tutulur, split işlemi cihazında çalışır.
          </p>
        </div>

        <div
          className={`drop-zone ${isBusy ? "is-loading" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (!isBusy) inputRef.current?.click();
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !isBusy) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={AUDIO_INPUT_ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
              event.currentTarget.value = "";
            }}
          />

          <div className="drop-zone-inner">
            <strong>
                {status === "loading"
                  ? "Track analiz ediliyor..."
                  : status === "processing"
                    ? "Stem separation çalışıyor..."
                    : "Audio dosyasını bırak"}
            </strong>
            <p>MP3, WAV, M4A, AAC, OGG veya FLAC yükleyebilirsin.</p>
            <div className="drop-zone-action">
              <span className="primary-pill">Dosya Seç</span>
              <span className="muted-copy">veya sürükle bırak</span>
            </div>
          </div>
        </div>
      </section>

      {track ? (
        <section className="workspace-shell">
          <div className="workspace-toolbar">
            <div className="workspace-toolbar-copy">
              <h2>Track hazır, stem separation başlat.</h2>
              <p>
                Güvenli worker akışı dosyayı temp klasörde işler, `Demucs` ile iki stem üretir ve indirme sonrası
                otomatik temizler.
              </p>

              <div className="workspace-summary">
                <span className="summary-pill">
                  <strong>{formatDuration(track.duration)}</strong>
                  <span>süre</span>
                </span>
                <span className="summary-pill">
                  <strong>{track.sampleRate}</strong>
                  <span>sample rate</span>
                </span>
                <span className="summary-pill">
                  <strong>{track.channels}</strong>
                  <span>kanal</span>
                </span>
                <span className="summary-pill">
                  <strong>{backendHealth?.warmup.status === "ready" ? "Hazır" : "Bekliyor"}</strong>
                  <span>backend</span>
                </span>
              </div>
            </div>

            <div className="workspace-toolbar-panel">
              <button type="button" className="ghost-button" onClick={() => inputRef.current?.click()} disabled={isBusy}>
                + Yeni Track
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleSplit()}
                disabled={isBusy || !track}
              >
                {status === "processing" ? "Hazırlanıyor..." : "Stem Ayır"}
              </button>
            </div>
          </div>

          {status === "processing" ? (
            <div className="progress-panel" aria-live="polite">
              <div className="progress-header">
                <div className="progress-heading">
                  <span className="progress-kicker">İşleniyor</span>
                  <strong>{Math.round(progress)}% tamamlandı</strong>
                </div>
                <span className="progress-label">{getProgressLabel(progress)}</span>
              </div>
              <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
                <span className="progress-fill" style={{ width: `${Math.max(6, Math.min(100, progress))}%` }} />
              </div>
            </div>
          ) : null}

          <div className="workspace-grid">
            <article className="surface-card">
              <div className="section-copy">
                <h3>Track bilgisi</h3>
                <p>{track.fileName}</p>
              </div>
              <div className="detail-grid">
                <div>
                  <span>Boyut</span>
                  <strong>{formatBytes(track.fileSize)}</strong>
                </div>
                <div>
                  <span>Süre</span>
                  <strong>{formatDuration(track.duration)}</strong>
                </div>
                <div>
                  <span>Format</span>
                  <strong>{track.file.name.split(".").pop()?.toUpperCase() ?? "AUDIO"}</strong>
                </div>
                <div>
                  <span>Engine</span>
                  <strong>{backendHealth?.model ?? "Demucs"}</strong>
                </div>
              </div>

              <div className="waveform">
                {track.waveform.map((point, index) => (
                  <span key={`${index}-${point}`} style={{ height: `${Math.max(10, point * 100)}%` }} />
                ))}
              </div>
            </article>

            <article className="surface-card">
              <div className="section-copy">
                <h3>Çıktılar</h3>
                <p>{downloads ? "Stem dosyaları hazır." : "Stem separation henüz başlatılmadı."}</p>
              </div>

              <div className="result-list">
                <div className="result-item">
                  <div className="result-item-meta">
                    <strong>Vocals</strong>
                    <span>Ayrılmış vokal stem'i</span>
                  </div>
                  <a className={`download-link${downloads ? "" : " is-disabled"}`} href={downloads?.vocals ?? undefined} download>
                    İndir
                  </a>
                </div>

                <div className="result-item">
                  <div className="result-item-meta">
                    <strong>Instrumental</strong>
                    <span>Vokalsiz stem çıktısı</span>
                  </div>
                  <a className={`download-link${downloads ? "" : " is-disabled"}`} href={downloads?.instrumental ?? undefined} download>
                    İndir
                  </a>
                </div>
              </div>

              {error ? <p className="inline-note">{error}</p> : null}

              <div className="action-row">
                <button type="button" className="ghost-button" onClick={resetWorkspace}>
                  Yeni Başla
                </button>
              </div>
            </article>
          </div>
        </section>
      ) : null}
    </main>
  );
}
