import type { CompressPreset, CompressStatus } from "./types";

const GS_BASE = `${import.meta.env.BASE_URL}ghostscript/`;

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

const COMMON_GS_ARGS = ["-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite"];

// Classic worker as a blob so importScripts can load the UMD gs.js without
// ESM complications. callMain() is synchronous but runs off the main thread.
const WORKER_SRC = `
var gs = null;
var jobCounter = 0;

self.onmessage = async function (ev) {
  var d = ev.data;

  if (d.op === 'init') {
    try {
      importScripts(d.gsBase + 'gs.js');
      var wasmBinary = await fetch(d.gsBase + 'gs.wasm').then(function(r) { return r.arrayBuffer(); });
      gs = await Module({ wasmBinary: wasmBinary });
      self.postMessage({ op: 'ready' });
    } catch (err) {
      self.postMessage({ op: 'init-error', message: String((err && err.message) || err) });
    }
    return;
  }

  if (d.op === 'run') {
    var id = ++jobCounter;
    var inputPath = '/tmp/gs-in-' + d.id + '.pdf';
    var outputPath = '/tmp/gs-out-' + d.id + '.pdf';
    try {
      gs.FS.writeFile(inputPath, new Uint8Array(d.input));
      gs.callMain(d.args.concat(['-sOutputFile=' + outputPath, inputPath]));
      var result = gs.FS.readFile(outputPath);
      try { gs.FS.unlink(inputPath); } catch (_) {}
      try { gs.FS.unlink(outputPath); } catch (_) {}
      self.postMessage({ op: 'result', id: d.id, output: result.buffer }, [result.buffer]);
    } catch (err) {
      try { gs.FS.unlink(inputPath); } catch (_) {}
      try { gs.FS.unlink(outputPath); } catch (_) {}
      self.postMessage({ op: 'error', id: d.id, message: String((err && err.message) || err) });
    }
  }
};
`;

type PendingJob = {
  resolve: (output: Uint8Array) => void;
  reject: (message: string) => void;
};

let worker: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;
const pendingJobs = new Map<number, PendingJob>();
let jobSeq = 0;

function ensureWorker(): Promise<void> {
  if (workerReadyPromise) return workerReadyPromise;

  const absoluteGsBase = new URL(GS_BASE, window.location.href).href;
  const blob = new Blob([WORKER_SRC], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);

  workerReadyPromise = new Promise<void>((resolve, reject) => {
    worker!.onmessage = (ev) => {
      const d = ev.data as { op: string; id?: number; output?: ArrayBuffer; message?: string };

      if (d.op === "ready") {
        resolve();
        worker!.onmessage = handleWorkerMessage;
        return;
      }
      if (d.op === "init-error") {
        reject(new Error(d.message ?? "Ghostscript WASM başlatılamadı."));
        return;
      }
    };
  });

  worker.postMessage({ op: "init", gsBase: absoluteGsBase });
  return workerReadyPromise;
}

function handleWorkerMessage(ev: MessageEvent) {
  const d = ev.data as { op: string; id?: number; output?: ArrayBuffer; message?: string };
  if (d.id === undefined) return;

  const job = pendingJobs.get(d.id);
  if (!job) return;
  pendingJobs.delete(d.id);

  if (d.op === "result" && d.output) {
    job.resolve(new Uint8Array(d.output));
  } else {
    job.reject(d.message ?? "Sıkıştırma başarısız.");
  }
}

async function runGs(fileBytes: Uint8Array, args: string[]): Promise<Uint8Array> {
  await ensureWorker();

  const id = ++jobSeq;
  const inputBuffer = fileBytes.buffer.slice(
    fileBytes.byteOffset,
    fileBytes.byteOffset + fileBytes.byteLength
  );

  return new Promise<Uint8Array>((resolve, reject) => {
    pendingJobs.set(id, {
      resolve,
      reject: (msg) => reject(new Error(msg)),
    });
    worker!.postMessage({ op: "run", id, input: inputBuffer, args }, [inputBuffer]);
  });
}

export async function compressWithWasm(
  fileBytes: Uint8Array,
  fileName: string,
  preset: CompressPreset
): Promise<CompressStatus> {
  try {
    const args = [...COMMON_GS_ARGS, ...PRESET_FLAGS[preset]];
    const result = await runGs(fileBytes, args);
    const blob = new Blob([result.buffer as ArrayBuffer], { type: "application/pdf" });
    const baseName = fileName.replace(/\.pdf$/i, "");

    return {
      kind: "success",
      sizeOriginal: fileBytes.byteLength,
      sizeResult: result.byteLength,
      downloadUrl: URL.createObjectURL(blob),
      fileName: `${baseName}-compressed.pdf`,
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Sıkıştırma başarısız.",
    };
  }
}

export async function repairWithWasm(
  fileBytes: Uint8Array,
  fileName: string
): Promise<{ ok: true; bytes: Uint8Array; fileName: string } | { ok: false; message: string }> {
  try {
    const args = ["-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite", "-dPDFSETTINGS=/prepress"];
    const result = await runGs(fileBytes, args);
    const baseName = fileName.replace(/\.pdf$/i, "");
    return { ok: true, bytes: result, fileName: `${baseName}-repaired.pdf` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Repair başarısız.",
    };
  }
}
