export async function decodeAudioFile(file: File): Promise<{
  waveformData: Float32Array;
  duration: number;
}> {
  if (typeof window === "undefined" || !window.AudioContext) {
    throw new Error("Web Audio API desteklenmiyor.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new window.AudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;
    const targetPoints = 800;
    const samplesPerPoint = Math.max(1, Math.floor(channelData.length / targetPoints));
    const waveformData = new Float32Array(targetPoints);

    for (let i = 0; i < targetPoints; i += 1) {
      const start = i * samplesPerPoint;
      const end = Math.min(channelData.length, start + samplesPerPoint);
      let max = 0;

      for (let j = start; j < end; j += 1) {
        const amplitude = Math.abs(channelData[j] ?? 0);
        if (amplitude > max) {
          max = amplitude;
        }
      }

      waveformData[i] = max;
    }

    return { waveformData, duration };
  } finally {
    await audioContext.close();
  }
}

export interface WaveformDrawOptions {
  data: Float32Array;
  startRatio: number;
  endRatio: number;
  playheadRatio: number;
  colorBase: string;
  colorSelected: string;
  colorPlayhead: string;
  bgColor: string;
}

export function drawWaveform(canvas: HTMLCanvasElement, options: WaveformDrawOptions): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;

  context.fillStyle = options.bgColor;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255,255,255,0.06)";
  context.fillRect(0, height / 2 - 1, width, 2);

  const mid = height / 2;

  for (let x = 0; x < width; x += 1) {
    const dataIndex = Math.floor((x / width) * options.data.length);
    const amplitude = options.data[dataIndex] ?? 0;
    const barHeight = Math.max(1, amplitude * (height / 2) * 0.9);
    const ratio = x / width;
    const inSelection = ratio >= options.startRatio && ratio <= options.endRatio;

    context.fillStyle = inSelection ? options.colorSelected : options.colorBase;
    context.fillRect(x, mid - barHeight, 1, barHeight * 2);
  }

  if (options.endRatio > options.startRatio) {
    const selectionX = options.startRatio * width;
    const selectionWidth = (options.endRatio - options.startRatio) * width;

    context.fillStyle = "rgba(124, 92, 255, 0.1)";
    context.fillRect(selectionX, 0, selectionWidth, height);

    context.fillStyle = "rgba(124, 92, 255, 0.9)";
    context.fillRect(selectionX, 0, 2, height);
    context.fillRect(selectionX + selectionWidth - 2, 0, 2, height);

    context.fillStyle = "#d7cfff";
    context.beginPath();
    context.arc(selectionX + 1, 10, 8, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.arc(selectionX + selectionWidth - 1, 10, 8, 0, Math.PI * 2);
    context.fill();
  }

  if (options.playheadRatio >= 0) {
    const playheadX = options.playheadRatio * width;
    context.fillStyle = options.colorPlayhead;
    context.fillRect(playheadX - 1, 0, 2, height);
    context.beginPath();
    context.moveTo(playheadX - 6, 0);
    context.lineTo(playheadX + 6, 0);
    context.lineTo(playheadX, 10);
    context.closePath();
    context.fill();
  }
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}
