import type { CompressPreset, CompressStatus } from "./types";

type GsModule = {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number;
};

const GS_BASE = `${import.meta.env.BASE_URL}ghostscript/`;

let gsPromise: Promise<GsModule> | null = null;
let jobCounter = 0;

async function loadGs(): Promise<GsModule> {
  if (!gsPromise) {
    gsPromise = (async () => {
      // gs.js is loaded as a classic script (not ESM) so `var Module` becomes
      // a global — avoids the broken globalThis.exports trick in the ESM wrapper.
      if (!(window as { __gsLoaded?: boolean }).__gsLoaded) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `${GS_BASE}gs.js`;
          script.onload = () => {
            (window as { __gsLoaded?: boolean }).__gsLoaded = true;
            resolve();
          };
          script.onerror = () => reject(new Error("gs.js yüklenemedi"));
          document.head.appendChild(script);
        });
      }
      const wasmBinary = await fetch(`${GS_BASE}gs.wasm`).then((r) => r.arrayBuffer());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const factory = (window as any).Module as (opts: { wasmBinary: ArrayBuffer }) => Promise<GsModule>;
      if (typeof factory !== "function") throw new Error("Ghostscript modülü başlatılamadı");
      return factory({ wasmBinary });
    })();
  }
  return gsPromise;
}

const PRESET_FLAGS: Record<CompressPreset, string[]> = {
  web: ["-dPDFSETTINGS=/screen"],
  balanced: ["-dPDFSETTINGS=/ebook"],
  strong: [
    "-dPDFSETTINGS=/screen",
    "-dColorImageResolution=45",
    "-dGrayImageResolution=45",
    "-dMonoImageResolution=72",
  ],
};

export async function compressWithWasm(
  fileBytes: Uint8Array,
  fileName: string,
  preset: CompressPreset
): Promise<CompressStatus> {
  let gs: GsModule;
  try {
    gs = await loadGs();
  } catch {
    return { kind: "error", message: "Ghostscript WASM yüklenemedi." };
  }

  const id = ++jobCounter;
  const inputPath = `/tmp/in${id}.pdf`;
  const outputPath = `/tmp/out${id}.pdf`;

  try {
    gs.FS.writeFile(inputPath, fileBytes);
    gs.callMain(["-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite", ...PRESET_FLAGS[preset], `-sOutputFile=${outputPath}`, inputPath]);

    const result = new Uint8Array(gs.FS.readFile(outputPath));
    const blob = new Blob([result], { type: "application/pdf" });
    const baseName = fileName.replace(/\.pdf$/i, "");

    return {
      kind: "success",
      sizeOriginal: fileBytes.byteLength,
      sizeResult: result.byteLength,
      downloadUrl: URL.createObjectURL(blob),
      fileName: `${baseName}-compressed.pdf`,
    };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Sıkıştırma başarısız." };
  } finally {
    try { gs.FS.unlink(inputPath); } catch { /* ignore */ }
    try { gs.FS.unlink(outputPath); } catch { /* ignore */ }
  }
}

export async function repairWithWasm(
  fileBytes: Uint8Array,
  fileName: string
): Promise<{ ok: true; bytes: Uint8Array; fileName: string } | { ok: false; message: string }> {
  let gs: GsModule;
  try {
    gs = await loadGs();
  } catch {
    return { ok: false, message: "Ghostscript WASM yüklenemedi." };
  }

  const id = ++jobCounter;
  const inputPath = `/tmp/in${id}.pdf`;
  const outputPath = `/tmp/out${id}.pdf`;

  try {
    gs.FS.writeFile(inputPath, fileBytes);
    gs.callMain(["-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite", "-dPDFSETTINGS=/prepress", `-sOutputFile=${outputPath}`, inputPath]);

    const result = new Uint8Array(gs.FS.readFile(outputPath));
    const baseName = fileName.replace(/\.pdf$/i, "");

    return { ok: true, bytes: result, fileName: `${baseName}-repaired.pdf` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Repair başarısız." };
  } finally {
    try { gs.FS.unlink(inputPath); } catch { /* ignore */ }
    try { gs.FS.unlink(outputPath); } catch { /* ignore */ }
  }
}
