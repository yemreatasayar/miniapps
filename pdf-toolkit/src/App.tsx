import { useEffect, useMemo, useRef, useState } from "react";
import CompressPanel from "./components/CompressPanel";
import ConvertPanel from "./components/ConvertPanel";
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
import { trackAppEvent, trackProcessSuccess } from "./lib/analytics";
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
import {
  checkConvertHelperStatus,
  convertImagesToPdf,
  convertOfficeToPdf,
  getFileExtension,
  isSupportedImageFile,
  isSupportedOfficeFile,
} from "./lib/convert-client";
import type { ConvertHelperStatus } from "./lib/convert-client";
import { getPdfLocale, pdfCopy } from "./lib/i18n";
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
const MAX_OFFICE_CONVERT_FILES = 50;
const MAX_CONVERT_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_CONVERT_TOTAL_MB = Math.round(MAX_CONVERT_TOTAL_BYTES / 1024 / 1024);

type ConvertedPdfState = {
  fileName: string;
  fileBytes?: Uint8Array;
  files?: Array<{ fileName: string; bytes: Uint8Array }>;
  sourceFormat: string;
  isArchive?: boolean;
};

export default function App() {
  const copy = pdfCopy[getPdfLocale()];
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
  const [convertHelperStatus, setConvertHelperStatus] = useState<ConvertHelperStatus | null>(null);
  const [convertSelection, setConvertSelection] = useState<File[]>([]);
  const [convertedPdf, setConvertedPdf] = useState<ConvertedPdfState | null>(null);
  const [convertStatusMessage, setConvertStatusMessage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<ExtractedTextDocument | null>(null);
  const [extractedTables, setExtractedTables] = useState<ExtractedTableDocument | null>(null);
  const [tableExtractionContextKey, setTableExtractionContextKey] = useState<string | null>(null);
  const [textExtractStatus, setTextExtractStatus] = useState<string | null>(null);
  const [tableExtractStatus, setTableExtractStatus] = useState<string | null>(null);
  const [tablePreviewPageNumber, setTablePreviewPageNumber] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isReplacingPdf, setIsReplacingPdf] = useState(false);
  const [undoStack, setUndoStack] = useState<Array<{ fileName: string; fileBytes: Uint8Array }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ fileName: string; fileBytes: Uint8Array }>>([]);
  const loadInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    checkCompressAvailable().then((available) => {
      setCompressAvailable(available);
      if (!available) {
        setCompressStatus({ kind: "unavailable" });
      }
    });
    checkConvertHelperStatus().then(setConvertHelperStatus);
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

  useEffect(() => {
    function handleEditShortcuts(event: KeyboardEvent) {
      if (!loadedPdf || activeTab !== "edit" || busy) return;

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (isTypingTarget) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedPages.size > 0) {
          event.preventDefault();
          void handleDeleteSelected();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        if (undoStack.length > 0) {
          event.preventDefault();
          void handleUndo();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        if (redoStack.length > 0) {
          event.preventDefault();
          void handleRedo();
        }
        return;
      }
    }

    window.addEventListener("keydown", handleEditShortcuts);
    return () => window.removeEventListener("keydown", handleEditShortcuts);
  }, [loadedPdf, activeTab, busy, selectedPages, undoStack, redoStack]);

  async function handleFileSelected(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setToast(copy.status.selectPdfFile);
      return;
    }

    try {
      setBusy(true);
      const nextLoadedPdf = await loadPdf(file);
      setLoadedPdf(nextLoadedPdf);
      setPages(nextLoadedPdf.pages);
      setSelectedPages(new Set());
      setUndoStack([]);
      setRedoStack([]);
      setExtractedText(null);
      setExtractedTables(null);
      setTableExtractionContextKey(null);
      setTextExtractStatus(null);
      setTableExtractStatus(null);
      setTablePreviewPageNumber(null);
      setActiveTab("edit");
      setCompressStatus({ kind: "idle" });
      setConvertSelection([]);
      setConvertedPdf(null);
      setConvertStatusMessage(null);
      setToast(copy.status.pdfLoaded(file.name));
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.status.pdfLoadFailed);
    } finally {
      setBusy(false);
    }
  }

  function handleDroppedPdf(fileList: FileList | null) {
    const pdfFiles = Array.from(fileList ?? []).filter((entry) => entry.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      setToast(copy.status.dropPdfFile);
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

  async function loadConvertedPdf(fileName: string, fileBytes: Uint8Array, message: string, nextTab: ActiveTab = "convert") {
    const nextLoadedPdf = await loadPdfFromBytes(fileName, fileBytes);
    setLoadedPdf(nextLoadedPdf);
    setPages(nextLoadedPdf.pages);
    setSelectedPages(new Set());
    setUndoStack([]);
    setRedoStack([]);
    setExtractedText(null);
    setExtractedTables(null);
    setTableExtractionContextKey(null);
    setTextExtractStatus(null);
    setTableExtractStatus(null);
    setTablePreviewPageNumber(null);
    setActiveTab(nextTab);
    setCompressStatus({ kind: "idle" });
    setToast(message);
  }

  async function replaceLoadedPdfWithHistory(fileName: string, fileBytes: Uint8Array, message?: string) {
    if (loadedPdf) {
      setUndoStack((prev) => [...prev.slice(-9), { fileName: loadedPdf.fileName, fileBytes: loadedPdf.fileBytes }]);
      setRedoStack([]);
    }
    await replaceLoadedPdf(fileName, fileBytes, message);
  }

  async function handleUndo() {
    if (undoStack.length === 0 || busy) return;
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    if (loadedPdf) {
      setRedoStack((r) => [...r.slice(-9), { fileName: loadedPdf.fileName, fileBytes: loadedPdf.fileBytes }]);
    }
    setUndoStack((s) => s.slice(0, -1));
    await replaceLoadedPdf(prev.fileName, prev.fileBytes, copy.status.undoDone);
  }

  async function handleRedo() {
    if (redoStack.length === 0 || busy) return;
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    if (loadedPdf) {
      setUndoStack((s) => [...s.slice(-9), { fileName: loadedPdf.fileName, fileBytes: loadedPdf.fileBytes }]);
    }
    setRedoStack((r) => r.slice(0, -1));
    await replaceLoadedPdf(next.fileName, next.fileBytes, copy.status.redoDone);
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
      await replaceLoadedPdfWithHistory(loadedPdf.fileName, reorderedBytes, copy.status.reorderDone);
      trackProcessSuccess({ process_type: "reorder_pages", file_count: 1 });
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "reorder_pages",
        error_code: "reorder_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.reorderFailed);
    } finally {
      setBusy(false);
    }
  }

  async function queueDownloads(entries: Array<{ fileName: string; bytes: Uint8Array }>) {
    if (entries.length === 0) return;
    if (entries.length === 1) {
      const [entry] = entries;
      if (entry) downloadBytes(entry.bytes, entry.fileName);
      trackAppEvent("export_download", { export_format: "pdf", file_count: 1 });
      return;
    }

    await downloadBytesAsZip(entries, zipFileName(entries[0]?.fileName ?? copy.fileNames.pdfOutputs));
    trackAppEvent("export_download", { export_format: "zip", file_count: entries.length });
  }

  async function queueBlobDownloads(entries: Array<{ fileName: string; blob: Blob }>) {
    if (entries.length === 0) return;
    if (entries.length === 1) {
      const [entry] = entries;
      if (entry) downloadBlob(entry.blob, entry.fileName);
      trackAppEvent("export_download", { export_format: entry?.fileName.split(".").pop()?.toLowerCase() || "blob", file_count: 1 });
      return;
    }

    await downloadBlobsAsZip(entries, zipFileName(entries[0]?.fileName ?? copy.fileNames.pdfImages));
    trackAppEvent("export_download", { export_format: "zip", file_count: entries.length });
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
          selected.length > 0 ? copy.fileNames.selectedPage(index + 1) : copy.fileNames.page(index + 1)
        ),
      }));

      if (selected.length > 0) {
        const remaining = pages.map((page) => page.pageIndex).filter((pageIndex) => !selectedPages.has(pageIndex));
        if (remaining.length > 0) {
          const remainderBytes = await extractPages(loadedPdf.fileBytes, remaining);
          downloads.push({
            bytes: remainderBytes,
            fileName: normalizeFileName(loadedPdf.fileName, copy.fileNames.remainder),
          });
        }
      }

      await queueDownloads(downloads);
      trackProcessSuccess({ process_type: "split_pdf", file_count: downloads.length });
      setToast(copy.status.splitDone);
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "split_pdf",
        error_code: "split_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.splitFailed);
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
        trackAppEvent("export_download", { export_format: "pdf", file_count: 1 });
      }
      await replaceLoadedPdfWithHistory(loadedPdf.fileName, mergedBytes, copy.status.mergeDone);
      trackProcessSuccess({ process_type: "merge_pdf", file_count: files.length + 1 });
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "merge_pdf",
        error_code: "merge_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.mergeFailed);
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
      trackProcessSuccess({ process_type: "extract_pages", file_count: 1 });
      trackAppEvent("export_download", { export_format: "pdf", file_count: 1 });
      setToast(copy.status.extractDownloaded);
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "extract_pages",
        error_code: "extract_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.extractFailed);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSelected() {
    if (!loadedPdf || selectedPages.size === 0) return;

    const remaining = pages.map((page) => page.pageIndex).filter((pageIndex) => !selectedPages.has(pageIndex));
    if (remaining.length === 0) {
      setUndoStack((prev) => [...prev.slice(-9), { fileName: loadedPdf.fileName, fileBytes: loadedPdf.fileBytes }]);
      setRedoStack([]);
      setLoadedPdf(null);
      setPages([]);
      setSelectedPages(new Set());
      setCompressStatus({ kind: "idle" });
      setActiveTab("edit");
      setToast(copy.status.allPagesRemoved);
      return;
    }

    try {
      setBusy(true);
      const nextBytes = await extractPages(loadedPdf.fileBytes, remaining);
      await replaceLoadedPdfWithHistory(loadedPdf.fileName, nextBytes, copy.status.selectedPagesRemoved);
      trackProcessSuccess({ process_type: "delete_pages", file_count: 1 });
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "delete_pages",
        error_code: "delete_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.deleteFailed);
    } finally {
      setBusy(false);
    }
  }

  async function handleExportImages() {
    if (!loadedPdf) return;

    if (imageExportFormat === "pdf") {
      downloadBytes(loadedPdf.fileBytes, loadedPdf.fileName);
      trackProcessSuccess({ process_type: "export_pages", export_format: "pdf", file_count: 1 });
      trackAppEvent("export_download", { export_format: "pdf", file_count: 1 });
      setToast(copy.status.pdfDownloaded);
      return;
    }

    if (pages.length === 0) return;

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
            imageExportFormat as "png" | "jpg"
          );

          return {
            blob,
            fileName: `${baseName}${copy.fileNames.pageImage(String(index + 1).padStart(2, "0"))}.${imageExportFormat}`,
          };
        })
      );

      await queueBlobDownloads(downloads);
      trackProcessSuccess({
        process_type: "export_pages",
        export_format: imageExportFormat,
        file_count: downloads.length,
      });
      setToast(copy.status.imageExportReady(targets.length, imageExportFormat));
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "export_pages",
        error_code: "image_export_failed",
        error_stage: "export",
      });
      setToast(error instanceof Error ? error.message : copy.status.imageExportFailed);
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
      setToast(copy.status.noRotation);
      return;
    }

    try {
      setBusy(true);
      const rotatedBytes = await rotatePages(loadedPdf.fileBytes, rotations);
      downloadBytes(rotatedBytes, normalizeFileName(loadedPdf.fileName, "-rotated"));
      await replaceLoadedPdfWithHistory(loadedPdf.fileName, rotatedBytes, copy.status.rotationApplied);
      trackProcessSuccess({ process_type: "rotate_pages", file_count: 1 });
      trackAppEvent("export_download", { export_format: "pdf", file_count: 1 });
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "rotate_pages",
        error_code: "rotate_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.rotationFailed);
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
        trackProcessSuccess({ process_type: "repair_pdf", file_count: 1 });
        trackAppEvent("export_download", { export_format: "pdf", file_count: 1 });
        setToast(copy.status.repairDone);
      } else {
        setToast(result.message);
      }
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "repair_pdf",
        error_code: "repair_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.repairFailed);
    } finally {
      setBusy(false);
    }
  }

  async function handleCompress() {
    if (!loadedPdf || compressAvailable !== true) return;

    setCompressStatus({ kind: "loading" });
    const status = await compressPdf(loadedPdf.fileBytes, loadedPdf.fileName, compressPreset);
    setCompressStatus(status);
    if (status.kind === "success") {
      trackProcessSuccess({
        process_type: "compress_pdf",
        export_format: "pdf",
        file_count: 1,
        input_size_kb: Math.max(1, Math.round(status.sizeOriginal / 1024)),
        output_size_kb: Math.max(1, Math.round(status.sizeResult / 1024)),
      });
    }
    if (status.kind === "error" || status.kind === "web-disabled") {
      setToast(status.message);
      trackAppEvent("process_error", {
        process_type: "compress_pdf",
        error_code: status.kind === "web-disabled" ? "web_disabled" : "compress_failed",
        error_stage: "process",
      });
    }
  }

  function handleConvertSelection(files: File[]) {
    setConvertSelection(files);
    setConvertedPdf(null);
    setConvertStatusMessage(null);
  }

  function handleDownloadConvertedPdf() {
    if (!convertedPdf) return;
    if (convertedPdf.isArchive && convertedPdf.files?.length) {
      void downloadBytesAsZip(convertedPdf.files, convertedPdf.fileName);
      trackAppEvent("export_download", { export_format: "zip", file_count: convertedPdf.files.length });
      return;
    }
    if (!convertedPdf.fileBytes) return;
    downloadBytes(convertedPdf.fileBytes, convertedPdf.fileName);
    trackAppEvent("export_download", { export_format: "pdf", file_count: 1 });
  }

  async function handleConvertFiles() {
    const files = convertSelection;
    if (files.length === 0) return;

    const imageFiles = files.filter(isSupportedImageFile);
    const officeFiles = files.filter(isSupportedOfficeFile);
    const unsupportedFiles = files.filter((file) => !isSupportedImageFile(file) && !isSupportedOfficeFile(file));

    if (unsupportedFiles.length > 0) {
      setToast(copy.status.unsupportedFile(unsupportedFiles[0]?.name ?? ""));
      return;
    }

    if (imageFiles.length > 0 && officeFiles.length > 0) {
      setToast(copy.status.mixedGroups);
      return;
    }

    if (officeFiles.length > MAX_OFFICE_CONVERT_FILES) {
      setToast(copy.status.tooManyOfficeFiles(MAX_OFFICE_CONVERT_FILES));
      return;
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_CONVERT_TOTAL_BYTES) {
      setToast(copy.status.convertSizeLimit(MAX_CONVERT_TOTAL_MB));
      return;
    }

    try {
      setBusy(true);
      setConvertStatusMessage(copy.status.preparingConvert);

      if (officeFiles.length > 1) {
        const convertedFiles: Array<{ fileName: string; bytes: Uint8Array; sourceFormat: string }> = [];

        for (const [index, file] of officeFiles.entries()) {
          setConvertStatusMessage(copy.status.convertingBatch(index + 1, officeFiles.length));
          const result = await convertOfficeToPdf(file);
          if (!result.ok) {
            setConvertStatusMessage(result.message);
            setToast(result.message);
            trackAppEvent("process_error", {
              process_type: "convert_to_pdf",
              error_code: "convert_failed",
              error_stage: "process",
              file_count: officeFiles.length,
            });
            return;
          }
          convertedFiles.push({
            fileName: result.fileName,
            bytes: result.bytes,
            sourceFormat: result.sourceFormat,
          });
        }

        const zipName = zipFileName(convertedFiles[0]?.fileName ?? copy.fileNames.pdfConversions, copy.fileNames.pdfConversions);
        setConvertedPdf({
          fileName: zipName,
          files: convertedFiles.map(({ fileName, bytes }) => ({ fileName, bytes })),
          sourceFormat: "office-batch",
          isArchive: true,
        });
        setConvertStatusMessage(copy.status.convertedBatchReady(convertedFiles.length));
        trackProcessSuccess({
          process_type: "convert_to_pdf",
          export_format: "zip",
          file_count: convertedFiles.length,
          source_format: "office-batch",
        });
        return;
      }

      const result =
        imageFiles.length > 0
          ? await convertImagesToPdf(imageFiles)
          : await convertOfficeToPdf(officeFiles[0] as File);

      if (!result.ok) {
        setConvertStatusMessage(result.message);
        setToast(result.message);
        trackAppEvent("process_error", {
          process_type: "convert_to_pdf",
          error_code: "convert_failed",
          error_stage: "process",
        });
        return;
      }

      setConvertedPdf({ fileName: result.fileName, fileBytes: result.bytes, sourceFormat: result.sourceFormat });
      await loadConvertedPdf(result.fileName, result.bytes, copy.status.convertedToast);
      setConvertStatusMessage(copy.status.convertedReady);
      trackProcessSuccess({
        process_type: "convert_to_pdf",
        export_format: "pdf",
        file_count: files.length,
        source_format: result.sourceFormat || getFileExtension(files[0]?.name || ""),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.status.convertFailed;
      setConvertStatusMessage(message);
      setToast(message);
      trackAppEvent("process_error", {
        process_type: "convert_to_pdf",
        error_code: "convert_failed",
        error_stage: "process",
      });
    } finally {
      setBusy(false);
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
        watermarkSettings.target === "selected" ? copy.fileNames.selectedWatermark : copy.fileNames.watermark;
      downloadBytes(result, normalizeFileName(loadedPdf.fileName, suffix));
      trackProcessSuccess({ process_type: "watermark_pdf", file_count: 1 });
      trackAppEvent("export_download", { export_format: "pdf", file_count: 1 });
      setToast(copy.status.watermarkDone);
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "watermark_pdf",
        error_code: "watermark_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.watermarkFailed);
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
          ? copy.status.textOcrPreparing
          : copy.status.textLayerReading
      );
      const extracted =
        textExtractMode === "ocr"
          ? await extractStructuredTextWithOcr(loadedPdf.fileBytes, targetPages, rotations, setTextExtractStatus, {
              preparing: copy.status.textOcrPreparing,
              page: copy.status.textOcrProgress,
              done: copy.status.textOcrDone,
            })
          : await extractStructuredText(loadedPdf.fileBytes, targetPages);
      setExtractedText(extracted);

      const fileName = loadedPdf.fileName.replace(
        /\.pdf$/i,
        textExtractMode === "ocr" ? "-ocr.docx" : "-text.docx"
      );
      const docxBlob = await buildDocxBlobFromExtractedText(extracted, loadedPdf.fileName, copy.status.textEmptyDocument);
      downloadBlob(docxBlob, fileName);
      trackProcessSuccess({
        process_type: textExtractMode === "ocr" ? "ocr_to_docx" : "text_to_docx",
        export_format: "docx",
        file_count: 1,
      });
      trackAppEvent("export_download", { export_format: "docx", file_count: 1 });
      setTextExtractStatus(textExtractMode === "ocr" ? copy.status.textOcrDone : copy.status.textLayerDone);
      setToast(textExtractMode === "ocr" ? copy.status.textOcrDocxReady : copy.status.textDocxReady);
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: textExtractMode === "ocr" ? "ocr_to_docx" : "text_to_docx",
        error_code: "text_extract_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.textExtractFailed);
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
      setTableExtractStatus(copy.status.tableAnalyzing);
      const extracted = await extractTablesFromPdf(loadedPdf.fileBytes, targetPages, setTableExtractStatus, {
        page: copy.status.tableProgress,
        done: copy.status.tableDone,
      });
      setExtractedTables(extracted);
      setTableExtractionContextKey(nextContextKey);
      setTablePreviewPageNumber(extracted.pages[0]?.pageNumber ?? null);

      if (extracted.pages.length === 0) {
        setToast(copy.status.tableNotFound);
        return null;
      }

      if (options?.announceSuccess !== false) {
        setToast(copy.status.tableExtracted(extracted.pages.length));
      }
      trackProcessSuccess({
        process_type: "extract_tables",
        file_count: extracted.pages.length,
      });
      return extracted;
    } catch (error) {
      trackAppEvent("process_error", {
        process_type: "extract_tables",
        error_code: "table_extract_failed",
        error_stage: "process",
      });
      setToast(error instanceof Error ? error.message : copy.status.tableExtractFailed);
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
      fileName: `${baseName}${copy.fileNames.tablePage(String(entry.pageNumber).padStart(2, "0"))}.csv`,
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

    setToast(entries.length === 1 ? copy.status.csvDownloaded : copy.status.csvZipDownloaded);
    trackAppEvent("export_download", {
      export_format: entries.length === 1 ? "csv" : "zip",
      file_count: entries.length,
    });
  }

  async function handleDownloadTableExcel() {
    if (!loadedPdf) return;

    const readyTables = await ensureExtractedTablesReady();
    if (!readyTables || readyTables.pages.length === 0) return;

    const baseName = loadedPdf.fileName.replace(/\.pdf$/i, "");
    const excelBlob = buildExcelBlobFromExtractedTables(readyTables, copy.status.tableSheetPrefix);
    downloadBlob(excelBlob, `${baseName}-tables.xlsx`);
    trackAppEvent("export_download", { export_format: "xlsx", file_count: 1 });
    setToast(copy.status.excelDownloaded);
  }

  function handleBack() {
    setLoadedPdf(null);
    setPages([]);
    setSelectedPages(new Set());
    setUndoStack([]);
    setRedoStack([]);
    setExtractedText(null);
    setExtractedTables(null);
    setTableExtractionContextKey(null);
    setTextExtractStatus(null);
    setTableExtractStatus(null);
    setTablePreviewPageNumber(null);
    setCompressStatus({ kind: "idle" });
    setConvertSelection([]);
    setConvertedPdf(null);
    setConvertStatusMessage(null);
    setActiveTab("edit");
    setBusy(false);
  }

  return (
    <main className="pdf-toolkit-shell">
      <header className="app-header">
        <div className="brand-block">
          <img src={assetUrl("pdf-toolkit-logo-dis.svg")} alt="PDF Toolkit" />
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
        <div className="landing-workspace">
          <DropZone onFileSelected={(file) => void handleFileSelected(file)} loading={busy} />
          <ConvertPanel
            helperStatus={convertHelperStatus}
            selectedFiles={convertSelection}
            convertedFileName={convertedPdf?.fileName ?? null}
            convertedIsArchive={convertedPdf?.isArchive === true}
            statusMessage={convertStatusMessage}
            busy={busy}
            onFilesSelected={handleConvertSelection}
            onConvert={() => void handleConvertFiles()}
            onDownload={handleDownloadConvertedPdf}
          />
        </div>
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
          <div className="loaded-pdf-topbar">
            <nav className="tab-row">
              <button
                type="button"
                className={activeTab === "edit" ? "is-active" : ""}
                onClick={() => setActiveTab("edit")}
              >
                {copy.tabs.edit}
              </button>
              <button
                type="button"
                className={activeTab === "convert" ? "is-active" : ""}
                onClick={() => setActiveTab("convert")}
              >
                {copy.tabs.convert}
              </button>
              <button
                type="button"
                className={activeTab === "text" ? "is-active" : ""}
                onClick={() => setActiveTab("text")}
              >
                {copy.tabs.text}
              </button>
              <button
                type="button"
                className={activeTab === "table" ? "is-active" : ""}
                onClick={() => setActiveTab("table")}
              >
                {copy.tabs.table}
              </button>
              <button
                type="button"
                className={activeTab === "compress" ? "is-active" : ""}
                onClick={() => setActiveTab("compress")}
              >
                {copy.tabs.compress}
              </button>
              <button
                type="button"
                className={activeTab === "watermark" ? "is-active" : ""}
                onClick={() => setActiveTab("watermark")}
              >
                {copy.tabs.watermark}
              </button>
            </nav>
            <button type="button" className="header-back-button" onClick={handleBack}>
              {copy.back}
            </button>
          </div>

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
          ) : activeTab === "convert" ? (
            <ConvertPanel
              helperStatus={convertHelperStatus}
              selectedFiles={convertSelection}
              convertedFileName={convertedPdf?.fileName ?? null}
              convertedIsArchive={convertedPdf?.isArchive === true}
              statusMessage={convertStatusMessage}
              busy={busy}
              onFilesSelected={handleConvertSelection}
              onConvert={() => void handleConvertFiles()}
              onDownload={handleDownloadConvertedPdf}
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
                onDeleteSelected={() => void handleDeleteSelected()}
                onApplyRotations={() => void handleApplyRotations()}
                onRepair={() => void handleRepair()}
                onLoadNew={() => loadInputRef.current?.click()}
                imageExportFormat={imageExportFormat}
                onImageExportFormatChange={setImageExportFormat}
                onExportImages={() => void handleExportImages()}
                onUndo={() => void handleUndo()}
                onRedo={() => void handleRedo()}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                busy={busy}
                locale={getPdfLocale()}
              />

              {busy ? <div className="loading-banner">{copy.status.loadingPdf}</div> : null}

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
              onDownload={() => trackAppEvent("export_download", { export_format: "pdf", file_count: 1 })}
              loadedPdf={loadedPdf}
            />
          )}
          <div className="loaded-pdf-drop-hint">{copy.status.mergeDropHint}</div>
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
