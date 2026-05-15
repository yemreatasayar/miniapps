import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type { LoadedVideo, ProcessSettings, Segment, VideoFormat } from "./types";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
const NATIVE_HELPER_URL = "http://127.0.0.1:4186";

export class NativeHelperUnavailableError extends Error {
  constructor() {
    super("Native video helper unavailable.");
    this.name = "NativeHelperUnavailableError";
  }
}

function ffmpegAssetUrl(f: string) {
  return `${import.meta.env.BASE_URL}ffmpeg/${f}`;
}

export function terminateFFmpeg(): void {
  if (ffmpegInstance) {
    try { ffmpegInstance.terminate(); } catch { /* */ }
    ffmpegInstance = null;
  }
  loadPromise = null;
}

export async function loadFFmpeg(onProgress: (p: number) => void): Promise<void> {
  if (ffmpegInstance?.loaded) { onProgress(1); return; }
  if (loadPromise) terminateFFmpeg();

  const ffmpeg = new FFmpeg();
  loadPromise = (async () => {
    onProgress(0.05);
    const coreURL = await toBlobURL(ffmpegAssetUrl("ffmpeg-core.js"), "text/javascript");
    onProgress(0.15);
    let workerURL: string | undefined;
    try {
      const r = await fetch(ffmpegAssetUrl("ffmpeg-core.worker.js"), { method: "HEAD" });
      if (r.ok) workerURL = await toBlobURL(ffmpegAssetUrl("ffmpeg-core.worker.js"), "text/javascript");
    } catch { /* optional */ }
    onProgress(0.2);
    const wasmURL = await toBlobURL(ffmpegAssetUrl("ffmpeg-core.wasm"), "application/wasm");
    onProgress(0.9);
    await ffmpeg.load({ coreURL, wasmURL, workerURL });
    ffmpegInstance = ffmpeg;
  })();

  try { await loadPromise; onProgress(1); }
  catch (err) { terminateFFmpeg(); throw err; }
  loadPromise = null;
}

function getFFmpeg() {
  if (!ffmpegInstance?.loaded) throw new Error("FFmpeg henüz yüklenmedi.");
  return ffmpegInstance;
}

async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function ext(fileName: string): string {
  return (fileName.match(/\.[^.]+$/)?.[0] ?? ".mp4").toLowerCase();
}

function effectiveFormat(format: VideoFormat, inExt: string): Exclude<VideoFormat, "original"> {
  if (format !== "original") return format;
  if (inExt === ".webm") return "webm";
  if (inExt === ".mov") return "mov";
  return "mp4";
}

function outputExt(format: VideoFormat, inputFile: string): string {
  return `.${effectiveFormat(format, ext(inputFile))}`;
}

function mime(e: string): string {
  if (e === ".mp4") return "video/mp4";
  if (e === ".webm") return "video/webm";
  if (e === ".mov") return "video/quicktime";
  return "video/mp4";
}

function toBlob(data: Uint8Array, m: string) {
  return new Blob([data.slice().buffer as ArrayBuffer], { type: m });
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeHeaderValue(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeFileName(fileName: string): string {
  return bytesToBase64Url(new TextEncoder().encode(fileName));
}

function decodeFileNameHeader(value: string | null, fallback: string): string {
  if (!value) return fallback;

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return decodeURIComponent(new TextDecoder().decode(bytes));
  } catch {
    try {
      return decodeURIComponent(value);
    } catch {
      return fallback;
    }
  }
}

function toText(data: Uint8Array | string): string {
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

type LogEntry = {
  message: string;
  type: string;
};

function isIgnorableLogLine(line: string): boolean {
  if (!line.trim()) return true;
  if (/^ffmpeg version\b/i.test(line)) return true;
  if (/^configuration:/i.test(line)) return true;
  if (/^lib(av|sw|post)/i.test(line)) return true;
  if (/^frame=\s*\d+/i.test(line)) return true;
  if (/^size=\s*\d+/i.test(line)) return true;
  if (/^metadata:$/i.test(line)) return true;
  if (/^\s*(encoder|handler_name|major_brand|minor_version|compatible_brands|vendor_id|creation_time|language)\s*:/i.test(line)) return true;
  if (/^(input|output) #/i.test(line)) return true;
  if (/^stream #/i.test(line)) return true;
  if (/^stream mapping:/i.test(line)) return true;
  if (/^duration:/i.test(line)) return true;
  if (/^press \[q\]/i.test(line)) return true;
  if (/^side data:/i.test(line)) return true;
  if (/^cpb:\s/i.test(line)) return true;
  if (/^\[[^\]]+\]\s+using cpu capabilities:/i.test(line)) return true;
  if (/^\[(libx264|aac|libopus|libvpx-vp9) @/i.test(line)) return true;
  if (/^video:/i.test(line)) return true;
  if (/^audio:/i.test(line)) return true;
  return false;
}

function isActionableLogLine(line: string): boolean {
  return /(error|failed|failure|invalid|unsupported|unable|could not|cannot|not found|no such|missing|unknown|nothing was written|conversion failed|incorrect|denied|unrecognized|malformed|muxer does not support|not permitted)/i.test(line);
}

function isWasmMemoryError(message: string): boolean {
  return /(memory access out of bounds|out of memory|cannot enlarge memory|allocation failed)/i.test(message);
}

function memoryErrorMessage(): string {
  return "Tarayıcı belleği bu render için yetmedi. Yerel video helper çalışıyorsa aynı işlem native FFmpeg ile tamamlanabilir.";
}

function pickRelevantLogLine(entries: LogEntry[]): string | undefined {
  const prioritized = [...entries].reverse().find((entry) => {
    return entry.type === "stderr" && !isIgnorableLogLine(entry.message) && isActionableLogLine(entry.message);
  });
  if (prioritized) return prioritized.message;

  const actionable = [...entries].reverse().find((entry) => {
    return !isIgnorableLogLine(entry.message) && isActionableLogLine(entry.message);
  });
  if (actionable) return actionable.message;
}

function vCodec(format: VideoFormat, inExt: string, crf: number): string[] {
  const eff = effectiveFormat(format, inExt);
  if (eff === "webm") return ["-vcodec", "libvpx-vp9", "-crf", String(crf), "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-threads", "2"];
  // ultrafast preset for significantly faster renders
  return ["-vcodec", "libx264", "-crf", String(crf), "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p"];
}

function aCodec(format: VideoFormat, inExt: string, include: boolean, bitrate: string): string[] {
  if (!include) return ["-an"];
  const eff = effectiveFormat(format, inExt);
  if (eff === "webm") return ["-acodec", "libopus", "-b:a", `${bitrate}k`];
  return ["-acodec", "aac", "-b:a", `${bitrate}k`];
}

function containerArgs(format: VideoFormat, inExt: string): string[] {
  return effectiveFormat(format, inExt) === "mp4" ? ["-movflags", "+faststart"] : [];
}

function segmentInputArgs(inputName: string, seg: Segment): string[] {
  return ["-ss", String(seg.start), "-t", String(Math.max(seg.end - seg.start, 0.1)), "-i", inputName];
}

function segmentOutputArgs(): string[] {
  return ["-avoid_negative_ts", "make_zero"];
}

async function run(ffmpeg: FFmpeg, args: string[]): Promise<void> {
  const logs: LogEntry[] = [];
  const onLog = ({ message, type }: { message: string; type: string }) => {
    const line = message.trim();
    if (!line) return;
    logs.push({ message: line, type });
    if (logs.length > 80) logs.shift();
  };

  ffmpeg.on("log", onLog);
  try {
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      const detail = pickRelevantLogLine(logs);
      throw new Error(
        detail
          ? `FFmpeg işlem hatası: ${detail}`
          : `FFmpeg işlem hatası (kod: ${code}). Format veya codec desteklenmiyor olabilir.`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      if (isWasmMemoryError(error.message)) {
        terminateFFmpeg();
        throw new Error(memoryErrorMessage());
      }

      const detail = pickRelevantLogLine(logs);
      if (detail && isWasmMemoryError(detail)) {
        terminateFFmpeg();
        throw new Error(memoryErrorMessage());
      }

      throw new Error(detail ? `FFmpeg işlem hatası: ${detail}` : error.message);
    }

    const detail = pickRelevantLogLine(logs);
    throw new Error(detail ?? `FFmpeg işlem hatası: ${String(error)}`);
  } finally {
    ffmpeg.off("log", onLog);
  }
}

async function hasAudioStream(ffmpeg: FFmpeg, inputName: string): Promise<boolean> {
  const probeOutput = "vc_probe_audio.txt";

  try {
    const code = await ffmpeg.ffprobe([
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=index",
      "-of", "csv=p=0",
      inputName,
      "-o", probeOutput,
    ]);

    if (code !== 0) return true;

    const data = await ffmpeg.readFile(probeOutput);
    return toText(data as Uint8Array | string).trim().length > 0;
  } catch {
    return true;
  } finally {
    try { await ffmpeg.deleteFile(probeOutput); } catch { /* */ }
  }
}

export async function isNativeVideoHelperAvailable(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`${NATIVE_HELPER_URL}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return false;

    const data = await response.json() as { ok?: unknown; ffmpeg?: unknown };
    return data.ok === true && data.ffmpeg === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function processVideoWithNativeHelper(
  video: LoadedVideo,
  settings: ProcessSettings,
  onProgress: (p: number) => void
): Promise<{ blob: Blob; fileName: string }> {
  const helperAvailable = await isNativeVideoHelperAvailable();
  if (!helperAvailable) {
    throw new NativeHelperUnavailableError();
  }

  onProgress(0.08);
  let heartbeatProgress = 0.08;
  const heartbeat = window.setInterval(() => {
    heartbeatProgress = Math.min(0.92, heartbeatProgress + Math.max(0.004, (0.92 - heartbeatProgress) * 0.08));
    onProgress(heartbeatProgress);
  }, 1200);

  try {
    const response = await fetch(`${NATIVE_HELPER_URL}/api/process`, {
      method: "POST",
      headers: {
        "Content-Type": video.file.type || "application/octet-stream",
        "X-Miniapps-Settings": encodeHeaderValue(settings),
        "X-Miniapps-File-Name": encodeFileName(video.fileName),
      },
      body: video.file,
    });
    onProgress(0.95);

    if (!response.ok) {
      let message = "Native FFmpeg işlemi başarısız.";
      try {
        const data = await response.json() as { message?: unknown };
        if (typeof data.message === "string" && data.message.trim()) {
          message = data.message;
        }
      } catch {
        // ignore non-JSON errors
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    onProgress(1);
    return {
      blob,
      fileName: decodeFileNameHeader(response.headers.get("X-Miniapps-Output-File-Name"), `${video.fileName.replace(/\.[^.]+$/, "")}_processed.mp4`),
    };
  } finally {
    window.clearInterval(heartbeat);
  }
}


async function del(ffmpeg: FFmpeg, names: string[]): Promise<void> {
  for (const n of names) try { await ffmpeg.deleteFile(n); } catch { /* */ }
}

function isFullVideo(segs: Segment[], dur: number): boolean {
  return segs.length === 1 && segs[0].start <= 0.05 && segs[0].end >= dur - 0.05;
}

export async function processVideo(
  video: LoadedVideo,
  settings: ProcessSettings,
  onProgress: (p: number) => void
): Promise<{ blob: Blob; fileName: string }> {
  const ffmpeg = getFFmpeg();

  const inExt = ext(video.fileName);
  const outExt = outputExt(settings.outputFormat, video.fileName);
  const outMime = mime(outExt);
  const baseName = video.fileName.replace(/\.[^.]+$/, "");

  const validSegs = [...settings.segments]
    .filter(s => s.end - s.start > 0.1)
    .sort((a, b) => a.start - b.start);

  if (validSegs.length === 0) throw new Error("Geçerli segment bulunamadı.");

  const vc = vCodec(settings.outputFormat, inExt, settings.videoCrf);
  const container = containerArgs(settings.outputFormat, inExt);

  const inputName = "vc_in" + inExt;
  const toClean: string[] = [inputName];

  let stepBase = 0;
  let stepRange = 1;
  const onProg = ({ progress }: { progress: number }) => {
    onProgress(stepBase + Math.min(Math.max(progress, 0), 1) * stepRange);
  };
  ffmpeg.on("progress", onProg);

  try {
    await ffmpeg.writeFile(inputName, await readBytes(video.file));
    const shouldIncludeAudio = settings.includeAudio && await hasAudioStream(ffmpeg, inputName);
    const ac = aCodec(settings.outputFormat, inExt, shouldIncludeAudio, settings.audioBitrate);

    // ── Full video (no cuts): single encode pass ──────────────────────────
    if (isFullVideo(validSegs, video.duration)) {
      const out = "vc_out" + outExt;
      toClean.push(out);
      stepBase = 0; stepRange = 1;
      await run(ffmpeg, ["-filter_threads", "1", "-i", inputName, ...vc, ...ac, ...container, out]);
      const data = await ffmpeg.readFile(out) as Uint8Array;
      return { blob: toBlob(data, outMime), fileName: `${baseName}_compressed${outExt}` };
    }

    // ── Single segment (trim only) ────────────────────────────────────────
    if (validSegs.length === 1) {
      const out = "vc_out" + outExt;
      toClean.push(out);
      const seg = validSegs[0];
      stepBase = 0; stepRange = 1;
      await run(ffmpeg, ["-filter_threads", "1", ...segmentInputArgs(inputName, seg), ...vc, ...ac, ...segmentOutputArgs(), ...container, out]);
      const data = await ffmpeg.readFile(out) as Uint8Array;
      return { blob: toBlob(data, outMime), fileName: `${baseName}_cut${outExt}` };
    }

    // ── Multiple segments: encode each separately, then concat ───────────
    // filter_complex holds all streams in WASM memory simultaneously and
    // causes "memory access out of bounds" on large videos. Encoding each
    // segment one at a time keeps peak memory bounded.
    const partNames: string[] = [];
    const n = validSegs.length;
    const encRange = 0.85;

    for (let i = 0; i < n; i++) {
      const seg = validSegs[i];
      const part = `vc_p${i}${outExt}`;
      partNames.push(part);
      toClean.push(part);
      stepBase = (i / n) * encRange;
      stepRange = (1 / n) * encRange;
      await run(ffmpeg, ["-filter_threads", "1", ...segmentInputArgs(inputName, seg), ...vc, ...ac, ...segmentOutputArgs(), part]);
    }

    const concatTxt = "vc_concat.txt";
    const out = "vc_out" + outExt;
    toClean.push(concatTxt, out);
    await ffmpeg.writeFile(concatTxt, new TextEncoder().encode(partNames.map(p => `file '${p}'`).join("\n") + "\n"));

    stepBase = encRange; stepRange = 1 - encRange;
    await run(ffmpeg, ["-fflags", "+genpts", "-f", "concat", "-safe", "0", "-i", concatTxt, "-c", "copy", ...container, out]);

    const data = await ffmpeg.readFile(out) as Uint8Array;
    return { blob: toBlob(data, outMime), fileName: `${baseName}_cut${outExt}` };

  } finally {
    ffmpeg.off("progress", onProg);
    await del(ffmpeg, toClean);
  }
}
