// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no types shipped with this package
import initGs from "@jspawn/ghostscript-wasm";
import gsWasmUrl from "@jspawn/ghostscript-wasm/gs.wasm?url";
import type { CompressPreset, CompressStatus } from "./types";

type GsModule = {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number;
};

let gsPromise: Promise<GsModule> | null = null;
let jobCounter = 0;

async function loadGs(): Promise<GsModule> {
  if (!gsPromise) {
    gsPromise = (async () => {
      const wasmBinary = await fetch(gsWasmUrl).then((r) => r.arrayBuffer());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      return (initGs as (opts: { wasmBinary: ArrayBuffer }) => Promise<GsModule>)({ wasmBinary });
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
