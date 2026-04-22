import { zipSync } from "fflate";
import type { LoadedImage, OutputFormat, ProcessOptions, ResizeSettings } from "./types";

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
  "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/heic,image/heif,.heic,.heif";

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

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

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
    reader.onerror = () => reject(new Error("Thumbnail data URL üretilemedi."));
    reader.readAsDataURL(blob);
  });
}

function getMimeType(format: OutputFormat): string {
  if (format === "jpg") return "image/jpeg";
  if (format === "png") return "image/png";
  return "image/webp";
}

function inferOutputFormat(file: File): OutputFormat {
  const type = file.type.toLowerCase();
  const extension = getFileExtension(file.name);
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (extension === "png") return "png";
  if (extension === "webp") return "webp";
  return "jpg";
}

function isHeicFile(file: File): boolean {
  return HEIC_IMAGE_TYPES.has(file.type.toLowerCase()) || HEIC_IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

function computeOutputSize(width: number, height: number, resize?: ResizeSettings): { width: number; height: number } {
  if (!resize || resize.mode === "off") {
    return { width, height };
  }

  if (resize.mode === "width") {
    const outputWidth = Math.max(1, resize.width);
    const outputHeight = Math.max(1, Math.round((height * outputWidth) / width));
    return { width: outputWidth, height: outputHeight };
  }

  const fitWidth = Math.max(1, resize.width);
  const fitHeight = Math.max(1, resize.height);
  const scale = Math.min(fitWidth / width, fitHeight / height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
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
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const images = decoder.decode(fileBytes);

  if (!images.length) {
    throw new Error("HEIC dosyasinda cozumlenebilir goruntu bulunamadi.");
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
          reject(new Error("HEIC piksel verisi olusturulamadi."));
          return;
        }
        resolve();
      });
    });

    context.putImageData(imageData, 0, 0);
    const convertedBlob = await canvasToBlob(canvas, "image/png");
    const convertedName = file.name.replace(/\.(heic|heif)$/i, ".png");
    return new File([convertedBlob], convertedName, { type: "image/png" });
  } finally {
    images.forEach((entry) => entry.free?.());
  }
}

async function convertHeicWithHeic2Any(file: File): Promise<File> {
  const heic2anyModule = (await import("heic2any")) as Heic2AnyModule;
  const heic2any = heic2anyModule.default as Heic2AnyConverter;
  const converted = await heic2any({
    blob: file,
    toType: "image/png",
  });
  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

  if (!(convertedBlob instanceof Blob)) {
    throw new Error("Donusturulen HEIC verisi okunamadi.");
  }

  const convertedName = file.name.replace(/\.(heic|heif)$/i, ".png");
  return new File([convertedBlob], convertedName, { type: "image/png" });
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
      const primaryMessage = normalizeErrorMessage(error, "Birinci HEIC decoder basarisiz oldu.");
      const fallbackMessage = normalizeErrorMessage(
        fallbackError,
        "Tarayici HEIC dosyasini acamadi ve yerel donusum basarisiz oldu."
      );
      throw new Error(`${file.name} donusturulemedi. ${primaryMessage} Yedek decoder: ${fallbackMessage}`);
    }
  }
}

function validateCanvasSize(width: number, height: number): void {
  if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION) {
    throw new Error("Görsel boyutu tarayıcı canvas limitini aşıyor.");
  }
}

export function isSupportedImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (SUPPORTED_IMAGE_TYPES.has(type)) return true;
  return SUPPORTED_IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

export async function loadImage(file: File): Promise<LoadedImage> {
  const browserReadableFile = await ensureBrowserReadableFile(file);
  const { image, objectUrl } = await loadImageElement(browserReadableFile);

  try {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const thumbnailScale = Math.min(1, MAX_THUMBNAIL_WIDTH / Math.max(width, 1));
    const thumbnailWidth = Math.max(1, Math.round(width * thumbnailScale));
    const thumbnailHeight = Math.max(1, Math.round(height * thumbnailScale));
    const { canvas, context } = createCanvas(thumbnailWidth, thumbnailHeight);

    context.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight);

    const thumbnailBlob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    const thumbnail = await blobToDataUrl(thumbnailBlob);
    const bpp = file.size / Math.max(width * height, 1);

    return {
      id: crypto.randomUUID(),
      file: browserReadableFile,
      fileName: file.name,
      preferredFormat: inferOutputFormat(file),
      width,
      height,
      fileSize: file.size,
      thumbnail,
      bpp,
      normalizedScore: 0,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function processImage(image: LoadedImage, options: ProcessOptions): Promise<Blob> {
  const { image: imageElement, objectUrl } = await loadImageElement(image.file);

  try {
    const naturalWidth = imageElement.naturalWidth;
    const naturalHeight = imageElement.naturalHeight;
    const output = computeOutputSize(naturalWidth, naturalHeight, options.resize);
    const rotation = options.rotation ?? 0;
    const flipH = options.flipH ?? false;
    const flipV = options.flipV ?? false;
    const isQuarterTurn = rotation === 90 || rotation === 270;
    const canvasWidth = isQuarterTurn ? output.height : output.width;
    const canvasHeight = isQuarterTurn ? output.width : output.height;

    validateCanvasSize(canvasWidth, canvasHeight);

    const { canvas, context } = createCanvas(canvasWidth, canvasHeight);

    if (options.format === "jpg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    context.save();
    context.translate(canvasWidth / 2, canvasHeight / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    context.drawImage(imageElement, -output.width / 2, -output.height / 2, output.width, output.height);
    context.restore();

    return await canvasToBlob(canvas, getMimeType(options.format), options.quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadAll(entries: Array<{ blob: Blob; fileName: string }>): Promise<void> {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    downloadBlob(entry.blob, entry.fileName);
    if (index < entries.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }
}

export function getOriginalFormat(image: LoadedImage): OutputFormat {
  return image.preferredFormat;
}

export async function downloadAsZip(
  entries: Array<{ blob: Blob; fileName: string }>,
  zipName: string
): Promise<void> {
  const files: Record<string, Uint8Array> = {};

  // Aynı isimli dosyalar için sayaç
  const seen = new Map<string, number>();

  for (const entry of entries) {
    const base = entry.fileName.replace(/(\.[^.]+)$/, "");
    const ext = entry.fileName.match(/\.[^.]+$/)?.[0] ?? "";
    const count = seen.get(entry.fileName) ?? 0;
    const finalName = count === 0 ? entry.fileName : `${base}-${count}${ext}`;
    seen.set(entry.fileName, count + 1);

    files[finalName] = new Uint8Array(await entry.blob.arrayBuffer());
  }

  const zipped = zipSync(files, { level: 0 }); // level 0: zaten sıkıştırılmış görseller
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
  downloadBlob(blob, zipName);
}
