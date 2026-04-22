export type LoadedTrack = {
  file: File;
  fileName: string;
  fileSize: number;
  duration: number;
  sampleRate: number;
  channels: number;
  waveform: number[];
  audioBuffer: AudioBuffer;
};

export type SplitResult = {
  vocalsBlob: Blob;
  instrumentalBlob: Blob;
  vocalsFileName: string;
  instrumentalFileName: string;
};

const AUDIO_ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"];
export const AUDIO_INPUT_ACCEPT = `audio/*,${AUDIO_ACCEPTED_EXTENSIONS.join(",")}`;

function getAudioContext(): AudioContext {
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) {
    throw new Error("Tarayıcı Web Audio API desteklemiyor.");
  }
  return new Context();
}

function getBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function clampSample(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function encodeWav(channelData: Float32Array[], sampleRate: number): Blob {
  const channelCount = channelData.length;
  const length = channelData[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + length * blockAlign);
  const view = new DataView(buffer);

  function writeString(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * blockAlign, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length * blockAlign, true);

  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = clampSample(channelData[channelIndex][sampleIndex]);
      const pcmValue = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, pcmValue, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function buildWaveform(buffer: AudioBuffer, pointCount = 72): number[] {
  const channel = buffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(channel.length / pointCount));
  const points: number[] = [];

  for (let bucketIndex = 0; bucketIndex < pointCount; bucketIndex += 1) {
    const start = bucketIndex * bucketSize;
    const end = Math.min(channel.length, start + bucketSize);
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(channel[sampleIndex]));
    }

    points.push(peak);
  }

  return points;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function loadTrack(file: File): Promise<LoadedTrack> {
  const context = getAudioContext();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));

    return {
      file,
      fileName: file.name,
      fileSize: file.size,
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      waveform: buildWaveform(decoded),
      audioBuffer: decoded,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Ses dosyası çözümlenemedi.");
  } finally {
    await context.close();
  }
}

export async function splitTrackCenterExtract(track: LoadedTrack): Promise<SplitResult> {
  const source = track.audioBuffer;
  const length = source.length;
  const left = source.getChannelData(0);
  const right = source.numberOfChannels > 1 ? source.getChannelData(1) : left;
  const vocalsLeft = new Float32Array(length);
  const vocalsRight = new Float32Array(length);
  const instrumentalLeft = new Float32Array(length);
  const instrumentalRight = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];
    const center = (l + r) * 0.5;
    const side = (l - r) * 0.5;

    vocalsLeft[index] = center;
    vocalsRight[index] = center;
    instrumentalLeft[index] = side;
    instrumentalRight[index] = -side;
  }

  const vocalsBlob = encodeWav([vocalsLeft, vocalsRight], source.sampleRate);
  const instrumentalBlob = encodeWav([instrumentalLeft, instrumentalRight], source.sampleRate);
  const baseName = getBaseName(track.fileName);

  return {
    vocalsBlob,
    instrumentalBlob,
    vocalsFileName: `${baseName}_vocals-preview.wav`,
    instrumentalFileName: `${baseName}_instrumental-preview.wav`,
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
