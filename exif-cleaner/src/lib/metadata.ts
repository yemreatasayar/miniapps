import type { MetadataSummary } from "./types";

type ExifrModule = {
  parse: (file: Blob, options?: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
};

function getString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getDateLabel(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleString("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return getString(value);
}

function hasFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

export async function readMetadataSummary(file: File): Promise<MetadataSummary> {
  try {
    const exifrModule = (await import("exifr")) as unknown as ExifrModule;
    const parsed =
      (await exifrModule.parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: true,
        iptc: true,
        icc: false,
        jfif: true,
      })) ?? {};

    const tagCount = Object.keys(parsed).length;
    const make = getString(parsed.Make);
    const model = getString(parsed.Model);
    const camera = [make, model].filter(Boolean).join(" ").trim() || null;
    const capturedAt =
      getDateLabel(parsed.DateTimeOriginal) ??
      getDateLabel(parsed.CreateDate) ??
      getDateLabel(parsed.ModifyDate) ??
      null;
    const orientation = getString(parsed.Orientation);
    const hasGps =
      hasFiniteNumber(parsed.latitude) ||
      hasFiniteNumber(parsed.longitude) ||
      hasFiniteNumber(parsed.Latitude) ||
      hasFiniteNumber(parsed.Longitude) ||
      hasFiniteNumber(parsed.GPSLatitude) ||
      hasFiniteNumber(parsed.GPSLongitude);

    return {
      hasExif: tagCount > 0,
      hasGps,
      tagCount,
      camera,
      capturedAt,
      orientation,
      parseWarning: null,
    };
  } catch {
    return {
      hasExif: false,
      hasGps: false,
      tagCount: 0,
      camera: null,
      capturedAt: null,
      orientation: null,
      parseWarning: "Metadata okunamadi; temiz kopya yine de üretilebilir.",
    };
  }
}
