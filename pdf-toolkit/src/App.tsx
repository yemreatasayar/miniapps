import { useEffect, useMemo, useRef, useState } from "react";
import CompressPanel from "./components/CompressPanel";
import DropZone from "./components/DropZone";
import PageGrid from "./components/PageGrid";
import TableExtractPanel from "./components/TableExtractPanel";
import TextExtractPanel from "./components/TextExtractPanel";
import Toast from "./components/Toast";
import Toolbar from "./components/Toolbar";
import WatermarkPanel from "./components/WatermarkPanel";
import {
  checkCompressAvailable,
  compressPdf,
  repairPdf,
} from "./lib/compress-client";
import {
  applyWatermark,
  buildCsvBlobsFromExtractedTables,
  buildExcelBlobFromExtractedTables,
  downloadBlobsAsZip,
  downloadBlob,
  downloadBytesAsZip,
  downloadBytes,
  extractPages,
  extractStructuredText,
  extractTablesFromPdf,
  extractStructuredTextWithOcr,
  loadPdf,
  loadPdfFromBytes,
  mergePdfs,
  renderPageImageBlob,
  renderThumbnail,
  reorderPages,
  rotatePages,
  splitPdf,
  zipFileName,
} from "./lib/pdf-ops";
import { buildDocxBlobFromExtractedText } from "./lib/text-docx";
import type {
  ActiveTab,
  CompressPreset,
  CompressStatus,
  ExtractedTableDocument,
  ExtractedTextDocument,
  ImageExportFormat,
  LoadedPdf,
  PdfPage,
  TextExtractMode,
  WatermarkSettings,
} from "./lib/types";

const ACTIVE_TAB_KEY = "pdf-toolkit.activeTab";
const PRESET_KEY = "pdf-toolkit.compressPreset";
const IMAGE_EXPORT_FORMAT_KEY = "pdf-toolkit.imageExportFormat";
const WATERMARK_KEY = "pdf-toolkit.watermark";
const TEXT_EXTRACT_MODE_KEY = "pdf-toolkit.textExtractMode";

const DEFAULT_WATERMARK: WatermarkSettings = {
  type: "text",
  text: "",
  fontSize: 64,
  color: "gray",
  imageDataUrl: null,
  imageFileName: null,
  imageScale: 0.4,
  opacity: 0.25,
  target: "all",
};

const assetUrl = (fileName: string) => `${import.meta.env.BASE_URL}assets/${fileName}`;

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeFileName(fileName: string, suffix: string): string {
  return fileName.replace(/\.pdf$/i, `${suffix}.pdf`);
}

function buildTableExtractionContextKey(loadedPdf: LoadedPdf | null, selectedPages: Set<number>): string | null {
  if (!loadedPdf) return null;
  const selected = [...selectedPages].sort((left, right) => left - right);
  const scope = selected.length > 0 ? selected.join(",") : "all";
  return `${loadedPdf.fileName}:${loadedPdf.fileBytes.length}:${scope}`;
}

const isDistribution = window.location.hostname === "miniapps.tr";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => readStoredValue(ACTIVE_TAB_KEY, "edit"));
  const [loadedPdf, setLoadedPdf] = useState<LoadedPdf | null>(null);
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [compressPreset, setCompressPreset] = useState<CompressPreset>(() =>
    readStoredValue(PRESET_KEY, "balanced")
  );
  const [imageExportFormat, setImageExportFormat] = useState<ImageExportFormat>(() =>
    readStoredValue(IMAGE_EXPORT_FORMAT_KEY, "png")
  );
  const [watermarkSettings, setWatermarkSettings] = useState<WatermarkSettings>(() =>
    readStoredValue(WATERMARK_KEY, DEFAULT_WATERMARK)
  );
  const [textExtractMode, setTextExtractMode] = useState<TextExtractMode>(() =>
    readStoredValue(TEXT_EXTRACT_MODE_KEY, "text-layer")
  );
  const [compressStatus, setCompressStatus] = useState<CompressStatus>({ kind: "idle" });
  const [compressAvailable, setCompressAvailable] = useState<boolean | null>(null);
  const [extractedText, setExtractedText] = useState<ExtractedTextDocument | null>(null);
  const [extractedTables, setExtractedTables] = useState<ExtractedTableDocument | null>(null);
  const [tableExtractionContextKey, setTableExtractionContextKey] = useState<string | null>(null);
  const [textExtractStatus, setTextExtractStatus] = useState<string | null>(null);
  const [tableExtractStatus, setTableExtractStatus] = useState<string | null>(null);
  const [tablePreviewPageNumber, setTablePreviewPageNumber] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isReplacingPdf, setIsReplacingPdf] = useState(false);
  const loadInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    checkCompressAvailable().then((available) => {
      setCompressAvailable(available);
      if (!available) {
        setCompressStatus({ kind: "unavailable" });
      }
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(activeTab));
  }, [activeTab]);

  useEffect(() => {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(compressPreset));
  }, [compressPreset]);

  useEffect(() => {
    window.localStorage.setItem(IMAGE_EXPORT_FORMAT_KEY, JSON.stringify(imageExportFormat));
  }, [imageExportFormat]);

  useEffect(() => {
    window.localStorage.setItem(WATERMARK_KEY, JSON.stringify(watermarkSettings));
  }, [watermarkSettings]);

  useEffect(() => {
    window.localStorage.setItem(TEXT_EXTRACT_MODE_KEY, JSON.stringify(textExtractMode));
  }, [textExtractMode]);

  useEffect(() => {
    if (compressStatus.kind !== "success") return undefined;

    return () => {
      URL.revokeObjectURL(compressStatus.downloadUrl);
    };
  }, [compressStatus]);

  useEffect(() => {
    function handleSelectAllShortcut(event: KeyboardEvent) {
      const isSelectAll = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a";
      if (!isSelectAll || !loadedPdf || activeTab !== "edit") return;

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (isTypingTarget) return;

      event.preventDefault();

      const allPageIndexes = pages.map((page) => page.pageIndex);
      const areAllSelected =
        allPageIndexes.length > 0 && allPageIndexes.every((pageIndex) => selectedPages.has(pageIndex));

      setSelectedPages(areAllSelected ? new Set() : new Set(allPageIndexes));
    }

    window.addEventListener("keydown", handleSelectAllShortcut);
    return () => window.removeEventListener("keydown", handleSelectAllShortcut);
  }, [activeTab, loadedPdf, pages, selectedPages]);

  async function handleFileSelected(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setToast("Lütfen bir PDF dosyası seç.");
      return;
    }

    try {
      setBusy(true);
      const nextLoadedPdf = await loadPdf(file);
      setLoadedPdf(nextLoadedPdf);
      setPages(nextLoadedPdf.pages);
      setSelectedPages(new Set());
      setExtractedText(null);
      setExtractedTables(null);
      setTableExtractionContextKey(null);
      setTextExtractStatus(null);
      setTableExtractStatus(null);
      setTablePreviewPageNumber(null);
      setActiveTab("edit");
      setCompressStatus({ kind: "idle" });
      setToast(`${file.name} yüklendi.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "PDF yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }

  function handleDroppedPdf(fileList: FileList | null) {
    const pdfFiles = Array.from(fileList ?? []).filter((entry) => entry.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      setToast("Lütfen bir PDF dosyası bırak.");
      return;
    }

    if (!loadedPdf) {
      void handleFileSelected(pdfFiles[0]);
      return;
    }

    const nextFileList = {
      ...pdfFiles,
      length: pdfFiles.length,
      item: (index: number) => pdfFiles[index] ?? null,
    } as FileList;

    void handleMergeFiles(nextFileList, { downloadResult: false });
  }

  function updateSelection(index: number, checked: boolean) {
    setSelectedPages((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
  }

  async function replaceLoadedPdf(fileName: string, fileBytes: Uint8Array, message?: string) {
    const nextLoadedPdf = await loadPdfFromBytes(fileName, fileBytes);
    setLoadedPdf(nextLoadedPdf);
    setPages(nextLoadedPdf.pages);
    setSelectedPages(new Set());
    if (message) setToast(message);
  }

  async function handleRotate(index: number, direction: "cw" | "ccw") {
    const currentPage = pages.find((p) => p.pageIndex === index);
    if (!currentPage || !loadedPdf) return;

    const newRotation =
      direction === "cw"
        ? (currentPage.rotation + 90) % 360
        : (currentPage.rotation - 90 + 360) % 360;

    setPages((current) =>
      current.map((p) => (p.pageIndex === index ? { ...p, rotation: newRotation } : p))
    );

    try {
      const newThumbnail = await renderThumbnail(loadedPdf.fileBytes, index, newRotation);
      setPages((current) =>
        current.map((p) => (p.pageIndex === index ? { ...p, thumbnail: newThumbnail } : p))
      );
    } catch {
      // thumbnail yeniden render edilemedi; rotation state'te doğru tutuluyor
    }
  }

  async function handleReorder(newOrder: number[]) {
    if (!loadedPdf) return;

    try {
      setBusy(true);
      const reorderedBytes = await reorderPages(loadedPdf.fileBytes, newOrder);
      await replaceLoadedPdf(loadedPdf.fileName, reorderedBytes, "Sayfa sırası güncellendi.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Sayfa sırası güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function queueDownloads(entries: Array<{ fileName: string; bytes: Uint8Array }>) {
    if (entries.length === 0) return;
    if (entries.length === 1) {
      const [entry] = entries;
      if (entry) downloadBytes(entry.bytes, entry.fileName);
      return;
    }

    await downloadBytesAsZip(entries, zipFileName(entries[0]?.fileName ?? "pdf-ciktilari"));
  }

  async function queueBlobDownloads(entries: Array<{ fileName: string; blob: Blob }>) {
    if (entries.length === 0) return;
    if (entries.length === 1) {
      const [entry] = entries;
      if (entry) downloadBlob(entry.blob, entry.fileName);
      return;
    }

    await downloadBlobsAsZip(entries, zipFileName(entries[0]?.fileName ?? "pdf-gorselleri"));
  }

  async function handleSplit() {
    if (!loadedPdf) return;

    try {
      setBusy(true);
      const selected = [...selectedPages].sort((left, right) => left - right);
      const splitTargets = selected.length > 0 ? selected : pages.map((page) => page.pageIndex);
      const parts = await splitPdf(
        loadedPdf.fileBytes,
        splitTargets.map((pageIndex) => ({ from: pageIndex, to: pageIndex }))
      );

      const downloads = parts.map((bytes, index) => ({
        bytes,
        fileName: normalizeFileName(
          loadedPdf.fileName,
          selected.length > 0 ? `-secili-sayfa-${index + 1}` : `-sayfa-${index + 1}`
        ),
      }));

      if (selected.length > 0) {
        const remaining = pages.map((page) => page.pageIndex).filter((pageIndex) => !selectedPages.has(pageIndex));
        if (remaining.length > 0) {
          const remainderBytes = await extractPages(loadedPdf.fileBytes, remaining);
          downloads.push({
            bytes: remainderBytes,
            fileName: normalizeFileName(loadedPdf.fileName, "-kalan"),
          });
        }
      }

      await queueDownloads(downloads);
      setToast("Split tamamlandı.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Split işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMergeFiles(files: FileList | null, options?: { downloadResult?: boolean }) {
    if (!loadedPdf || !files || files.length === 0) return;

    try {
      setBusy(true);
      const fileBytesList = await Promise.all(
        Array.from(files).map(async (file) => new Uint8Array(await file.arrayBuffer()))
      );
      const mergedBytes = await mergePdfs([loadedPdf.fileBytes, ...fileBytesList]);
      if (options?.downloadResult !== false) {
        downloadBytes(mergedBytes, normalizeFileName(loadedPdf.fileName, "-merged"));
      }
      await replaceLoadedPdf(loadedPdf.fileName, mergedBytes, "PDF'ler birleştirildi.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Merge işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExtract() {
    if (!loadedPdf || selectedPages.size === 0) return;

    try {
      setBusy(true);
      const selected = [...selectedPages].sort((left, right) => left - right);
      const extractedBytes = await extractPages(loadedPdf.fileBytes, selected);
      downloadBytes(extractedBytes, normalizeFileName(loadedPdf.fileName, "-extract"));
      setToast("Seçili sayfalar indirildi.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Extract işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSelected() {
    if (!loadedPdf || selectedPages.size === 0) return;

    const remaining = pages.map((page) => page.pageIndex).filter((pageIndex) => !selectedPages.has(pageIndex));
    if (remaining.length === 0) {
      setLoadedPdf(null);
      setPages([]);
      setSelectedPages(new Set());
      setCompressStatus({ kind: "idle" });
      setActiveTab("edit");
      setToast("Tüm sayfalar kaldırıldı.");
      return;
    }

    try {
      setBusy(true);
      const nextBytes = await extractPages(loadedPdf.fileBytes, remaining);
      await replaceLoadedPdf(loadedPdf.fileName, nextBytes, "Seçili sayfalar kaldırıldı.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Silme işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExportImages() {
    if (!loadedPdf || pages.length === 0) return;

    const targets = pages.filter((page) =>
      selectedPages.size > 0 ? selectedPages.has(page.pageIndex) : true
    );

    try {
      setBusy(true);
      const baseName = loadedPdf.fileName.replace(/\.pdf$/i, "");
      const downloads = await Promise.all(
        targets.map(async (page, index) => {
          const blob = await renderPageImageBlob(
            loadedPdf.fileBytes,
            page.pageIndex,
            page.rotation,
            imageExportFormat
          );

          return {
            blob,
            fileName: `${baseName}-sayfa-${String(index + 1).padStart(2, "0")}.${imageExportFormat}`,
          };
        })
      );

      await queueBlobDownloads(downloads);
      setToast(
        `${targets.length} sayfa ${imageExportFormat.toUpperCase()} olarak indirilmeye hazırlandı.`
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Görsel export işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyRotations() {
    if (!loadedPdf) return;

    const rotations = Object.fromEntries(
      pages.filter((page) => page.rotation !== 0).map((page) => [page.pageIndex, page.rotation])
    ) as Record<number, number>;

    if (Object.keys(rotations).length === 0) {
      setToast("Uygulanacak rotasyon yok.");
      return;
    }

    try {
      setBusy(true);
      const rotatedBytes = await rotatePages(loadedPdf.fileBytes, rotations);
      downloadBytes(rotatedBytes, normalizeFileName(loadedPdf.fileName, "-rotated"));
      await replaceLoadedPdf(loadedPdf.fileName, rotatedBytes, "Rotasyon PDF'e yazıldı.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Rotasyon uygulanamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRepair() {
    if (!loadedPdf || compressAvailable !== true) return;

    try {
      setBusy(true);
      const result = await repairPdf(loadedPdf.fileBytes, loadedPdf.fileName);
      if (result.ok) {
        downloadBytes(result.bytes, result.fileName);
        setToast("Repair tamamlandı — Acrobat uyumlu PDF indirildi.");
      } else {
        setToast(result.message);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Repair başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompress() {
    if (!loadedPdf || compressAvailable !== true) return;

    setCompressStatus({ kind: "loading" });
    const status = await compressPdf(loadedPdf.fileBytes, loadedPdf.fileName, compressPreset);
    setCompressStatus(status);
    if (status.kind === "error" || status.kind === "web-disabled") {
      setToast(status.message);
    }
  }

  async function handleApplyWatermark() {
    const hasWatermarkContent =
      watermarkSettings.type === "text"
        ? watermarkSettings.text.trim().length > 0
        : watermarkSettings.imageDataUrl !== null;

    if (!loadedPdf || !hasWatermarkContent) return;

    const targetIndices =
      watermarkSettings.target === "selected" && selectedPages.size > 0
        ? [...selectedPages].sort((a, b) => a - b)
        : pages.map((p) => p.pageIndex);

    try {
      setBusy(true);
      const result = await applyWatermark(loadedPdf.fileBytes, watermarkSettings, targetIndices);
      const suffix =
        watermarkSettings.target === "selected" ? "-watermark-secili" : "-watermark";
      downloadBytes(result, normalizeFileName(loadedPdf.fileName, suffix));
      setToast("Watermark eklendi, PDF indirildi.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Watermark eklenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExtractTextToDocx() {
    if (!loadedPdf) return;

    const targetPages =
      selectedPages.size > 0 ? [...selectedPages].sort((left, right) => left - right) : undefined;
    const rotations = Object.fromEntries(
      pages.map((page) => [page.pageIndex, page.rotation])
    ) as Record<number, number>;

    try {
      setBusy(true);
      setTextExtractStatus(
        textExtractMode === "ocr"
          ? "OCR hazırlanıyor. İlk kullanım biraz sürebilir."
          : "Metin katmanı okunuyor."
      );
      const extracted =
        textExtractMode === "ocr"
          ? await extractStructuredTextWithOcr(loadedPdf.fileBytes, targetPages, rotations, setTextExtractStatus)
          : await extractStructuredText(loadedPdf.fileBytes, targetPages);
      setExtractedText(extracted);

      const fileName = loadedPdf.fileName.replace(
        /\.pdf$/i,
        textExtractMode === "ocr" ? "-ocr.docx" : "-text.docx"
      );
      const docxBlob = await buildDocxBlobFromExtractedText(extracted, loadedPdf.fileName);
      downloadBlob(docxBlob, fileName);
      setTextExtractStatus(textExtractMode === "ocr" ? "OCR tamamlandı." : "Metin çıkarma tamamlandı.");
      setToast(textExtractMode === "ocr" ? "OCR ile DOCX hazırlandı ve indirildi." : "DOCX hazırlandı ve indirildi.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Text extraction başarısız.");
      setTextExtractStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function runTableExtraction(options?: { announceSuccess?: boolean }) {
    if (!loadedPdf) return;

    const targetPages =
      selectedPages.size > 0 ? [...selectedPages].sort((left, right) => left - right) : undefined;
    const nextContextKey = buildTableExtractionContextKey(loadedPdf, selectedPages);

    try {
      setBusy(true);
      setTableExtractStatus("Tablo yapısı analiz ediliyor.");
      const extracted = await extractTablesFromPdf(loadedPdf.fileBytes, targetPages, setTableExtractStatus);
      setExtractedTables(extracted);
      setTableExtractionContextKey(nextContextKey);
      setTablePreviewPageNumber(extracted.pages[0]?.pageNumber ?? null);

      if (extracted.pages.length === 0) {
        setToast("Tablo bulunamadı.");
        return null;
      }

      if (options?.announceSuccess !== false) {
        setToast(`${extracted.pages.length} sayfada tablo çıkarıldı.`);
      }
      return extracted;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Table extraction başarısız.");
      setTableExtractStatus(null);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleExtractTables() {
    await runTableExtraction({ announceSuccess: true });
  }

  async function ensureExtractedTablesReady() {
    const nextContextKey = buildTableExtractionContextKey(loadedPdf, selectedPages);
    if (
      extractedTables &&
      extractedTables.pages.length > 0 &&
      tableExtractionContextKey !== null &&
      tableExtractionContextKey === nextContextKey
    ) {
      return extractedTables;
    }

    return runTableExtraction({ announceSuccess: false });
  }

  async function handleDownloadTableCsv() {
    if (!loadedPdf) return;

    const readyTables = await ensureExtractedTablesReady();
    if (!readyTables || readyTables.pages.length === 0) return;

    const baseName = loadedPdf.fileName.replace(/\.pdf$/i, "");
    const entries = buildCsvBlobsFromExtractedTables(readyTables).map((entry) => ({
      fileName: `${baseName}-sayfa-${String(entry.pageNumber).padStart(2, "0")}.csv`,
      blob: entry.blob,
    }));

    if (entries.length === 1) {
      const [entry] = entries;
      if (entry) {
        downloadBlob(entry.blob, entry.fileName);
      }
    } else {
      await downloadBlobsAsZip(entries, zipFileName(`${baseName}-csv`));
    }

    setToast(entries.length === 1 ? "CSV indirildi." : "CSV dosyaları ZIP olarak indirildi.");
  }

  async function handleDownloadTableExcel() {
    if (!loadedPdf) return;

    const readyTables = await ensureExtractedTablesReady();
    if (!readyTables || readyTables.pages.length === 0) return;

    const baseName = loadedPdf.fileName.replace(/\.pdf$/i, "");
    const excelBlob = buildExcelBlobFromExtractedTables(readyTables);
    downloadBlob(excelBlob, `${baseName}-tables.xlsx`);
    setToast("Excel dosyası indirildi.");
  }

  function handleBack() {
    setLoadedPdf(null);
    setPages([]);
    setSelectedPages(new Set());
    setExtractedText(null);
    setExtractedTables(null);
    setTableExtractionContextKey(null);
    setTextExtractStatus(null);
    setTableExtractStatus(null);
    setTablePreviewPageNumber(null);
    setCompressStatus({ kind: "idle" });
    setActiveTab("edit");
    setBusy(false);
  }

  return (
    <main className="pdf-toolkit-shell">
      <header className="app-header">
        <div className="brand-block">
          <img src={assetUrl("pdf-toolkit-logo-dis.svg")} alt="PDF Toolkit" />
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="header-back-button"
            onClick={loadedPdf ? handleBack : () => loadInputRef.current?.click()}
          >
            {loadedPdf ? "Geri" : "PDF Yükle"}
          </button>
        </div>
      </header>

      <input
        ref={loadInputRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFileSelected(file);
          }
          event.currentTarget.value = "";
        }}
      />

      <input
        ref={mergeInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        hidden
        onChange={(event) => {
          void handleMergeFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {!loadedPdf ? (
        <DropZone onFileSelected={(file) => void handleFileSelected(file)} loading={busy} />
      ) : (
        <div
          className={`loaded-pdf-shell ${isReplacingPdf ? "is-dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsReplacingPdf(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsReplacingPdf(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setIsReplacingPdf(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsReplacingPdf(false);
            handleDroppedPdf(event.dataTransfer.files);
          }}
        >
          <nav className="tab-row">
            <button
              type="button"
              className={activeTab === "edit" ? "is-active" : ""}
              onClick={() => setActiveTab("edit")}
            >
              Edit
            </button>
            <button
              type="button"
              className={activeTab === "text" ? "is-active" : ""}
              onClick={() => setActiveTab("text")}
            >
              Text
            </button>
            <button
              type="button"
              className={activeTab === "table" ? "is-active" : ""}
              onClick={() => setActiveTab("table")}
            >
              CSV / Excel
            </button>
            <button
              type="button"
              className={activeTab === "compress" ? "is-active" : ""}
              onClick={() => setActiveTab("compress")}
            >
              Compress
            </button>
            <button
              type="button"
              className={activeTab === "watermark" ? "is-active" : ""}
              onClick={() => setActiveTab("watermark")}
            >
              Watermark
            </button>
          </nav>

          {activeTab === "watermark" ? (
            <WatermarkPanel
              loadedPdf={loadedPdf}
              pages={pages}
              selectedPages={selectedPages}
              settings={watermarkSettings}
              onSettingsChange={setWatermarkSettings}
              onApply={() => void handleApplyWatermark()}
              busy={busy}
            />
          ) : activeTab === "text" ? (
            <TextExtractPanel
              loadedPdf={loadedPdf}
              selectedCount={selectedPages.size}
              extractedText={extractedText}
              mode={textExtractMode}
              statusMessage={textExtractStatus}
              onModeChange={(mode) => {
                setTextExtractMode(mode);
                setExtractedText(null);
                setTextExtractStatus(null);
              }}
              onGenerate={() => void handleExtractTextToDocx()}
              busy={busy}
            />
          ) : activeTab === "table" ? (
            <TableExtractPanel
              loadedPdf={loadedPdf}
              selectedCount={selectedPages.size}
              extractedTables={extractedTables}
              previewPageNumber={tablePreviewPageNumber}
              statusMessage={tableExtractStatus}
              busy={busy}
              onExtract={() => void handleExtractTables()}
              onDownloadCsv={() => void handleDownloadTableCsv()}
              onDownloadExcel={handleDownloadTableExcel}
              onPreviewPageChange={setTablePreviewPageNumber}
            />
          ) : activeTab === "edit" ? (
            <section className="workspace-section">
              <Toolbar
                loadedPdf={loadedPdf}
                pages={pages}
                selectedPages={selectedPages}
                compressAvailable={compressAvailable}
                onSplit={() => void handleSplit()}
                onMerge={() => mergeInputRef.current?.click()}
                onExtract={() => void handleExtract()}
                onDeleteSelected={() => void handleDeleteSelected()}
                onApplyRotations={() => void handleApplyRotations()}
                onRepair={() => void handleRepair()}
                onLoadNew={() => loadInputRef.current?.click()}
                imageExportFormat={imageExportFormat}
                onImageExportFormatChange={setImageExportFormat}
                onExportImages={() => void handleExportImages()}
                busy={busy}
              />

              {busy ? <div className="loading-banner">PDF işleniyor...</div> : null}

              <PageGrid
                pages={pages}
                selectedPages={selectedPages}
                onSelectionChange={updateSelection}
                onReorder={(newOrder) => void handleReorder(newOrder)}
                onRotate={(index, direction) => void handleRotate(index, direction)}
              />
            </section>
          ) : (
            <CompressPanel
              available={compressAvailable}
              status={compressStatus}
              preset={compressPreset}
              onPresetChange={setCompressPreset}
              onCompress={() => void handleCompress()}
              loadedPdf={loadedPdf}
            />
          )}
          <div className="loaded-pdf-drop-hint">PDF eklemek ve birleştirmek için dosyayı buraya bırak</div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
      {isDistribution && (
        <footer className="miniapps-footer">
          <a href="https://miniapps.tr" aria-label="miniapps.tr">
            <img
              src={`${import.meta.env.BASE_URL}assets/miniapps-logo-light.svg`}
              alt="miniapps.tr"
              className="miniapps-footer-logo"
            />
          </a>
        </footer>
      )}
    </main>
  );
}
