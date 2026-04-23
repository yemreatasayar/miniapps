import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  cancelSplitJob,
  cancelSplitJobOnUnload,
  fetchBackendHealth,
  fetchJob,
  resolveDownloadUrl,
  startSplitJob,
} from "./lib/api";
import type { BackendHealth } from "./lib/api";
import {
  AUDIO_INPUT_ACCEPT,
  formatBytes,
  formatDuration,
  loadTrack,
} from "./lib/audio";
import type { LoadedTrack } from "./lib/audio";

type Status = "idle" | "loading" | "ready" | "processing" | "done" | "error";

type HelperViewState =
  | {
      kind: "checking" | "offline" | "issue" | "warmup" | "ready";
      title: string;
      description: string;
      detail?: string;
    };

function getProgressLabel(progress: number): string {
  if (progress < 12) return "Model hazırlanıyor...";
  if (progress < 45) return "Ses katmanları ayrılıyor...";
  if (progress < 80) return "Stem dosyaları işleniyor...";
  return "Çıktılar hazırlanıyor...";
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Beklenmeyen bir hata oluştu.";
}

function getHelperViewState(backendHealth: BackendHealth | null, backendError: string): HelperViewState {
  if (!backendHealth) {
    if (backendError) {
      return {
        kind: "offline",
        title: "Vocal Remover hazır değil",
        description: "Bu araç local helper ile çalışır. Ses dosyan cihazında işlenir; server'a yüklenmez.",
        detail: backendError,
      };
    }

    return {
      kind: "checking",
      title: "Local helper kontrol ediliyor",
      description: "Cihazındaki stem engine aranıyor. Bu işlem birkaç saniye sürebilir.",
    };
  }

  if (!backendHealth.pythonInstalled) {
    return {
      kind: "issue",
      title: "Python runtime hazır değil",
      description: "Helper çalışıyor ama paketlenmiş veya yapılandırılmış Python runtime bulunamadı.",
      detail: backendHealth.pythonBin,
    };
  }

  if (!backendHealth.ffmpegInstalled) {
    return {
      kind: "issue",
      title: "FFmpeg runtime hazır değil",
      description: "Helper çalışıyor ama ses işleme için gereken ffmpeg binary'si bulunamadı.",
      detail: backendHealth.ffmpegBin,
    };
  }

  if (backendHealth.warmup.status === "error") {
    return {
      kind: "issue",
      title: "Local helper çalışıyor ama hazır değil",
      description: "Model warm-up tamamlanamadı. Runtime path'leri veya model kurulumu kontrol edilmeli.",
      detail: backendHealth.warmup.message,
    };
  }

  if (backendHealth.warmup.status === "pending" || backendHealth.warmup.status === "running") {
    return {
      kind: "warmup",
      title: "Model hazırlanıyor",
      description: "İlk açılışta helper modeli ısıtıyor. Bu sırada track seçebilirsin; split hazır olduğunda başlayacak.",
      detail: backendHealth.warmup.message,
    };
  }

  return {
    kind: "ready",
    title: "Local helper hazır",
    description: "Dosyan cihazında kalır, split işlemi local helper üzerinden yürür.",
    detail: backendHealth.warmup.message,
  };
}

function getBackendBadgeLabel(helperViewState: HelperViewState): string {
  switch (helperViewState.kind) {
    case "ready":
      return "Hazır";
    case "warmup":
      return "Isınıyor";
    case "checking":
      return "Aranıyor";
    case "offline":
      return "Yok";
    case "issue":
      return "Hata";
  }
}

function getInstallLabel(backendHealth: BackendHealth | null): string {
  if (!backendHealth) {
    return "Kurulum tanısı bekleniyor";
  }

  const segments = [backendHealth.install.platform];
  if (backendHealth.install.helperVersion) {
    segments.push(`v${backendHealth.install.helperVersion}`);
  }

  return segments.join(" • ");
}

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/stem-splitter-logo.svg`;
  const helperMacDownloadUrl = import.meta.env.VITE_STEM_SPLITTER_HELPER_MAC_URL || "";
  const helperWindowsDownloadUrl = import.meta.env.VITE_STEM_SPLITTER_HELPER_WINDOWS_URL || "";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [track, setTrack] = useState<LoadedTrack | null>(null);
  const [jobId, setJobId] = useState("");
  const [downloads, setDownloads] = useState<{ vocals: string; instrumental: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [backendError, setBackendError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const isBusy = status === "loading" || status === "processing";
  const helperViewState = getHelperViewState(backendHealth, backendError);
  const canChooseFile = (helperViewState.kind === "ready" || helperViewState.kind === "warmup") && !isBusy;
  const canStartSplit = helperViewState.kind === "ready" && !isBusy && !!track;
  async function refreshBackendHealth() {
    try {
      const health = await fetchBackendHealth();
      setBackendHealth(health);
      setBackendError("");
    } catch (error) {
      setBackendHealth(null);
      setBackendError(formatApiError(error));
    }
  }

  useEffect(() => {
    let active = true;

    const poll = () => {
      void fetchBackendHealth()
        .then((health) => {
          if (!active) return;
          setBackendHealth(health);
          setBackendError("");
        })
        .catch((error) => {
          if (!active) return;
          setBackendHealth(null);
          setBackendError(formatApiError(error));
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
            setOperationError(job.error ?? "Stem separation başarısız oldu.");
            setStatus("error");
          }
        })
        .catch((error) => {
          setOperationError(formatApiError(error));
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
      setOperationError("");
      setDownloads(null);
      setJobId("");
      setProgress(0);
      setProgressMessage("");
      const loaded = await loadTrack(file);
      setTrack(loaded);
      setStatus("ready");
    } catch (error) {
      setTrack(null);
      setStatus("error");
      setOperationError(formatApiError(error));
    }
  }

  async function handleSplit() {
    if (!track) return;

    if (helperViewState.kind !== "ready") {
      setOperationError("Stem separation başlatmak için local helper'ın hazır olması gerekiyor.");
      return;
    }

    try {
      setStatus("processing");
      setOperationError("");
      setDownloads(null);
      setProgress(2);
      setProgressMessage("Stem separation başlatıldı.");
      const nextJob = await startSplitJob(track.file);
      setJobId(nextJob.jobId);
    } catch (error) {
      setStatus("error");
      setOperationError(formatApiError(error));
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
    setOperationError("");
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

          <div className="helper-summary-card">
            <span className={`helper-badge is-${helperViewState.kind}`}>{getBackendBadgeLabel(helperViewState)}</span>
            <strong>{helperViewState.title}</strong>
            <p>{helperViewState.description}</p>
            <div className="helper-meta">
              <span>{getInstallLabel(backendHealth)}</span>
            </div>
          </div>
        </div>

        <div
          className={`drop-zone ${isBusy ? "is-loading" : ""} ${canChooseFile ? "" : "is-disabled"}`}
          role={canChooseFile ? "button" : undefined}
          tabIndex={canChooseFile ? 0 : -1}
          onClick={() => {
            if (canChooseFile) inputRef.current?.click();
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && canChooseFile) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            if (!canChooseFile) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (!canChooseFile) return;
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

          {helperViewState.kind === "ready" || helperViewState.kind === "warmup" ? (
            <div className="drop-zone-inner">
              <strong>
                {status === "loading"
                  ? "Track analiz ediliyor..."
                  : status === "processing"
                    ? "Stem separation çalışıyor..."
                    : helperViewState.kind === "warmup"
                      ? "Model hazırlanıyor, track seçebilirsin"
                      : "Audio dosyasını bırak"}
              </strong>
              <p>
                {helperViewState.kind === "warmup"
                  ? helperViewState.detail ?? helperViewState.description
                  : "MP3, WAV, M4A, AAC, OGG veya FLAC yükleyebilirsin."}
              </p>
              <div className="drop-zone-action">
                <span className="primary-pill">Dosya Seç</span>
                <span className="muted-copy">{helperViewState.kind === "warmup" ? "helper hazır olunca split başlayabilir" : "veya sürükle bırak"}</span>
              </div>
            </div>
          ) : (
            <div className="helper-state">
              <span className={`helper-badge is-${helperViewState.kind}`}>{getBackendBadgeLabel(helperViewState)}</span>
              <strong>{helperViewState.title}</strong>
              <p>{helperViewState.description}</p>
              {helperViewState.detail ? <p className="status-note">{helperViewState.detail}</p> : null}
              <div className="helper-actions">
                {helperMacDownloadUrl ? (
                  <a
                    className="primary-button helper-link-button"
                    href={helperMacDownloadUrl}
                    download
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    macOS için indir
                  </a>
                ) : (
                  <button type="button" className="primary-button" disabled>
                    macOS paketi hazırlanıyor
                  </button>
                )}
                {helperWindowsDownloadUrl ? (
                  <a
                    className="ghost-button helper-link-button"
                    href={helperWindowsDownloadUrl}
                    download
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    Windows için indir
                  </a>
                ) : (
                  <button type="button" className="ghost-button" disabled>
                    Windows yakında
                  </button>
                )}
                <button
                  type="button"
                  className="primary-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void refreshBackendHealth();
                  }}
                >
                  Tekrar Dene
                </button>
              </div>
            </div>
          )}
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
                  <strong>{getBackendBadgeLabel(helperViewState)}</strong>
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
                disabled={!canStartSplit}
              >
                {status === "processing" ? "Hazırlanıyor..." : helperViewState.kind === "warmup" ? "Warm-up Bekleniyor" : "Stem Ayır"}
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
                <span className="progress-label">{progressMessage || getProgressLabel(progress)}</span>
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
                <div>
                  <span>Helper</span>
                  <strong>{getInstallLabel(backendHealth)}</strong>
                </div>
                <div>
                  <span>Warm-up</span>
                  <strong>{backendHealth?.warmup.message ?? "Bekleniyor"}</strong>
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

              {operationError ? <p className="inline-note">{operationError}</p> : null}

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
