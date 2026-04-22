export type OutputFormat = "jpg" | "png" | "webp";

export type LoadedImage = {
  id: string;
  file: File;
  fileName: string;
  preferredFormat: OutputFormat;
  width: number;
  height: number;
  fileSize: number;
  thumbnail: string;
  bpp: number;
  normalizedScore: number;
};

export type ResizeMode = "off" | "width" | "fit";

export type ResizeSettings = {
  mode: ResizeMode;
  width: number;
  height: number;
};

export type SmartCompressSettings = {
  slider: number;
  format: OutputFormat;
};

export type StandardCompressSettings = {
  quality: number;
  format: OutputFormat;
};

export type ActiveTab = "edit" | "smart-compress" | "compress";

export type ProcessOptions = {
  quality: number;
  format: OutputFormat;
  resize?: ResizeSettings;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
};
