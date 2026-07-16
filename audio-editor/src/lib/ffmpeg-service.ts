import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type {
  AudioFormat,
  AudioProcessingSettings,
  ConverterSettings,
  CutterSelection,
  LoadedAudio,
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

function getCodecArgsForOutput(settings: ConverterSettings): string[] {
  return settings.outputFormat === "mp3"
    ? ["-vn", "-acodec", "libmp3lame", "-b:a", `${settings.mp3Bitrate}k`]
    : ["-vn", "-acodec", settings.wavBitDepth === "24" ? "pcm_s24le" : "pcm_s16le"];
}

export async function processAudio(
  audio: LoadedAudio,
  selection: CutterSelection,
  settings: AudioProcessingSettings,
  onProgress: (progress: number) => void
): Promise<{ blob: Blob; fileName: string }> {
  const ffmpeg = getFFmpeg();
  const inputExtension = getExtension(audio.fileName);
  const outputExtension = `.${settings.converter.outputFormat}`;
  const inputName = `input${inputExtension}`;
  const outputName = `edited${outputExtension}`;
  const selectionDuration = Math.max(0.1, selection.endSec - selection.startSec);
  const hasTrim = selection.startSec > 0.05 || selection.endSec < audio.duration - 0.05;

  const trimArgs = hasTrim
    ? ["-ss", String(selection.startSec), "-t", String(selectionDuration)]
    : [];
  const normalizeArgs = settings.normalizationEnabled
    ? [
        "-filter:a",
        settings.normalizer.mode === "peak"
          ? `volume=${settings.normalizer.targetDbFs}dB`
          : `loudnorm=I=${settings.normalizer.targetLufs}:TP=-1.5:LRA=11`,
      ]
    : [];
  const normalizedWavSampleRateArgs =
    settings.normalizationEnabled &&
    settings.normalizer.mode === "loudness" &&
    settings.converter.outputFormat === "wav"
      ? ["-ar", "48000"]
      : [];

  const progressHandler = ({ progress }: { progress: number }) => onProgress(Math.min(progress, 1));
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await readFileAsUint8Array(audio.file));
    await ffmpeg.exec([
      "-y",
      "-i",
      inputName,
      ...trimArgs,
      ...normalizeArgs,
      ...getCodecArgsForOutput(settings.converter),
      ...normalizedWavSampleRateArgs,
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const baseName = audio.fileName.replace(/\.[^.]+$/, "");
    return {
      blob: toBlob(data as Uint8Array, getMimeForAudio(audio.file, settings.converter.outputFormat)),
      fileName: `${baseName}_edited${outputExtension}`,
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
