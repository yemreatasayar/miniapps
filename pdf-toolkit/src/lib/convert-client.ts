import { PDFDocument } from "pdf-lib";
import { getPdfLocale, pdfCopy } from "./i18n";
import { normalizePptxForLibreOffice } from "./pptx-normalize";

const PDF_HELPER_SERVER = "http://127.0.0.1:4184";
const OFFICE_HELPER_DISABLED = import.meta.env.VITE_MINIAPPS_DISABLE_PDF_HELPER === "true";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const OFFICE_EXTENSIONS = new Set([
  "doc",
  "docx",
  "odt",
  "rtf",
  "txt",
  "xls",
  "xlsx",
  "ods",
  "ppt",
  "pptx",
  "pps",
  "ppsx",
  "odp",
]);

const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 36;

function clientCopy() {
  return pdfCopy[getPdfLocale()].clientErrors;
}

export type ConvertHelperStatus = {
  helperDisabled: boolean;
  officeAvailable: boolean;
  version: string | null;
};

export type ConvertResult =
  | { ok: true; bytes: Uint8Array; fileName: string; sourceFormat: string }
  | { ok: false; message: string };

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function isSupportedImageFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  return IMAGE_EXTENSIONS.has(extension) || file.type.startsWith("image/");
}

export function isSupportedOfficeFile(file: File): boolean {
  return OFFICE_EXTENSIONS.has(getFileExtension(file.name));
}

export function supportedConvertAcceptValue(): string {
  return [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".doc",
    ".docx",
    ".odt",
    ".rtf",
    ".txt",
    ".xls",
    ".xlsx",
    ".ods",
    ".ppt",
    ".pptx",
    ".pps",
    ".ppsx",
    ".odp",
  ].join(",");
}

function normalizePdfFileName(fileName: string, fallback: string): string {
  const baseName = fileName.replace(/\.[^.]+$/i, "").trim();
  return `${baseName || fallback}.pdf`;
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(clientCopy().imagePrepare));
        return;
      }

      blob.arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, "image/png");
  });
}

async function decodeImageAsPng(file: File): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = imageUrl;

  try {
    await image.decode();
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(clientCopy().imageCanvas);
    context.drawImage(image, 0, 0);
    return { bytes: await canvasToPngBytes(canvas), width, height };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function fitImageToPage(imageWidth: number, imageHeight: number) {
  const isLandscape = imageWidth > imageHeight;
  const pageWidth = isLandscape ? A4_PORTRAIT.height : A4_PORTRAIT.width;
  const pageHeight = isLandscape ? A4_PORTRAIT.width : A4_PORTRAIT.height;
  const availableWidth = pageWidth - PAGE_MARGIN * 2;
  const availableHeight = pageHeight - PAGE_MARGIN * 2;
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    pageWidth,
    pageHeight,
    width,
    height,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
  };
}

export async function convertImagesToPdf(files: File[]): Promise<ConvertResult> {
  if (files.length === 0) {
    return { ok: false, message: clientCopy().noImage };
  }

  const doc = await PDFDocument.create();

  for (const file of files) {
    const extension = getFileExtension(file.name);
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const imageData =
      extension === "jpg" || extension === "jpeg"
        ? { bytes: originalBytes, kind: "jpg" as const }
        : extension === "png"
          ? { bytes: originalBytes, kind: "png" as const }
          : { ...(await decodeImageAsPng(file)), kind: "png" as const };

    const embedded =
      imageData.kind === "jpg"
        ? await doc.embedJpg(imageData.bytes)
        : await doc.embedPng(imageData.bytes);
    const { pageWidth, pageHeight, width, height, x, y } = fitImageToPage(embedded.width, embedded.height);
    const page = doc.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, { x, y, width, height });
  }

  const fileName =
    files.length === 1
      ? normalizePdfFileName(files[0]?.name || "", "gorsel")
      : "gorseller.pdf";

  return {
    ok: true,
    bytes: await doc.save({ useObjectStreams: false }),
    fileName,
    sourceFormat: files.length === 1 ? getFileExtension(files[0]?.name || "image") : "images",
  };
}

export async function checkConvertHelperStatus(): Promise<ConvertHelperStatus> {
  if (OFFICE_HELPER_DISABLED) {
    return { helperDisabled: true, officeAvailable: false, version: null };
  }

  try {
    const res = await fetch(`${PDF_HELPER_SERVER}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      return { helperDisabled: false, officeAvailable: false, version: null };
    }
    const data = (await res.json()) as { libreOffice?: boolean; libreOfficeVersion?: string | null };
    return {
      helperDisabled: false,
      officeAvailable: Boolean(data.libreOffice),
      version: data.libreOfficeVersion || null,
    };
  } catch {
    return { helperDisabled: false, officeAvailable: false, version: null };
  }
}

export async function convertOfficeToPdf(file: File): Promise<ConvertResult> {
  if (OFFICE_HELPER_DISABLED) {
    return { ok: false, message: clientCopy().helperDisabled };
  }

  try {
    let uploadFile = file;
    if (getFileExtension(file.name) === "pptx") {
      try {
        const normalization = await normalizePptxForLibreOffice(file);
        uploadFile = normalization.file;

        if (
          import.meta.env.DEV &&
          (normalization.changed || normalization.warnings.length > 0)
        ) {
          console.info("[pptx-normalize]", {
            changed: normalization.changed,
            warnings: normalization.warnings,
            stats: normalization.stats,
          });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[pptx-normalize] failed; using the original file.", {
            errorType: error instanceof Error ? error.name : typeof error,
          });
        }
      }
    }

    const formData = new FormData();
    formData.append("file", uploadFile, file.name);

    const res = await fetch(`${PDF_HELPER_SERVER}/convert`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      return { ok: false, message: (await res.text()) || clientCopy().serverError };
    }

    const resultBlob = await res.blob();
    return {
      ok: true,
      bytes: new Uint8Array(await resultBlob.arrayBuffer()),
      fileName: normalizePdfFileName(file.name, "donusturulen-belge"),
      sourceFormat: getFileExtension(file.name),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : clientCopy().convertFailed };
  }
}
