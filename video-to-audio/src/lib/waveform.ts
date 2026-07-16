const WAVEFORM_POINTS = 800;
const MAX_BROWSER_DECODE_BYTES = 100 * 1024 * 1024;
const MAX_BROWSER_DECODE_DURATION = 10 * 60;

export type VideoWaveform = {
  duration: number;
  waveformData: Float32Array;
  waveformAvailable: boolean;
};

function buildWaveform(channelData: Float32Array): Float32Array {
  const waveformData = new Float32Array(WAVEFORM_POINTS);
  const samplesPerPoint = Math.max(1, Math.floor(channelData.length / WAVEFORM_POINTS));

  for (let index = 0; index < WAVEFORM_POINTS; index += 1) {
    const start = index * samplesPerPoint;
    const end = Math.min(channelData.length, start + samplesPerPoint);
    let max = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      max = Math.max(max, Math.abs(channelData[sampleIndex] ?? 0));
    }

    waveformData[index] = max;
  }

  return waveformData;
}

function buildFallbackWaveform(): Float32Array {
  return new Float32Array(WAVEFORM_POINTS).fill(0.08);
}

function readMediaDuration(previewUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const media = document.createElement("video");
    media.preload = "metadata";

    const cleanup = () => {
      media.removeAttribute("src");
      media.load();
    };

    media.addEventListener(
      "loadedmetadata",
      () => {
        const duration = media.duration;
        cleanup();
        if (Number.isFinite(duration) && duration > 0) {
          resolve(duration);
        } else {
          reject(new Error("Video süresi okunamadı."));
        }
      },
      { once: true }
    );
    media.addEventListener(
      "error",
      () => {
        cleanup();
        reject(new Error("Video önizlemesi hazırlanamadı."));
      },
      { once: true }
    );
    media.src = previewUrl;
  });
}

export async function decodeVideoWaveform(file: File, previewUrl: string): Promise<VideoWaveform> {
  const duration = await readMediaDuration(previewUrl).catch(() => Number.NaN);

  if (!Number.isFinite(duration)) {
    return { duration: 0, waveformData: buildFallbackWaveform(), waveformAvailable: false };
  }

  if (
    typeof window.AudioContext !== "function" ||
    file.size > MAX_BROWSER_DECODE_BYTES ||
    duration > MAX_BROWSER_DECODE_DURATION
  ) {
    return { duration, waveformData: buildFallbackWaveform(), waveformAvailable: false };
  }

  const audioContext = new window.AudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    return {
      duration: audioBuffer.duration,
      waveformData: buildWaveform(audioBuffer.getChannelData(0)),
      waveformAvailable: true,
    };
  } catch {
    return { duration, waveformData: buildFallbackWaveform(), waveformAvailable: false };
  } finally {
    await audioContext.close();
  }
}

export interface WaveformDrawOptions {
  data: Float32Array;
  startRatio: number;
  endRatio: number;
  playheadRatio: number;
  activeTarget: "start" | "end" | "playhead";
}

export function drawWaveform(canvas: HTMLCanvasElement, options: WaveformDrawOptions): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = canvas;
  const mid = height / 2;
  context.fillStyle = "#0b2d24";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255, 255, 255, 0.07)";
  context.fillRect(0, mid - 1, width, 2);

  for (let x = 0; x < width; x += 1) {
    const ratio = x / width;
    const dataIndex = Math.floor(ratio * options.data.length);
    const amplitude = options.data[dataIndex] ?? 0;
    const barHeight = Math.max(1, amplitude * mid * 0.9);
    const inSelection = ratio >= options.startRatio && ratio <= options.endRatio;
    context.fillStyle = inSelection ? "#20c997" : "#507d70";
    context.fillRect(x, mid - barHeight, 1, barHeight * 2);
  }

  const selectionX = options.startRatio * width;
  const selectionWidth = Math.max(0, (options.endRatio - options.startRatio) * width);
  context.fillStyle = "rgba(0, 166, 109, 0.12)";
  context.fillRect(selectionX, 0, selectionWidth, height);
  context.fillStyle = "rgba(80, 225, 176, 0.92)";
  context.fillRect(selectionX, 0, 2, height);
  context.fillRect(selectionX + selectionWidth - 2, 0, 2, height);

  context.fillStyle = options.activeTarget === "start" ? "#ffffff" : "#bdebdc";
  context.beginPath();
  context.arc(selectionX + 1, 10, options.activeTarget === "start" ? 10 : 8, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = options.activeTarget === "end" ? "#ffffff" : "#bdebdc";
  context.beginPath();
  context.arc(
    selectionX + selectionWidth - 1,
    10,
    options.activeTarget === "end" ? 10 : 8,
    0,
    Math.PI * 2
  );
  context.fill();

  if (options.playheadRatio >= 0) {
    const playheadX = options.playheadRatio * width;
    context.fillStyle = "#ffffff";
    const playheadWidth = options.activeTarget === "playhead" ? 3 : 2;
    context.fillRect(playheadX - playheadWidth / 2, 0, playheadWidth, height);
    context.beginPath();
    context.moveTo(playheadX - 6, 0);
    context.lineTo(playheadX + 6, 0);
    context.lineTo(playheadX, 10);
    context.closePath();
    context.fill();
  }
}

export function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const tenths = Math.floor((safeSeconds % 1) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
}
