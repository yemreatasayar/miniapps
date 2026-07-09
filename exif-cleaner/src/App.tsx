import { useMemo, useRef, useState } from "react";
import DropZone from "./components/DropZone";
import ImageGrid from "./components/ImageGrid";
import Toast from "./components/Toast";
import {
  IMAGE_INPUT_ACCEPT,
  buildOutputFileName,
  downloadAsZip,
  downloadBlob,
  isSupportedImageFile,
  loadSanitizableImage,
  sanitizeImage,
} from "./lib/image-ops";
import { trackAppEvent, trackProcessSuccess } from "./lib/analytics";
import type { OutputFormat, SanitizableImage } from "./lib/types";

function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const isDistribution = window.location.hostname === "miniapps.tr";

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/exif-cleaner-logo.svg`;
  const [images, setImages] = useState<SanitizableImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLInputElement | null>(null);

  const filesWithMetadata = useMemo(
    () => images.filter((image) => image.metadata.hasExif || image.metadata.hasGps).length,
    [images]
  );
  const outputFormat = images[0]?.outputFormat ?? "jpg";

  async function handleFilesSelected(files: File[]) {
    const supportedFiles = files.filter((file) => isSupportedImageFile(file));

    if (supportedFiles.length === 0) {
      setToast("Desteklenen dosya bulunamadı. JPG, PNG, WebP veya HEIC deneyin.");
      return;
    }

    try {
      setLoading(true);
      const loadedImages = await Promise.all(supportedFiles.map((file) => loadSanitizableImage(file)));
      setImages((current) => [...current, ...loadedImages]);

      if (supportedFiles.length !== files.length) {
        setToast("Bazı dosyalar desteklenmediği için atlandı.");
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Görseller hazırlanamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!images.length) return;

    try {
      setExporting(true);
      const entries = await Promise.all(
        images.map(async (image) => ({
          blob: await sanitizeImage(image),
          fileName: buildOutputFileName(image),
        }))
      );

      if (entries.length === 1) {
        const [entry] = entries;
        downloadBlob(entry.blob, entry.fileName);
      } else {
        await downloadAsZip(entries, "clean-images.zip");
      }

      trackProcessSuccess({
        process_type: "metadata_clean",
        export_format: entries.length === 1 ? outputFormat : "zip",
        file_count: entries.length,
      });
      trackAppEvent("export_download", {
        export_format: entries.length === 1 ? outputFormat : "zip",
        file_count: entries.length,
      });
      setToast(`${formatCountLabel(entries.length, "görsel", "görsel")} için temiz kopya hazırlandı.`);
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "metadata_clean",
        error_code: "clean_failed",
        error_stage: "export",
      });
      setToast(error instanceof Error ? error.message : "Temiz kopyalar indirilemedi.");
    } finally {
      setExporting(false);
    }
  }

  function handleOutputFormatChange(nextFormat: OutputFormat) {
    setImages((current) => current.map((image) => ({ ...image, outputFormat: nextFormat })));
  }

  return (
    <main className="metadata-shell">
      <header className="app-header">
        <img className="brand-logo" src={logoUrl} alt="EXIF Cleaner" />
      </header>

      {images.length === 0 ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h1>Fotoğraflardaki metadata izlerini temizle.</h1>
            <p>
              GPS ve cihaz bilgilerini temiz kopyadan kaldır.
            </p>
          </div>

          <DropZone busy={loading} onFilesSelected={handleFilesSelected} />
        </section>
      ) : (
        <>
          <section className="workspace-shell">
            <input
              ref={loadMoreRef}
              type="file"
              accept={IMAGE_INPUT_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files ?? []);
                if (nextFiles.length > 0) {
                  void handleFilesSelected(nextFiles);
                }
                event.currentTarget.value = "";
              }}
            />

            <div className="workspace-toolbar">
              <div className="workspace-toolbar-copy">
                <h1>Temiz kopyaları indir.</h1>
                <p>Çıktı formatını seç ve dışa aktar.</p>

                <div className="workspace-summary">
                  <span className="summary-pill">
                    <strong>{images.length}</strong>
                    <span>dosya hazır</span>
                  </span>
                  <span className="summary-pill">
                    <strong>{filesWithMetadata}</strong>
                    <span>iz bulundu</span>
                  </span>
                  <span className="summary-pill">
                    <strong>{outputFormat.toUpperCase()}</strong>
                    <span>çıktı formatı</span>
                  </span>
                </div>
              </div>

              <div className="workspace-toolbar-panel">
                <div className="workspace-toolbar-top">
                  <button type="button" className="ghost-button" disabled={loading || exporting} onClick={() => loadMoreRef.current?.click()}>
                    + Fotoğraf Ekle
                  </button>

                  <label className="select-field">
                    <span>Çıktı formatı</span>
                    <select value={outputFormat} onChange={(event) => handleOutputFormatChange(event.target.value as OutputFormat)}>
                      <option value="jpg">JPG</option>
                      <option value="png">PNG</option>
                      <option value="webp">WebP</option>
                    </select>
                  </label>
                </div>

                <div className="workspace-toolbar-bottom">
                  <button type="button" className="primary-button" disabled={loading || exporting} onClick={() => void handleDownload()}>
                    {exporting ? "Temiz kopyalar hazırlanıyor..." : "İndir"}
                  </button>
                </div>
              </div>
            </div>

            <div className="workspace-main">
              <ImageGrid images={images} />
            </div>
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
