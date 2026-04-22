import { ImageAsset } from "./types";

const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.86;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Görsel yüklenemedi."));
    image.src = src;
  });
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

export async function optimizeImageFile(file: File): Promise<ImageAsset> {
  const originalDataUrl = await fileToDataUrl(file);
  const image = await loadImageElement(originalDataUrl);
  const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas bağlamı oluşturulamadı.");
  }

  ctx.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

  return {
    name: file.name,
    dataUrl,
    mimeType: "image/jpeg",
    width,
    height,
    createdAt: new Date().toISOString(),
  };
}

export async function publicAssetToDataUrl(assetUrl: string): Promise<string> {
  const response = await fetch(assetUrl);

  if (!response.ok) {
    throw new Error("Ortak görsel dosyası alınamadı.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImageElement(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas bağlamı oluşturulamadı.");
    }

    ctx.drawImage(image, 0, 0, image.width, image.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function createLinearGradientDataUrl(width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas bağlamı oluşturulamadı.");
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#0000ee");
  gradient.addColorStop(0.62, "#0000ee");
  gradient.addColorStop(1, "#230bad");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/png");
}
