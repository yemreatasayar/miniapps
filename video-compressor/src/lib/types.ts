export type VideoFormat = "mp4" | "webm" | "mov" | "original";

export type ProcessStatus =
  | { kind: "idle" }
  | { kind: "loading-ffmpeg"; progress: number }
  | { kind: "processing"; progress: number; label: string }
  | { kind: "success"; outputUrl: string; outputFileName: string; outputSize: number }
  | { kind: "error"; message: string };

export type LoadedVideo = {
  file: File;
  fileName: string;
  fileSize: number;
  duration: number;
  previewUrl: string;
};

export type Segment = { id: string; start: number; end: number };

export type ProcessSettings = {
  outputFormat: VideoFormat;
  videoCrf: number;
  includeAudio: boolean;
  audioBitrate: "64" | "128" | "192";
  segments: Segment[];
};
