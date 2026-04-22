import { useMemo, useRef, useState } from "react";
import DropZone from "./components/DropZone";
import ImageGrid from "./components/ImageGrid";
import Toast from "./components/Toast";
import {
  IMAGE_INPUT_ACCEPT,
  buildOutputFileName,
  convertImage,
  downloadAsZip,
  downloadBlob,
  isSupportedImageFile,
  loadConvertibleImage,
} from "./lib/image-ops";
import type { ConvertibleImage, OutputFormat } from "./lib/types";

function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/image-format-converter-logo.svg`;
  const [images, setImages] = useState<ConvertibleImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("jpg");
  const [toast, setToast] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLInputElement | null>(null);

  const heicCount = useMemo(
    () => images.filter((image) => /\.(heic|heif)$/i.test(image.fileName)).length,
    [images]
  );

  async function handleFilesSelected(files: File[]) {
    const supportedFiles = files.filter((file) => isSupportedImageFile(file));

    if (supportedFiles.length === 0) {
      setToast("Desteklenen dosya bulunamadı. JPG, PNG, WebP, GIF, BMP veya HEIC deneyin.");
      return;
    }

    try {
      setLoading(true);
      const loadedImages = await Promise.all(supportedFiles.map((file) => loadConvertibleImage(file)));
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
          blob: await convertImage(image, outputFormat),
          fileName: buildOutputFileName(image, outputFormat),
        }))
      );

      if (entries.length === 1) {
        const [entry] = entries;
        downloadBlob(entry.blob, entry.fileName);
      } else {
        await downloadAsZip(entries, `converted-${outputFormat}.zip`);
      }

      setToast(`${formatCountLabel(entries.length, "görsel", "görsel")} ${outputFormat.toUpperCase()} olarak hazırlandı.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Dönüştürme tamamlanamadı.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="converter-shell">
      <header className="app-header">
        <img className="brand-logo" src={logoUrl} alt="Image Format Converter" />
      </header>

      {images.length === 0 ? (
        <section className="hero-panel">
          <div className="hero-copy">
            <h2>Görselleri yükle, istediğin formata tek akışta dönüştür.</h2>
            <p>Ürün görselleri, ekran görüntüleri, HEIC fotoğrafları veya kampanya asset’leri için hızlı yerel dönüştürme.</p>
          </div>

          <DropZone busy={loading} onFilesSelected={handleFilesSelected} />
        </section>
      ) : (
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
              <h2>Dönüştür ve dışa aktar.</h2>
              <p>Çıktı formatını seç, sonra tüm dosyaları tek seferde indir. Çoklu dosyalar zip olarak hazırlanır.</p>

              <div className="workspace-summary">
                <span className="summary-pill">
                  <strong>{images.length}</strong>
                  <span>dosya hazır</span>
                </span>
                <span className="summary-pill">
                  <strong>{heicCount}</strong>
                  <span>HEIC / HEIF</span>
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
                  + Görsel Ekle
                </button>

                <label className="select-field">
                  <span>Çıktı formatı</span>
                  <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                    <option value="webp">WebP</option>
                  </select>
                </label>
              </div>

              <div className="workspace-toolbar-bottom">
                <button type="button" className="primary-button" disabled={loading || exporting} onClick={() => void handleDownload()}>
                  {exporting ? "Dönüştürülüyor..." : "İndir"}
                </button>
              </div>
            </div>
          </div>

          <div className="workspace-main">
            <ImageGrid images={images} />
          </div>
        </section>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </main>
  );
}
