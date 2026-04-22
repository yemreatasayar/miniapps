import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GS_PATH = join(__dirname, "bin", "gs");
const GS_AVAILABLE = existsSync(GS_PATH);
const MAX_PDF_FILE_BYTES = 100 * 1024 * 1024;
const ALLOWED_PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "http://pdf.localhost:4183",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

const COMMON_ARGS = [
  "-dCompatibilityLevel=1.4",
  "-dEmbedAllFonts=true",
  "-dSubsetFonts=true",
  "-dCompressFonts=true",
  "-dAutoFilterColorImages=false",
  "-dColorImageFilter=/DCTEncode",
  "-dAutoFilterGrayImages=false",
  "-dGrayImageFilter=/DCTEncode",
  "-dEncodeMonoImages=false",
  "-dColorConversionStrategy=/LeaveColorUnchanged",
];

const PRESETS: Record<string, string[]> = {
  web: [
    ...COMMON_ARGS,
    "-dPDFSETTINGS=/screen",
    "-dColorImageResolution=72",
    "-dGrayImageResolution=72",
    "-dMonoImageResolution=72",
  ],
  balanced: [
    ...COMMON_ARGS,
    "-dPDFSETTINGS=/ebook",
    "-dColorImageResolution=150",
    "-dGrayImageResolution=150",
    "-dMonoImageResolution=150",
  ],
  strong: [
    ...COMMON_ARGS,
    "-dPDFSETTINGS=/screen",
    "-dColorImageResolution=60",
    "-dGrayImageResolution=60",
    "-dMonoImageResolution=120",
  ],
};

function safeUnlink(path: string) {
  try {
    unlinkSync(path);
  } catch {
    // noop
  }
}

function isPdfFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();
  return lowerName.endsWith(".pdf") && (!mimeType || ALLOWED_PDF_MIME_TYPES.has(mimeType));
}

function validatePdfFile(file: FormDataEntryValue | null): { ok: true; file: File } | { ok: false; message: string } {
  if (!(file instanceof File)) {
    return { ok: false, message: "Dosya eksik." };
  }

  if (!isPdfFile(file)) {
    return { ok: false, message: "Yalnızca PDF dosyaları kabul edilir." };
  }

  if (file.size <= 0) {
    return { ok: false, message: "Boş PDF dosyası işlenemez." };
  }

  if (file.size > MAX_PDF_FILE_BYTES) {
    return { ok: false, message: "PDF boyutu limitin üzerinde." };
  }

  return { ok: true, file };
}

Bun.serve({
  port: 4184,
  hostname: "127.0.0.1",
  async fetch(req) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json(
        { ok: true, ghostscript: GS_AVAILABLE },
        { headers: CORS_HEADERS }
      );
    }

    if (url.pathname === "/repair" && req.method === "POST") {
      if (!GS_AVAILABLE) {
        return new Response("Ghostscript binary bulunamadı.", { status: 503, headers: CORS_HEADERS });
      }

      const formData = await req.formData();
      const validation = validatePdfFile(formData.get("file"));

      if (!validation.ok) {
        return new Response(validation.message, { status: 400, headers: CORS_HEADERS });
      }
      const { file } = validation;

      const inputPath = join(tmpdir(), `pdf-input-${randomUUID()}.pdf`);
      const outputPath = join(tmpdir(), `pdf-output-${randomUUID()}.pdf`);

      try {
        const arrayBuffer = await file.arrayBuffer();
        await Bun.write(inputPath, new Uint8Array(arrayBuffer));

        const result = spawnSync(GS_PATH, [
          "-sDEVICE=pdfwrite",
          "-dNOPAUSE",
          "-dBATCH",
          "-dQUIET",
          "-dSAFER",
          "-dPDFSETTINGS=/prepress",
          ...COMMON_ARGS,
          `-sOutputFile=${outputPath}`,
          inputPath,
        ], { shell: false });

        if (result.status !== 0) {
          return new Response(result.stderr?.toString() ?? "Ghostscript hatası.", {
            status: 500,
            headers: CORS_HEADERS,
          });
        }

        const outputBytes = await Bun.file(outputPath).arrayBuffer();
        return new Response(outputBytes, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="repaired.pdf"',
          },
        });
      } finally {
        safeUnlink(inputPath);
        safeUnlink(outputPath);
      }
    }

    if (url.pathname === "/compress" && req.method === "POST") {
      if (!GS_AVAILABLE) {
        return new Response("Ghostscript binary bulunamadı.", {
          status: 503,
          headers: CORS_HEADERS,
        });
      }

      const formData = await req.formData();
      const validation = validatePdfFile(formData.get("file"));
      const preset = String(formData.get("preset") ?? "balanced");

      if (!validation.ok) {
        return new Response(validation.message, {
          status: 400,
          headers: CORS_HEADERS,
        });
      }
      const { file } = validation;

      const presetArgs = PRESETS[preset] ?? PRESETS.balanced;
      const inputPath = join(tmpdir(), `pdf-input-${randomUUID()}.pdf`);
      const outputPath = join(tmpdir(), `pdf-output-${randomUUID()}.pdf`);

      try {
        const arrayBuffer = await file.arrayBuffer();
        await Bun.write(inputPath, new Uint8Array(arrayBuffer));

        const result = spawnSync(GS_PATH, [
          "-sDEVICE=pdfwrite",
          "-dNOPAUSE",
          "-dBATCH",
          "-dQUIET",
          "-dSAFER",
          ...presetArgs,
          `-sOutputFile=${outputPath}`,
          inputPath,
        ], { shell: false });

        if (result.status !== 0) {
          const errMsg = result.stderr?.toString() ?? "Ghostscript hatası.";
          return new Response(errMsg, {
            status: 500,
            headers: CORS_HEADERS,
          });
        }

        const outputBytes = await Bun.file(outputPath).arrayBuffer();

        return new Response(outputBytes, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="compressed.pdf"',
          },
        });
      } finally {
        safeUnlink(inputPath);
        safeUnlink(outputPath);
      }
    }

    return new Response("Not found.", {
      status: 404,
      headers: CORS_HEADERS,
    });
  },
});

console.log("pdf-compress-server listening on http://127.0.0.1:4184");
console.log(`Ghostscript: ${GS_AVAILABLE ? "hazır" : "binary bulunamadı"}`);
