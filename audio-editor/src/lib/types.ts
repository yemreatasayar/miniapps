export type AudioFormat = "mp3" | "wav";

export type Tab = "cutter" | "normalizer" | "converter";

export type ProcessStatus =
  | { kind: "idle" }
  | { kind: "loading-ffmpeg"; progress: number }
  | { kind: "processing"; progress: number; label: string }
  | { kind: "success"; outputUrl: string; outputFileName: string; outputSize: number }
  | { kind: "error"; message: string };

export type LoadedAudio = {
  file: File;
  fileName: string;
  fileSize: number;
  duration: number;
  waveformData: Float32Array;
};

export type CutterSelection = {
  startSec: number;
  endSec: number;
};

export type NormalizeMode = "peak" | "loudness";

export type NormalizerSettings = {
  mode: NormalizeMode;
  targetDbFs: number;
  targetLufs: number;
};

export type ConverterSettings = {
  outputFormat: AudioFormat;
  mp3Bitrate: "128" | "192" | "320";
  wavBitDepth: "16" | "24";
};
