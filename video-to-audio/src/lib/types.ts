export type OutputFormat = "mp3" | "wav" | "original";

export type Mp3Bitrate = "128" | "192" | "320";

export type AudioSettings = {
  format: OutputFormat;
  bitrate: Mp3Bitrate;
};

export type ProcessStatus =
  | { kind: "idle" }
  | { kind: "loading-ffmpeg"; progress: number }
  | { kind: "processing"; progress: number; timeRemaining?: string }
  | { kind: "success"; outputUrl: string; outputFileName: string; outputSize: number }
  | { kind: "error"; message: string };

export type LoadedVideo = {
  file: File;
  fileName: string;
  fileSize: number;
};
