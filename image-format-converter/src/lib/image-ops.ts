import { zipSync } from "fflate";
import type { ConvertibleImage, CropSettings, OutputFormat } from "./types";

const MAX_THUMBNAIL_WIDTH = 640;
const MAX_CANVAS_DIMENSION = 16_384;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/heic",
  "image/heif",
]);
const HEIC_IMAGE_TYPES = new Set(["image/heic", "image/heif"]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"]);
const HEIC_IMAGE_EXTENSIONS = new Set(["heic", "heif"]);

export const IMAGE_INPUT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif";

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
type Heic2AnyModule = typeof import("heic2any");
type Heic2AnyConverter = Heic2AnyModule["default"];
type LibheifModule = {
  HeifDecoder: new () => {
    decode: (data: Uint8Array) => Array<{
      get_width: () => number;
      get_height: () => number;
      display: (imageData: ImageData, callback: (displayData: ImageData | null) => void) => void;
      free?: () => void;
    }>;
  };
};

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function getBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function createCanvas(width: number, height: number): { canvas: CanvasLike; context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context alınamadı.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    return { canvas, context };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context alınamadı.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

function canvasToBlob(canvas: CanvasLike, mimeType: string, quality?: number): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Görsel blob oluşturulamadı."));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Thumbnail oluşturulamadı."));
    reader.readAsDataURL(blob);
  });
}

function getMimeType(format: OutputFormat): string {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return "image/jpeg";
}

function isHeicFile(file: File): boolean {
  return HEIC_IMAGE_TYPES.has(file.type.toLowerCase()) || HEIC_IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

function validateCanvasSize(width: number, height: number): void {
  if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION) {
    throw new Error("Görsel boyutu tarayıcı canvas limitini aşıyor.");
  }
}

async function loadImageElement(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error(`${file.name} yüklenemedi.`));
      nextImage.src = objectUrl;
    });

    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function canLoadImageFile(file: File): Promise<boolean> {
  try {
    const { objectUrl } = await loadImageElement(file);
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    return false;
  }
}

async function convertHeicWithLibheif(file: File): Promise<File> {
  const libheifModule = (await import("libheif-js/wasm-bundle")) as unknown as { default?: LibheifModule } & LibheifModule;
  const libheif = libheifModule.default ?? libheifModule;
  const decoder = new libheif.HeifDecoder();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const images = decoder.decode(bytes);

  if (!images.length) {
    throw new Error("HEIC dosyasında çözümlenebilir görüntü bulunamadı.");
  }

  const image = images[0];

  try {
    const width = image.get_width();
    const height = image.get_height();
    validateCanvasSize(width, height);

    const { canvas, context } = createCanvas(width, height);
    const imageData = new ImageData(width, height);

    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (displayData) => {
        if (!displayData) {
          reject(new Error("HEIC piksel verisi oluşturulamadı."));
          return;
        }
        resolve();
      });
    });

    context.putImageData(imageData, 0, 0);
    const convertedBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    return new File([convertedBlob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  } finally {
    images.forEach((entry) => entry.free?.());
  }
}

async function convertHeicWithHeic2Any(file: File): Promise<File> {
  const heic2anyModule = (await import("heic2any")) as Heic2AnyModule;
  const heic2any = heic2anyModule.default as Heic2AnyConverter;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
  });
  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

  if (!(convertedBlob instanceof Blob)) {
    throw new Error("Dönüştürülen HEIC verisi okunamadı.");
  }

  return new File([convertedBlob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
}

async function ensureBrowserReadableFile(file: File): Promise<File> {
  if (!isHeicFile(file)) {
    return file;
  }

  if (await canLoadImageFile(file)) {
    return file;
  }

  try {
    return await convertHeicWithLibheif(file);
  } catch (error) {
    try {
      return await convertHeicWithHeic2Any(file);
    } catch (fallbackError) {
      const primaryMessage = normalizeErrorMessage(error, "Birinci HEIC decoder başarısız oldu.");
      const fallbackMessage = normalizeErrorMessage(
        fallbackError,
        "Tarayıcı HEIC dosyasını açamadı ve yerel dönüşüm başarısız oldu."
      );
      throw new Error(`${file.name} dönüştürülemedi. ${primaryMessage} Yedek decoder: ${fallbackMessage}`);
    }
  }
}

export function isSupportedImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (SUPPORTED_IMAGE_TYPES.has(type)) return true;
  return SUPPORTED_IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

export async function loadConvertibleImage(file: File): Promise<ConvertibleImage> {
  const workingFile = await ensureBrowserReadableFile(file);
  const { image, objectUrl } = await loadImageElement(workingFile);

  try {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const scale = Math.min(1, MAX_THUMBNAIL_WIDTH / Math.max(width, 1));
    const thumbnailWidth = Math.max(1, Math.round(width * scale));
    const thumbnailHeight = Math.max(1, Math.round(height * scale));
    const { canvas, context } = createCanvas(thumbnailWidth, thumbnailHeight);
    context.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight);
    const thumbnailBlob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    const thumbnail = await blobToDataUrl(thumbnailBlob);

    return {
      id: crypto.randomUUID(),
      sourceFile: file,
      workingFile,
      fileName: file.name,
      width,
      height,
      fileSize: file.size,
      thumbnail,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function convertImage(image: ConvertibleImage, format: OutputFormat, crop?: CropSettings): Promise<Blob> {
  const { image: imageElement, objectUrl } = await loadImageElement(image.workingFile);

  try {
    const naturalWidth = imageElement.naturalWidth;
    const naturalHeight = imageElement.naturalHeight;
    const cropEnabled = crop?.enabled && (crop.width ?? 0) > 0 && (crop.height ?? 0) > 0;
    const srcX = cropEnabled ? Math.max(0, crop!.x) : 0;
    const srcY = cropEnabled ? Math.max(0, crop!.y) : 0;
    const srcW = cropEnabled ? Math.min(crop!.width, naturalWidth - srcX) : naturalWidth;
    const srcH = cropEnabled ? Math.min(crop!.height, naturalHeight - srcY) : naturalHeight;

    validateCanvasSize(srcW, srcH);
    const { canvas, context } = createCanvas(srcW, srcH);

    if (format === "jpg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, srcW, srcH);
    }

    context.drawImage(imageElement, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    return await canvasToBlob(canvas, getMimeType(format), format === "jpg" ? 0.92 : undefined);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function buildOutputFileName(image: ConvertibleImage, format: OutputFormat): string {
  const extension = format === "jpg" ? "jpg" : format;
  return `${getBaseName(image.fileName)}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadAsZip(entries: Array<{ blob: Blob; fileName: string }>, zipName: string): Promise<void> {
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
