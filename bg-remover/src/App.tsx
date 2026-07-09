import { useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import DropZone from "./components/DropZone";
import ProgressPanel from "./components/ProgressPanel";
import ResultPanel from "./components/ResultPanel";
import Toast from "./components/Toast";
import { preloadBgAssets, removeBg } from "./lib/bg-service";
import { trackAppEvent, trackProcessSuccess } from "./lib/analytics";
import type { LoadedImage, ProcessStatus } from "./lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

function createImageItem(file: File): LoadedImage {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    fileName: file.name,
    fileSize: file.size,
    previewUrl: URL.createObjectURL(file),
    status: { kind: "idle" },
  };
}

function revokeItemResources(item: LoadedImage): void {
  URL.revokeObjectURL(item.previewUrl);
  if (item.status.kind === "success") URL.revokeObjectURL(item.status.outputUrl);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function downloadAsZip(entries: Array<{ fileName: string; blob: Blob }>, zipName: string) {
  const files: Record<string, Uint8Array> = {};
  const seen = new Map<string, number>();

  for (const entry of entries) {
    const base = entry.fileName.replace(/(\.[^.]+)$/, "");
    const ext = entry.fileName.match(/\.[^.]+$/)?.[0] ?? "";
    const count = seen.get(entry.fileName) ?? 0;
    const finalName = count === 0 ? entry.fileName : `${base}-${count}${ext}`;
    seen.set(entry.fileName, count + 1);
    files[finalName] = new Uint8Array(await entry.blob.arrayBuffer());
  }

  const zipped = zipSync(files, { level: 0 });
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
  downloadBlob(blob, zipName);
}

const isDistribution = window.location.hostname === "miniapps.tr";

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/bg-remover-logo.svg`;
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isGalleryDragging, setIsGalleryDragging] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
    currentFileName: string | null;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const imagesRef = useRef<LoadedImage[]>([]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    void preloadBgAssets().catch(() => {
      // İlk gerçek işlem sırasında tekrar denenecek.
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const item of imagesRef.current) revokeItemResources(item);
    };
  }, []);

  const activeImage = useMemo(
    () => images.find((item) => item.id === activeId) ?? images[0] ?? null,
    [activeId, images],
  );
  const processingImage = useMemo(
    () => images.find((item) => item.status.kind === "processing") ?? null,
    [images],
  );
  const activeStatus: ProcessStatus = activeImage?.status ?? { kind: "idle" };
  const batchInProgress = batchProgress !== null && batchProgress.done < batchProgress.total;
  const progressStatus: ProcessStatus =
    processingImage?.status.kind === "processing"
      ? processingImage.status
      : batchInProgress
        ? {
            kind: "processing",
            stage: "batch:transition",
            progress: Math.max(0.02, Math.min(0.98, batchProgress.done / batchProgress.total)),
          }
        : activeStatus;
  const overallBatchProgress =
    batchProgress && progressStatus.kind === "processing"
      ? Math.max(
          0,
          Math.min(0.999, (batchProgress.done + Math.max(progressStatus.progress, 0)) / batchProgress.total),
        )
      : progressStatus.kind === "processing"
        ? progressStatus.progress
        : 0;
  const displayProgressStatus: Extract<ProcessStatus, { kind: "processing" }> | null =
    progressStatus.kind === "processing"
      ? {
          ...progressStatus,
          progress: overallBatchProgress,
        }
      : null;
  const isBusy = images.some((item) => item.status.kind === "processing");
  const actionableCount = images.filter(
    (item) => item.status.kind === "idle" || item.status.kind === "error",
  ).length;

  function openPicker(): void {
    if (!isBusy) inputRef.current?.click();
  }

  function updateImageStatus(id: string, updater: (item: LoadedImage) => LoadedImage): void {
    setImages((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = updater(item);
        if (
          item.status.kind === "success" &&
          next.status.kind === "success" &&
          item.status.outputUrl !== next.status.outputUrl
        ) {
          URL.revokeObjectURL(item.status.outputUrl);
        }
        if (item.status.kind === "success" && next.status.kind !== "success") {
          URL.revokeObjectURL(item.status.outputUrl);
        }
        return next;
      }),
    );
  }

  function handleFilesSelected(files: File[]): void {
    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    if (validFiles.length === 0) {
      setToast("Lütfen bir görsel dosyası seç.");
      return;
    }

    const nextItems = validFiles.map(createImageItem);
    setImages((current) => [...current, ...nextItems]);
    setActiveId(nextItems[0]?.id ?? null);

    if (validFiles.length !== files.length) {
      setToast("Görsel olmayan dosyalar atlandı.");
    }
  }

  function handleSelectImage(id: string): void {
    setActiveId(id);
  }

  async function processImageById(id: string): Promise<void> {
    const item = imagesRef.current.find((entry) => entry.id === id);
    if (!item) return;

    setActiveId(id);
    updateImageStatus(id, (current) => ({
      ...current,
      status: { kind: "processing", stage: "Başlatılıyor", progress: 0 },
    }));

    try {
      const blob = await removeBg(item.file, (stage, progress) => {
        if (abortRef.current) return;
        updateImageStatus(id, (current) => ({
          ...current,
          status: { kind: "processing", stage, progress },
        }));
      });

      if (abortRef.current) return;

      const outputUrl = URL.createObjectURL(blob);
      updateImageStatus(id, (current) => ({
        ...current,
        status: {
          kind: "success",
          outputUrl,
          outputSize: blob.size,
        },
      }));
      trackProcessSuccess({
        process_type: "background_remove",
        file_count: 1,
        output_size_kb: Math.max(1, Math.round(blob.size / 1024)),
      });
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    } catch (error) {
      const message = error instanceof Error ? error.message : "İşlem başarısız.";
      updateImageStatus(id, (current) => ({
        ...current,
        status: { kind: "error", message },
      }));
      trackAppEvent("process_error", {
        process_type: "background_remove",
        error_code: "remove_failed",
        error_stage: "process",
      });
      throw error;
    }
  }

  async function handleProcessAll(): Promise<void> {
    abortRef.current = false;

    try {
      const queue = imagesRef.current.filter((item) => item.status.kind !== "success");
      if (queue.length === 0) return;
      setBatchProgress({ done: 0, total: queue.length, currentFileName: queue[0]?.fileName ?? null });

      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        if (abortRef.current) return;
        setBatchProgress({
          done: index,
          total: queue.length,
          currentFileName: item.fileName,
        });
        await processImageById(item.id);
        setBatchProgress({
          done: index + 1,
          total: queue.length,
          currentFileName: queue[index + 1]?.fileName ?? null,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Toplu işlem başarısız.";
      setToast(message);
    } finally {
      window.setTimeout(() => setBatchProgress(null), 180);
    }
  }

  async function handleDownloadReady(): Promise<void> {
    const ready = imagesRef.current.filter(
      (item): item is LoadedImage & { status: Extract<ProcessStatus, { kind: "success" }> } =>
        item.status.kind === "success",
    );

    if (ready.length === 0) {
      setToast("İndirilecek hazır çıktı bulunamadı.");
      return;
    }

    if (ready.length === 1) {
      const single = ready[0];
      const blob = await fetch(single.status.outputUrl).then((response) => response.blob());
      downloadBlob(blob, `${single.fileName.replace(/\.[^.]+$/, "")}_nobg.png`);
      trackAppEvent("export_download", { export_format: "png", file_count: 1 });
      return;
    }

    const entries = await Promise.all(
      ready.map(async (item) => ({
        fileName: `${item.fileName.replace(/\.[^.]+$/, "")}_nobg.png`,
        blob: await fetch(item.status.outputUrl).then((response) => response.blob()),
      })),
    );

    await downloadAsZip(entries, "bg-remover-ciktilar.zip");
    trackAppEvent("export_download", { export_format: "zip", file_count: entries.length });
  }

  const idleCount = images.filter((item) => item.status.kind === "idle").length;
  const successCount = images.filter((item) => item.status.kind === "success").length;
  const processingCount = images.filter((item) => item.status.kind === "processing").length;
  const readyImages = images.filter(
    (item): item is LoadedImage & { status: Extract<ProcessStatus, { kind: "success" }> } =>
      item.status.kind === "success",
  );
  const totalOriginalSize = readyImages.reduce((sum, item) => sum + item.fileSize, 0);
  const totalOutputSize = readyImages.reduce((sum, item) => sum + item.status.outputSize, 0);
  const savingsPercent =
    readyImages.length > 0 && totalOriginalSize > 0
      ? Math.round((1 - totalOutputSize / totalOriginalSize) * 100)
      : 0;

  return (
    <main className="bg-remover-shell">
      <header className="saas-header">
        <img className="brand-logo" src={logoUrl} alt="Background Remover" />
      </header>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) handleFilesSelected(files);
          event.target.value = "";
        }}
      />

      {images.length === 0 ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h1>Arka planı kaldır.</h1>
            <p className="hero-description">
              Nesneyi temiz çıkar, şeffaf PNG olarak indir.
            </p>
            <div className="hero-stats">
              <div className="hero-stat">
                <strong>AI destekli</strong>
                <span>Tarayıcıda işler</span>
              </div>
              <div className="hero-stat">
                <strong>Şeffaf PNG</strong>
                <span>Alpha kanallı çıktı</span>
              </div>
              <div className="hero-stat">
                <strong>Yerelde işlem</strong>
                <span>Sunucuya yükleme yok</span>
              </div>
            </div>
          </div>
          <div className="hero-side">
            <DropZone onFilesSelected={handleFilesSelected} loading={isBusy} />
          </div>
        </section>
      ) : (
        <section className="workspace-grid">
          <div className="workspace-main">
            <section
              className={`workspace-section gallery-panel ${isGalleryDragging ? "is-dragging" : ""}`}
              onClick={() => !isBusy && openPicker()}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isBusy) setIsGalleryDragging(true);
              }}
              onDragLeave={() => setIsGalleryDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsGalleryDragging(false);
                if (isBusy) return;
                const files = Array.from(event.dataTransfer.files);
                if (files.length > 0) handleFilesSelected(files);
              }}
            >
              <div className="section-header gallery-header">
                <div>
                  <h2>Görseller</h2>
                  <p>Tıkla veya yeni dosya bırak.</p>
                </div>
              </div>
              <div className="asset-rail asset-rail-panel" role="list" aria-label="Yüklenen görseller">
                {images.map((item) => {
                  const statusLabel =
                    item.status.kind === "success"
                      ? "Hazır"
                      : item.status.kind === "processing"
                        ? "İşleniyor"
                        : item.status.kind === "error"
                          ? "Hata"
                          : "Bekliyor";

                  const imageSrc =
                    item.status.kind === "success" ? item.status.outputUrl : item.previewUrl;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`asset-chip ${item.id === activeImage?.id ? "is-active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSelectImage(item.id);
                      }}
                    >
                      <span className="asset-chip-thumb">
                        <img src={imageSrc} alt={item.fileName} />
                      </span>
                      <span className="asset-chip-meta">
                        <strong title={item.fileName}>{item.fileName}</strong>
                        <span>{statusLabel}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {displayProgressStatus ? (
              <ProgressPanel
                status={displayProgressStatus}
                batchLabel={
                  batchProgress ? `${batchProgress.done}/${batchProgress.total} görsel tamamlandı` : undefined
                }
                currentFileLabel={batchProgress?.currentFileName ?? processingImage?.fileName ?? undefined}
              />
            ) : actionableCount > 0 ? (
              <section className="workspace-section action-panel">
                <button
                  type="button"
                  className="hero-primary action-panel-button"
                  onClick={() => void handleProcessAll()}
                  disabled={isBusy}
                >
                  Arka Planı Temizle
                </button>
              </section>
            ) : null}

            {readyImages.length > 0 && idleCount === 0 && !isBusy ? (
              <ResultPanel
                title="Tamamlandı"
                subtitle={
                  readyImages.length === 1
                    ? `${readyImages[0].fileName.replace(/\.[^.]+$/, "")}_nobg.png`
                    : `${readyImages.length} görsel hazır`
                }
                outputSizeLabel={formatBytes(totalOutputSize)}
                savingsLabel={savingsPercent > 0 ? `%${savingsPercent} küçük` : undefined}
                downloadLabel={readyImages.length === 1 ? "PNG İndir" : "ZIP İndir"}
                onDownload={() => void handleDownloadReady()}
              />
            ) : null}
          </div>

          <aside className="workspace-aside">
            <section className="workspace-section info-card">
              <div className="section-header">
                <div>
                    <h2>Bilgi</h2>
                </div>
              </div>
              <div className="tip-list">
                <div className="tip-item">
                  <strong>İlk kullanım</strong>
                  <span>Model dosyaları ilk açılışta indirilir.</span>
                </div>
                <div className="tip-item">
                  <strong>Sonraki kullanımlar</strong>
                  <span>Model cache'e alındıktan sonra daha hızlı açılır.</span>
                </div>
                <div className="tip-item">
                  <strong>Gizlilik</strong>
                  <span>Görseller cihazında işlenir.</span>
                </div>
                <div className="tip-item">
                  <strong>Model kaynağı</strong>
                  <span>Model IMG.LY CDN üzerinden alınır.</span>
                </div>
              </div>
            </section>
          </aside>
        </section>
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
