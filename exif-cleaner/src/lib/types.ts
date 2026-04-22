export type OutputFormat = "jpg" | "png" | "webp";

export type MetadataSummary = {
  hasExif: boolean;
  hasGps: boolean;
  tagCount: number;
  camera: string | null;
  capturedAt: string | null;
  orientation: string | null;
  parseWarning: string | null;
};

export type SanitizableImage = {
  id: string;
  sourceFile: File;
  workingFile: File;
  fileName: string;
  width: number;
  height: number;
  fileSize: number;
  thumbnail: string;
  outputFormat: OutputFormat;
  metadata: MetadataSummary;
};
