export type OutputFormat = "jpg" | "png" | "webp";

export type CropSettings = {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ConvertibleImage = {
  id: string;
  sourceFile: File;
  workingFile: File;
  fileName: string;
  width: number;
  height: number;
  fileSize: number;
  thumbnail: string;
  crop?: CropSettings;
};
