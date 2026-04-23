import type { CompressPreset, CompressStatus } from "./types";

const COMPRESS_SERVER = "http://127.0.0.1:4184";
const PDF_HELPER_DISABLED =
  import.meta.env.VITE_MINIAPPS_DISABLE_PDF_HELPER === "true" ||
  import.meta.env.VITE_MINIAPPS_WEB_DEPLOYMENT === "true";

export function isPdfHelperDisabled(): boolean {
  return PDF_HELPER_DISABLED;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

export async function checkCompressAvailable(): Promise<boolean> {
  if (PDF_HELPER_DISABLED) {
    return true;
  }

  try {
    const res = await fetch(`${COMPRESS_SERVER}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ghostscript?: boolean };
    return Boolean(data.ghostscript);
  } catch {
    return false;
  }
}

export async function repairPdf(
  fileBytes: Uint8Array,
  fileName: string
): Promise<{ ok: true; bytes: Uint8Array; fileName: string } | { ok: false; message: string }> {
  if (PDF_HELPER_DISABLED) {
    const { repairWithWasm } = await import("./compress-wasm");
    return repairWithWasm(fileBytes, fileName);
  }

  try {
    const blob = new Blob([toArrayBuffer(fileBytes)], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", blob, fileName);

    const res = await fetch(`${COMPRESS_SERVER}/repair`, { method: "POST", body: formData });

    if (!res.ok) {
      return { ok: false, message: (await res.text()) || "Sunucu hatası." };
    }

    const resultBlob = await res.blob();
    const baseName = fileName.replace(/\.pdf$/i, "");
    return { ok: true, bytes: new Uint8Array(await resultBlob.arrayBuffer()), fileName: `${baseName}-repaired.pdf` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Bilinmeyen hata." };
  }
}

export async function compressPdf(
  fileBytes: Uint8Array,
  fileName: string,
  preset: CompressPreset
): Promise<CompressStatus> {
  if (PDF_HELPER_DISABLED) {
    const { compressWithWasm } = await import("./compress-wasm");
    return compressWithWasm(fileBytes, fileName, preset);
  }

  try {
    const blob = new Blob([toArrayBuffer(fileBytes)], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", blob, fileName);
    formData.append("preset", preset);

    const res = await fetch(`${COMPRESS_SERVER}/compress`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      return { kind: "error", message: text || "Sunucu hatası." };
    }

    const resultBlob = await res.blob();
    const downloadUrl = URL.createObjectURL(resultBlob);
    const baseName = fileName.replace(/\.pdf$/i, "");

    return {
      kind: "success",
      sizeOriginal: fileBytes.byteLength,
      sizeResult: resultBlob.size,
      downloadUrl,
      fileName: `${baseName}-compressed.pdf`,
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Bilinmeyen hata.",
    };
  }
}
