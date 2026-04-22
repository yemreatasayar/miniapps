export type OutputFormat = "jpg" | "png" | "webp";

export type ConvertibleImage = {
  id: string;
  sourceFile: File;
  workingFile: File;
  fileName: string;
  width: number;
  height: number;
  fileSize: number;
  thumbnail: string;
};
