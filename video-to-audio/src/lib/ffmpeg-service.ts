import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { AudioSettings, CutterSelection, OutputFormat } from "./types";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
const FFMPEG_LOAD_TIMEOUT_MS = 90_000;

function ffmpegAssetUrl(fileName: string): string {
  return new URL(`${import.meta.env.BASE_URL}ffmpeg/${fileName}`, document.baseURI).href;
}

async function loadWithTimeout(ffmpeg: FFmpeg, coreURL: string, wasmURL: string): Promise<void> {
  // @ffmpeg/core is the single-thread build: it has no core worker and does
  // not require SharedArrayBuffer or cross-origin isolation.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Dönüştürme motoru yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin."));
    }, FFMPEG_LOAD_TIMEOUT_MS);
  });

  try {
    await Promise.race([ffmpeg.load({ coreURL, wasmURL }), timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export function terminateFFmpeg(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // zaten sonlandırılmış olabilir
    }
    ffmpegInstance = null;
  }
  loadPromise = null;
}

export async function loadFFmpeg(onProgress: (progress: number) => void): Promise<void> {
  // Zaten yüklü — hemen dön
  if (ffmpegInstance?.loaded) {
    onProgress(1);
    return;
  }

  // Başka bir yükleme devam ediyorsa onu iptal et, sıfırdan başla
  if (loadPromise) {
    terminateFFmpeg();
  }

  const ffmpeg = new FFmpeg();

  loadPromise = (async () => {
    broadcast(0.1);
    const coreURL = ffmpegAssetUrl("ffmpeg-core.js");
    const wasmURL = ffmpegAssetUrl("ffmpeg-core.wasm");
    broadcast(0.2);

    await loadWithTimeout(ffmpeg, coreURL, wasmURL);
    ffmpegInstance = ffmpeg;
  })();

  // progress callback'i bu tek işlem için tutuyoruz
  function broadcast(p: number) {
    onProgress(p);
  }

  try {
    await loadPromise;
    onProgress(1);
  } catch (error) {
    terminateFFmpeg();
    throw error;
  }

  loadPromise = null;
}

export function getFFmpeg(): FFmpeg {
  if (!ffmpegInstance?.loaded) {
    throw new Error("FFmpeg henüz yüklenmedi.");
  }
  return ffmpegInstance;
}

export async function extractAudio(
  file: File,
  settings: AudioSettings,
  selection: CutterSelection,
  totalDuration: number,
  onProgress: (progress: number) => void
): Promise<{ blob: Blob; fileName: string }> {
  const ffmpeg = getFFmpeg();
  const inputName = `input${getExtension(file.name)}`;
  const outputName = buildOutputName(file.name, settings.format);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress(Math.min(progress, 1));
  };
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec(buildArgs(inputName, outputName, settings, selection, totalDuration));
    const data = await ffmpeg.readFile(outputName);
    return {
      blob: new Blob([toBlobPart(data)], { type: getMimeType(settings.format) }),
      fileName: outputName,
    };
  } catch (error) {
    if (settings.format === "original") {
      throw new Error("Orijinal ses akışı çıkarılamadı. MP3 veya WAV seçin.");
    }
    throw error instanceof Error ? error : new Error("Ses çıkarma başarısız.");
  } finally {
    ffmpeg.off("progress", progressHandler);
    try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
  }
}

// ── yardımcılar ──────────────────────────────────────────────────────────────

async function fetchFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function toBlobPart(data: Uint8Array | string): BlobPart {
  if (typeof data === "string") return data;
  return data.slice().buffer as ArrayBuffer;
}

function buildArgs(
  input: string,
  output: string,
  settings: AudioSettings,
  selection: CutterSelection,
  totalDuration: number
): string[] {
  const selectionDuration = Math.max(0.1, selection.endSec - selection.startSec);
  const hasKnownDuration = totalDuration > 0 && selection.endSec > selection.startSec;
  const isTrimmed =
    hasKnownDuration &&
    (selection.startSec > 0.01 || selection.endSec < totalDuration - 0.05);
  const trimArgs = isTrimmed
    ? ["-ss", selection.startSec.toFixed(3), "-t", selectionDuration.toFixed(3)]
    : [];
  const base = ["-i", input, ...trimArgs, "-vn"];
  if (settings.format === "original") return [...base, "-acodec", "copy", output];
  if (settings.format === "wav") return [...base, "-acodec", "pcm_s16le", output];
  return [...base, "-acodec", "libmp3lame", "-b:a", `${settings.bitrate}k`, output];
}

function buildOutputName(inputName: string, format: OutputFormat): string {
  const base = inputName.replace(/\.[^.]+$/, "");
  if (format === "mp3") return `${base}.mp3`;
  if (format === "wav") return `${base}.wav`;
  return `${base}_audio.m4a`;
}

function getExtension(fileName: string): string {
  return fileName.match(/\.[^.]+$/)?.[0] ?? ".mp4";
}

function getMimeType(format: OutputFormat): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  return "audio/mp4";
}
