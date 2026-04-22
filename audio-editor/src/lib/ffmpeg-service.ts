import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type {
  AudioFormat,
  ConverterSettings,
  CutterSelection,
  LoadedAudio,
  NormalizerSettings,
} from "./types";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

function ffmpegAssetUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}ffmpeg/${fileName}`;
}

export function terminateFFmpeg(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // ignore
    }
    ffmpegInstance = null;
  }
  loadPromise = null;
}

export async function loadFFmpeg(onProgress: (progress: number) => void): Promise<void> {
  if (ffmpegInstance?.loaded) {
    onProgress(1);
    return;
  }

  if (loadPromise) {
    terminateFFmpeg();
  }

  const ffmpeg = new FFmpeg();

  loadPromise = (async () => {
    onProgress(0.05);
    const coreURL = await toBlobURL(ffmpegAssetUrl("ffmpeg-core.js"), "text/javascript");
    onProgress(0.15);

    let workerURL: string | undefined;
    try {
      const response = await fetch(ffmpegAssetUrl("ffmpeg-core.worker.js"), { method: "HEAD" });
      if (response.ok) {
        workerURL = await toBlobURL(ffmpegAssetUrl("ffmpeg-core.worker.js"), "text/javascript");
      }
    } catch {
      // worker dosyasi bu paket surumunde olmayabilir
    }

    onProgress(0.2);
    const wasmURL = await toBlobURL(ffmpegAssetUrl("ffmpeg-core.wasm"), "application/wasm");
    onProgress(0.9);

    await ffmpeg.load({ coreURL, wasmURL, workerURL });
    ffmpegInstance = ffmpeg;
  })();

  try {
    await loadPromise;
    onProgress(1);
  } catch (error) {
    terminateFFmpeg();
    throw error;
  }

  loadPromise = null;
}

function getFFmpeg(): FFmpeg {
  if (!ffmpegInstance?.loaded) {
    throw new Error("FFmpeg henüz yüklenmedi.");
  }

  return ffmpegInstance;
}

async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function getExtension(fileName: string): string {
  return (fileName.match(/\.[^.]+$/)?.[0] ?? ".mp3").toLowerCase();
}

function toBlob(data: Uint8Array | string, mime: string): Blob {
  const part = typeof data === "string" ? data : (data.slice().buffer as ArrayBuffer);
  return new Blob([part], { type: mime });
}

function getMimeForAudio(file: File, format?: AudioFormat): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  if (file.type) return file.type;

  const extension = getExtension(file.name).replace(".", "");
  return extension ? `audio/${extension}` : "application/octet-stream";
}

function getCodecArgsForPreservedFormat(extension: string): string[] {
  if (extension === ".wav") return ["-acodec", "pcm_s16le"];
  if (extension === ".mp3") return ["-acodec", "libmp3lame", "-b:a", "192k"];
  return [];
}

export async function trimAudio(
  audio: LoadedAudio,
  selection: CutterSelection,
  onProgress: (progress: number) => void
): Promise<{ blob: Blob; fileName: string }> {
  const ffmpeg = getFFmpeg();
  const extension = getExtension(audio.fileName);
  const inputName = `input${extension}`;
  const outputName = `trimmed${extension}`;

  const progressHandler = ({ progress }: { progress: number }) => onProgress(Math.min(progress, 1));
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await readFileAsUint8Array(audio.file));
    await ffmpeg.exec([
      "-i",
      inputName,
      "-ss",
      String(selection.startSec),
      "-to",
      String(selection.endSec),
      "-c",
      "copy",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const baseName = audio.fileName.replace(/\.[^.]+$/, "");
    return {
      blob: toBlob(data as Uint8Array, getMimeForAudio(audio.file)),
      fileName: `${baseName}_trimmed${extension}`,
    };
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // ignore
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // ignore
    }
  }
}

export async function normalizeAudio(
  audio: LoadedAudio,
  settings: NormalizerSettings,
  onProgress: (progress: number) => void
): Promise<{ blob: Blob; fileName: string }> {
  const ffmpeg = getFFmpeg();
  const extension = getExtension(audio.fileName);
  const inputName = `input${extension}`;
  const outputName = `normalized${extension}`;

  const filterArg =
    settings.mode === "peak"
      ? `volume=${settings.targetDbFs}dB`
      : `loudnorm=I=${settings.targetLufs}:TP=-1.5:LRA=11`;

  const progressHandler = ({ progress }: { progress: number }) => onProgress(Math.min(progress, 1));
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await readFileAsUint8Array(audio.file));
    await ffmpeg.exec([
      "-i",
      inputName,
      "-filter:a",
      filterArg,
      ...getCodecArgsForPreservedFormat(extension),
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const baseName = audio.fileName.replace(/\.[^.]+$/, "");
    return {
      blob: toBlob(data as Uint8Array, getMimeForAudio(audio.file)),
      fileName: `${baseName}_normalized${extension}`,
    };
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // ignore
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // ignore
    }
  }
}

export async function convertAudio(
  audio: LoadedAudio,
  settings: ConverterSettings,
  onProgress: (progress: number) => void
): Promise<{ blob: Blob; fileName: string }> {
  const ffmpeg = getFFmpeg();
  const extension = getExtension(audio.fileName);
  const inputName = `input${extension}`;
  const outputExtension = `.${settings.outputFormat}`;
  const outputName = `converted${outputExtension}`;

  const codecArgs =
    settings.outputFormat === "mp3"
      ? ["-vn", "-acodec", "libmp3lame", "-b:a", `${settings.mp3Bitrate}k`]
      : ["-vn", "-acodec", settings.wavBitDepth === "24" ? "pcm_s24le" : "pcm_s16le"];

  const progressHandler = ({ progress }: { progress: number }) => onProgress(Math.min(progress, 1));
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await readFileAsUint8Array(audio.file));
    await ffmpeg.exec(["-i", inputName, ...codecArgs, outputName]);

    const data = await ffmpeg.readFile(outputName);
    const baseName = audio.fileName.replace(/\.[^.]+$/, "");
    return {
      blob: toBlob(data as Uint8Array, getMimeForAudio(audio.file, settings.outputFormat)),
      fileName: `${baseName}${outputExtension}`,
    };
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // ignore
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // ignore
    }
  }
}
