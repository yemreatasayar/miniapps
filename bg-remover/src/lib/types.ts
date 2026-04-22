export type ProcessStatus =
  | { kind: "idle" }
  | { kind: "processing"; stage: string; progress: number }
  | { kind: "success"; outputUrl: string; outputSize: number }
  | { kind: "error"; message: string };

export type LoadedImage = {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  previewUrl: string;
  status: ProcessStatus;
};
