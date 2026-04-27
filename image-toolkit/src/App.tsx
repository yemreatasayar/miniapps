import { useEffect, useMemo, useRef, useState } from "react";
import DropZone from "./components/DropZone";
import ImageGrid from "./components/ImageGrid";
import SmartCompressPanel from "./components/SmartCompressPanel";
import Toast from "./components/Toast";
import Toolbar from "./components/Toolbar";
import { computeNormalizedScores, computeSmartQualities } from "./lib/quality-estimator";
import {
  downloadAsZip,
  downloadBlob,
  getOriginalFormat,
  IMAGE_INPUT_ACCEPT,
  isSupportedImageFile,
  loadImage,
  processImage,
} from "./lib/image-ops";
import type {
  ActiveTab,
  LoadedImage,
  OutputFormat,
  ResizeSettings,
  SmartCompressSettings,
  StandardCompressSettings,
} from "./lib/types";

const ACTIVE_TAB_KEY = "image-toolkit.activeTab";
const SMART_SETTINGS_KEY = "image-toolkit.smartSettings";
const STANDARD_SETTINGS_KEY = "image-toolkit.standardSettings";
const RESIZE_SETTINGS_KEY = "image-toolkit.resizeSettings";

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function buildFileName(original: string, format: OutputFormat, variant?: string): string {
  const base = original.replace(/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i, "");
  const suffix = variant ? `.${variant}` : "";
  return `${base}${suffix}.${format === "jpg" ? "jpg" : format}`;
}

function applyNormalizedScores(images: LoadedImage[]): LoadedImage[] {
  const scores = computeNormalizedScores(images);
  return images.map((image, index) => ({ ...image, normalizedScore: scores[index] ?? 0.5 }));
}

const isDistribution = window.location.hostname === "miniapps.tr";

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/image-resizer-logo.svg`;
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => readStoredValue(ACTIVE_TAB_KEY, "edit"));
  const [smartSettings, setSmartSettings] = useState<SmartCompressSettings>(() =>
    readStoredValue(SMART_SETTINGS_KEY, { slider: 0.5, format: "jpg" })
  );
  const [standardSettings, setStandardSettings] = useState<StandardCompressSettings>(() =>
    readStoredValue(STANDARD_SETTINGS_KEY, { quality: 0.8, format: "jpg" })
  );
  const [resizeSettings, setResizeSettings] = useState<ResizeSettings>(() =>
    readStoredValue(RESIZE_SETTINGS_KEY, { mode: "off", width: 1920, height: 1080 })
  );
  const [rotations, setRotations] = useState<Record<string, number>>({});
  const [flips, setFlips] = useState<Record<string, { h: boolean; v: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(activeTab));
  }, [activeTab]);

  useEffect(() => {
    window.localStorage.setItem(SMART_SETTINGS_KEY, JSON.stringify(smartSettings));
  }, [smartSettings]);

  useEffect(() => {
    window.localStorage.setItem(STANDARD_SETTINGS_KEY, JSON.stringify(standardSettings));
  }, [standardSettings]);

  useEffect(() => {
    window.localStorage.setItem(RESIZE_SETTINGS_KEY, JSON.stringify(resizeSettings));
  }, [resizeSettings]);

  useEffect(() => {
    function handleSelectAllShortcut(event: KeyboardEvent) {
      const isSelectAll = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a";
      if (!isSelectAll || images.length === 0) return;

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (isTypingTarget) return;

      event.preventDefault();

      const allIds = images.map((image) => image.id);
      const areAllSelected = allIds.length > 0 && allIds.every((id) => selectedImages.has(id));
      setSelectedImages(areAllSelected ? new Set() : new Set(allIds));
    }

    window.addEventListener("keydown", handleSelectAllShortcut);
    return () => window.removeEventListener("keydown", handleSelectAllShortcut);
  }, [images, selectedImages]);

  const imageCountLabel = useMemo(() => {
    if (images.length === 0) return "Görsel bekleniyor";
    return `${images.length} görsel`;
  }, [images.length]);

  const hasTransforms = useMemo(
    () =>
      images.some((image) => (rotations[image.id] ?? 0) !== 0 || flips[image.id]?.h || flips[image.id]?.v),
    [flips, images, rotations]
  );

  async function handleFilesAdded(files: File[]) {
    const supportedFiles = files.filter((file) => isSupportedImageFile(file));
    if (supportedFiles.length === 0) {
      setToast("Desteklenen görsel bulunamadı.");
      return;
    }

    try {
      setBusy(true);
      const loadedImages = await Promise.all(supportedFiles.map((file) => loadImage(file)));
      setImages((current) => applyNormalizedScores([...current, ...loadedImages]));
      setActiveTab("edit");

      const hasGif = supportedFiles.some((file) => file.type === "image/gif");
      const skippedCount = files.length - supportedFiles.length;
      const baseMessage = `${loadedImages.length} görsel eklendi.`;
      const skippedMessage = skippedCount > 0 ? ` ${skippedCount} dosya atlandı.` : "";
      setToast(hasGif ? `${baseMessage} GIF dosyaları ilk kare olarak işlenir.${skippedMessage}` : `${baseMessage}${skippedMessage}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Görseller yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }

  function updateSelection(id: string, checked: boolean) {
    setSelectedImages((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleRotate(id: string, direction: "cw" | "ccw") {
    setRotations((current) => {
      const currentRotation = current[id] ?? 0;
      const nextRotation =
        direction === "cw" ? (currentRotation + 90) % 360 : (currentRotation - 90 + 360) % 360;
      return { ...current, [id]: nextRotation };
    });
  }

  function handleFlip(id: string, axis: "h" | "v") {
    setFlips((current) => {
      const currentFlip = current[id] ?? { h: false, v: false };
      return {
        ...current,
        [id]: {
          ...currentFlip,
          [axis]: !currentFlip[axis],
        },
      };
    });
  }

  function handleRemove(id: string) {
    setImages((current) => applyNormalizedScores(current.filter((image) => image.id !== id)));
    setSelectedImages((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setRotations((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setFlips((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function handleDeleteSelected() {
    if (selectedImages.size === 0) return;

    setImages((current) => applyNormalizedScores(current.filter((image) => !selectedImages.has(image.id))));
    setSelectedImages(new Set());
    setRotations((current) => {
      const next = { ...current };
      for (const id of selectedImages) delete next[id];
      return next;
    });
    setFlips((current) => {
      const next = { ...current };
      for (const id of selectedImages) delete next[id];
      return next;
    });
    setToast("Seçili görseller kaldırıldı.");
  }

  async function handleApplyRotations() {
    const targets = images.filter(
      (image) => (rotations[image.id] ?? 0) !== 0 || flips[image.id]?.h || flips[image.id]?.v
    );
    if (targets.length === 0) return;

    try {
      setBusy(true);
      const processed = await Promise.all(
        targets.map(async (image) => {
          const format = getOriginalFormat(image);
          const blob = await processImage(image, {
            quality: 1,
            format,
            rotation: rotations[image.id] ?? 0,
            flipH: flips[image.id]?.h ?? false,
            flipV: flips[image.id]?.v ?? false,
          });

          const nextFile = new File([blob], buildFileName(image.fileName, format), { type: blob.type });
          const nextLoaded = await loadImage(nextFile);
          return { ...nextLoaded, id: image.id };
        })
      );

      const processedMap = new Map(processed.map((image) => [image.id, image]));
      setImages((current) =>
        applyNormalizedScores(current.map((image) => processedMap.get(image.id) ?? image))
      );
      setRotations({});
      setFlips({});
      setToast("Döndürme ve flip işlemleri uygulandı.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Görseller işlenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadProcessedImages(
    targets: LoadedImage[],
    format: OutputFormat,
    quality: number,
    variant?: string
  ) {
    const entries = await Promise.all(
      targets.map(async (image) => {
        const blob = await processImage(image, {
          quality,
          format,
          resize: resizeSettings,
          rotation: rotations[image.id] ?? 0,
          flipH: flips[image.id]?.h ?? false,
          flipV: flips[image.id]?.v ?? false,
        });

        return {
          blob,
          fileName: buildFileName(image.fileName, format, variant),
        };
      })
    );

    if (entries.length <= 1) {
      const [entry] = entries;
      if (entry) {
        downloadBlob(entry.blob, entry.fileName);
      }
      return;
    }

    await downloadAsZip(entries, "gorseller.zip");
  }

  async function handleDownloadSelected() {
    const targets = images.filter((image) => selectedImages.has(image.id));
    if (targets.length === 0) return;

    try {
      setBusy(true);
      if (targets.length === 1) {
        await downloadProcessedImages(targets, standardSettings.format, standardSettings.quality, "comp");
        setToast("Görsel indirildi.");
      } else {
        const entries = await Promise.all(
          targets.map(async (image) => {
            const blob = await processImage(image, {
              quality: standardSettings.quality,
              format: standardSettings.format,
              resize: resizeSettings,
              rotation: rotations[image.id] ?? 0,
              flipH: flips[image.id]?.h ?? false,
              flipV: flips[image.id]?.v ?? false,
            });

            return {
              blob,
              fileName: buildFileName(image.fileName, standardSettings.format, "comp"),
            };
          })
        );
        await downloadAsZip(entries, "gorseller-secili.zip");
        setToast(`${entries.length} görsel ZIP olarak indirildi.`);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Seçili görseller indirilemedi.");
    } finally {
      setBusy(false);
    }
  }

  function handleReorder(newIds: string[]) {
    setImages((current) => {
      const map = new Map(current.map((img) => [img.id, img]));
      return applyNormalizedScores(newIds.map((id) => map.get(id)!).filter(Boolean));
    });
  }

  async function handleDownloadZip(targets: LoadedImage[], zipName: string) {
    try {
      setBusy(true);
      const entries = await Promise.all(
        targets.map(async (image) => {
          const blob = await processImage(image, {
            quality: standardSettings.quality,
            format: standardSettings.format,
            resize: resizeSettings,
            rotation: rotations[image.id] ?? 0,
            flipH: flips[image.id]?.h ?? false,
            flipV: flips[image.id]?.v ?? false,
          });
          return { blob, fileName: buildFileName(image.fileName, standardSettings.format, "comp") };
        })
      );
      await downloadAsZip(entries, zipName);
      setToast(`${entries.length} görsel ZIP olarak indirildi.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "ZIP oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadAll() {
    if (images.length === 0) return;

    try {
      setBusy(true);
      if (images.length === 1) {
        await downloadProcessedImages(images, standardSettings.format, standardSettings.quality, "comp");
        setToast("Görsel indirildi.");
      } else {
        const entries = await Promise.all(
          images.map(async (image) => {
            const blob = await processImage(image, {
              quality: standardSettings.quality,
              format: standardSettings.format,
              resize: resizeSettings,
              rotation: rotations[image.id] ?? 0,
              flipH: flips[image.id]?.h ?? false,
              flipV: flips[image.id]?.v ?? false,
            });

            return {
              blob,
              fileName: buildFileName(image.fileName, standardSettings.format, "comp"),
            };
          })
        );
        await downloadAsZip(entries, "gorseller-tumu.zip");
        setToast(`${entries.length} görsel ZIP olarak indirildi.`);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Görseller indirilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSmartCompress() {
    if (images.length === 0) return;

    try {
      setBusy(true);
      const smartQualities = computeSmartQualities(
        images.map((image) => image.normalizedScore),
        smartSettings.slider
      );

      const entries = await Promise.all(
        images.map(async (image, index) => {
          const blob = await processImage(image, {
            quality: smartQualities[index] ?? 1,
            format: smartSettings.format,
            resize: resizeSettings,
            rotation: rotations[image.id] ?? 0,
            flipH: flips[image.id]?.h ?? false,
            flipV: flips[image.id]?.v ?? false,
          });

          return {
            blob,
            fileName: buildFileName(image.fileName, smartSettings.format, "comp"),
          };
        })
      );

      if (entries.length <= 1) {
        const [entry] = entries;
        if (entry) {
          downloadBlob(entry.blob, entry.fileName);
        }
        setToast("Görsel indirildi.");
      } else {
        await downloadAsZip(entries, "gorseller-smart-compress.zip");
        setToast(`${entries.length} görsel ZIP olarak indirildi.`);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Smart compress işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pdf-toolkit-shell">
      <header className="app-header">
        <div className="brand-copy">
          <img className="brand-logo" src={logoUrl} alt="Image Resizer" />
        </div>
      </header>

      <input
        ref={loadMoreRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          void handleFilesAdded(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />

      {images.length === 0 ? (
        <DropZone onFilesSelected={(files) => void handleFilesAdded(files)} loading={busy} />
      ) : (
        <>
          <nav className="tab-row">
            <button type="button" className={activeTab === "edit" ? "is-active" : ""} onClick={() => setActiveTab("edit")}>
              Edit
            </button>
            <button
              type="button"
              className={activeTab === "smart-compress" ? "is-active" : ""}
              onClick={() => setActiveTab("smart-compress")}
            >
              Smart Compress
            </button>
            <button
              type="button"
              className={activeTab === "compress" ? "is-active" : ""}
              onClick={() => setActiveTab("compress")}
            >
              Compress
            </button>
          </nav>

          {activeTab === "edit" ? (
            <section className="workspace-section">
              <Toolbar
                hasImages={images.length > 0}
                hasSelection={selectedImages.size > 0}
                hasRotations={hasTransforms}
                busy={busy}
                onLoadMore={() => loadMoreRef.current?.click()}
                onDeleteSelected={handleDeleteSelected}
                onApplyRotations={() => void handleApplyRotations()}
                onDownloadSelected={() => void handleDownloadSelected()}
                onDownloadAll={() => void handleDownloadAll()}
                onDownloadZipSelected={() => void handleDownloadZip(images.filter((img) => selectedImages.has(img.id)), "gorseller-secili.zip")}
                onDownloadZipAll={() => void handleDownloadZip(images, "gorseller-tumu.zip")}
                resizeSettings={resizeSettings}
                onResizeSettingsChange={setResizeSettings}
              />

              {busy ? <div className="loading-banner">Görseller işleniyor...</div> : null}

              <ImageGrid
                images={images}
                selectedImages={selectedImages}
                rotations={rotations}
                flips={flips}
                onSelectionChange={updateSelection}
                onReorder={handleReorder}
                onRotate={handleRotate}
                onFlipH={(id) => handleFlip(id, "h")}
                onFlipV={(id) => handleFlip(id, "v")}
                onRemove={handleRemove}
              />
            </section>
          ) : null}

          {activeTab === "smart-compress" ? (
            <SmartCompressPanel
              images={images}
              settings={smartSettings}
              onSettingsChange={setSmartSettings}
              onCompress={() => void handleSmartCompress()}
              busy={busy}
            />
          ) : null}

          {activeTab === "compress" ? (
            <section className="compress-panel">
              <div className="section-header">
                <div>
                  <h2>Compress</h2>
                  <p>Standart kalite ve format ayarlarıyla tüm görselleri indir.</p>
                </div>
              </div>

              <div className="preset-group">
                {(["jpg", "webp", "png"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    className={standardSettings.format === format ? "is-active" : ""}
                    onClick={() => setStandardSettings({ ...standardSettings, format })}
                  >
                    <strong>{format.toUpperCase()}</strong>
                  </button>
                ))}
              </div>

              <div className="slider-panel">
                <div className="slider-label-row">
                  <span>Düşük kalite</span>
                  <span>Yüksek kalite</span>
                </div>
                <input
                  className="quality-slider"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={standardSettings.quality}
                  onChange={(event) =>
                    setStandardSettings({ ...standardSettings, quality: Number(event.target.value) })
                  }
                />
              </div>

              {standardSettings.format === "png" ? (
                <div className="status-banner is-warning">PNG çıktısı kayıpsızdır; boyut küçülmesi sınırlı olabilir.</div>
              ) : null}

              <button type="button" className="compress-button" onClick={() => void handleDownloadAll()} disabled={busy}>
                {busy ? "İşleniyor..." : "Tümünü İndir"}
              </button>
            </section>
          ) : null}
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
