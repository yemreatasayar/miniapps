import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.MINIAPPS_PDF_HELPER_PORT || "4184", 10);
const MAX_PDF_FILE_BYTES = 100 * 1024 * 1024;
const MAX_CONVERT_FILE_BYTES = 150 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = Math.max(MAX_PDF_FILE_BYTES, MAX_CONVERT_FILE_BYTES) + 2 * 1024 * 1024;
const ALLOWED_PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf", ""]);
const ALLOWED_CONVERT_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".txt",
  ".xls",
  ".xlsx",
  ".ods",
  ".ppt",
  ".pptx",
  ".pps",
  ".ppsx",
  ".odp",
]);
const ALLOWED_BROWSER_ORIGINS = new Set([
  "https://miniapps.tr",
  "https://www.miniapps.tr",
]);

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

const PRESETS = {
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

function isLocalOrigin(origin) {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    return (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function isAllowedBrowserOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_BROWSER_ORIGINS.has(origin)) return true;
  return isLocalOrigin(origin);
}

function buildCorsHeaders(origin) {
  const allowedOrigin = isAllowedBrowserOrigin(origin) ? origin : "http://127.0.0.1:4313";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function buildGhostscriptCandidates() {
  const binDir = join(__dirname, "bin");
  const candidates = [];

  if (process.env.MINIAPPS_PDF_GS_PATH) {
    candidates.push(
      process.env.MINIAPPS_PDF_GS_PATH.startsWith(".")
        ? join(__dirname, process.env.MINIAPPS_PDF_GS_PATH)
        : process.env.MINIAPPS_PDF_GS_PATH
    );
  }

  if (process.platform === "darwin" && process.arch === "arm64") {
    candidates.push(join(binDir, "gs-macos-arm64"), join(binDir, "gs"));
  } else if (process.platform === "darwin" && process.arch === "x64") {
    candidates.push(join(binDir, "gs-macos-x64"), join(binDir, "gs"));
  } else if (process.platform === "win32") {
    candidates.push(join(binDir, "gs-windows.exe"), join(binDir, "gs.exe"));
  } else {
    candidates.push(join(binDir, "gs-linux-x64"), join(binDir, "gs"));
  }

  if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin/gs", "/usr/local/bin/gs");
  } else if (process.platform === "win32") {
    const programFilesRoots = [
      process.env.ProgramW6432,
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ].filter(Boolean);

    for (const programFilesRoot of [...new Set(programFilesRoots)]) {
      const gsRoot = join(programFilesRoot, "gs");
      if (!existsSync(gsRoot)) continue;

      const versionDirs = readdirSync(gsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

      for (const versionDir of versionDirs) {
        candidates.push(
          join(gsRoot, versionDir, "bin", "gswin64c.exe"),
          join(gsRoot, versionDir, "bin", "gswin32c.exe")
        );
      }
    }
  }

  if (process.platform === "win32") {
    candidates.push("gswin64c", "gswin32c", "gs");
  } else {
    candidates.push("gs");
  }

  return [...new Set(candidates)];
}

function detectGhostscript() {
  for (const candidate of buildGhostscriptCandidates()) {
    const isLocalFile = candidate.includes("/") || candidate.includes("\\");
    if (isLocalFile && !existsSync(candidate)) {
      continue;
    }

    const probe = spawnSync(candidate, ["-version"], {
      encoding: "utf8",
      shell: false,
      timeout: 5000,
    });

    if (probe.status === 0) {
      return {
        available: true,
        command: candidate,
        bundled: isLocalFile,
        version: probe.stdout.trim().split(/\r?\n/)[0] || "unknown",
      };
    }
  }

  return {
    available: false,
    command: null,
    bundled: false,
    version: null,
  };
}

let ghostscript = detectGhostscript();

function buildLibreOfficeCandidates() {
  const candidates = [];

  if (process.env.MINIAPPS_LIBREOFFICE_PATH) {
    candidates.push(
      process.env.MINIAPPS_LIBREOFFICE_PATH.startsWith(".")
        ? join(__dirname, process.env.MINIAPPS_LIBREOFFICE_PATH)
        : process.env.MINIAPPS_LIBREOFFICE_PATH
    );
  }

  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      "/Applications/LibreOffice.app/Contents/MacOS/libreoffice",
      "/Applications/LibreOfficeDev.app/Contents/MacOS/soffice",
      "/opt/homebrew/bin/soffice",
      "/usr/local/bin/soffice"
    );

    if (process.env.HOME) {
      candidates.push(
        join(
          process.env.HOME,
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/MacOS/soffice"
        )
      );
    }
  } else if (process.platform === "win32") {
    const programFilesRoots = [
      process.env.ProgramW6432,
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ].filter(Boolean);

    for (const programFilesRoot of [...new Set(programFilesRoots)]) {
      candidates.push(join(programFilesRoot, "LibreOffice", "program", "soffice.exe"));
    }
  }

  candidates.push("soffice", "libreoffice");
  return [...new Set(candidates)];
}

function detectLibreOffice() {
  const explicitCandidate = process.env.MINIAPPS_LIBREOFFICE_PATH
    ? process.env.MINIAPPS_LIBREOFFICE_PATH.toLowerCase()
    : null;

  for (const candidate of buildLibreOfficeCandidates()) {
    const isLocalFile = candidate.includes("/") || candidate.includes("\\");
    if (isLocalFile && !existsSync(candidate)) {
      continue;
    }

    if (
      process.platform === "win32" &&
      explicitCandidate &&
      isLocalFile &&
      candidate.toLowerCase() === explicitCandidate
    ) {
      return {
        available: true,
        command: candidate,
        version: "configured",
      };
    }

    const probe = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      shell: false,
      timeout: 5000,
    });

    if (probe.status === 0) {
      return {
        available: true,
        command: candidate,
        version: (probe.stdout || probe.stderr).trim().split(/\r?\n/)[0] || "unknown",
      };
    }

    if (
      explicitCandidate &&
      isLocalFile &&
      candidate.toLowerCase() === explicitCandidate
    ) {
      return {
        available: true,
        command: candidate,
        version: "unverified",
      };
    }
  }

  return {
    available: false,
    command: null,
    version: null,
  };
}

let libreOffice = detectLibreOffice();

async function safeUnlink(filePath) {
  try {
    await fs.unlink(filePath);
  } catch {
    // noop
  }
}

function isPdfFile(file) {
  const lowerName = file.name.toLowerCase();
  const mimeType = (file.type || "").toLowerCase();
  return lowerName.endsWith(".pdf") && ALLOWED_PDF_MIME_TYPES.has(mimeType);
}

function getConvertExtension(file) {
  return extname(file?.name || "").toLowerCase();
}

function validatePdfFile(file) {
  if (!file || !Buffer.isBuffer(file.bytes)) {
    return { ok: false, message: "Missing file." };
  }

  if (!isPdfFile(file)) {
    return { ok: false, message: "Only PDF files are accepted." };
  }

  if (file.size <= 0) {
    return { ok: false, message: "Empty PDF files cannot be processed." };
  }

  if (file.size > MAX_PDF_FILE_BYTES) {
    return { ok: false, message: "PDF size exceeds the limit." };
  }

  return { ok: true, file };
}

function validateConvertFile(file) {
  if (!file || !Buffer.isBuffer(file.bytes)) {
    return { ok: false, message: "Missing file." };
  }

  const extension = getConvertExtension(file);
  if (!ALLOWED_CONVERT_EXTENSIONS.has(extension)) {
    return { ok: false, message: "This file type cannot be converted to PDF." };
  }

  if (file.size <= 0) {
    return { ok: false, message: "Empty files cannot be converted." };
  }

  if (file.size > MAX_CONVERT_FILE_BYTES) {
    return { ok: false, message: "File size exceeds the conversion limit." };
  }

  return { ok: true, file, extension };
}

function sendJson(response, statusCode, data, origin) {
  response.writeHead(statusCode, {
    ...buildCorsHeaders(origin),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

function sendText(response, statusCode, text, origin) {
  response.writeHead(statusCode, {
    ...buildCorsHeaders(origin),
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

function sendBuffer(response, statusCode, buffer, headers, origin) {
  response.writeHead(statusCode, {
    ...buildCorsHeaders(origin),
    ...headers,
  });
  response.end(buffer);
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const fail = (message) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        fail("PDF size exceeds the limit.");
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });

    req.on("error", (error) => {
      fail(error instanceof Error ? error.message : "Failed to read request body.");
    });
  });
}

function parseMultipartForm(req, body) {
  const contentTypeHeader = Array.isArray(req.headers["content-type"])
    ? req.headers["content-type"][0]
    : req.headers["content-type"] || "";
  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw new Error("Missing multipart boundary.");
  }

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const bodyText = body.toString("latin1");
  const rawParts = bodyText.split(`--${boundary}`);
  const fields = new Map();
  let file = null;

  for (const rawPart of rawParts) {
    if (!rawPart || rawPart === "--" || rawPart === "--\r\n") continue;

    const normalizedPart = rawPart.startsWith("\r\n") ? rawPart.slice(2) : rawPart;
    const headerEndIndex = normalizedPart.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) continue;

    const headersRaw = normalizedPart.slice(0, headerEndIndex);
    let contentRaw = normalizedPart.slice(headerEndIndex + 4);
    if (contentRaw.endsWith("\r\n")) {
      contentRaw = contentRaw.slice(0, -2);
    }

    const headerLines = headersRaw.split("\r\n");
    const headers = new Map();
    for (const headerLine of headerLines) {
      const separatorIndex = headerLine.indexOf(":");
      if (separatorIndex === -1) continue;
      headers.set(
        headerLine.slice(0, separatorIndex).trim().toLowerCase(),
        headerLine.slice(separatorIndex + 1).trim()
      );
    }

    const disposition = headers.get("content-disposition") || "";
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;

    const fieldName = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    const contentBuffer = Buffer.from(contentRaw, "latin1");

    if (filenameMatch) {
      file = {
        name: filenameMatch[1] || "upload.pdf",
        type: headers.get("content-type") || "",
        size: contentBuffer.byteLength,
        bytes: contentBuffer,
      };
      continue;
    }

    fields.set(fieldName, contentBuffer.toString("utf8"));
  }

  return {
    fields,
    file,
  };
}

async function processPdfThroughGhostscript(file, args) {
  const inputPath = join(tmpdir(), `miniapps-pdf-input-${randomUUID()}.pdf`);
  const outputPath = join(tmpdir(), `miniapps-pdf-output-${randomUUID()}.pdf`);

  try {
    await fs.writeFile(inputPath, file.bytes);

    const result = spawnSync(
      ghostscript.command,
      [
        "-sDEVICE=pdfwrite",
        "-dNOPAUSE",
        "-dBATCH",
        "-dQUIET",
        "-dSAFER",
        ...args,
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      {
        encoding: "utf8",
        shell: false,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || result.stdout?.trim() || "Ghostscript failed.");
    }

    return await fs.readFile(outputPath);
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

function safeDownloadFileName(fileName) {
  return basename(fileName)
    .replace(/[^\w.\-() ]+/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "converted.pdf";
}

async function convertDocumentThroughLibreOffice(file, extension) {
  const workDir = await fs.mkdtemp(join(tmpdir(), "miniapps-pdf-convert-"));
  const outputDir = join(workDir, "out");
  const inputBaseName = `input-${randomUUID()}${extension}`;
  const inputPath = join(workDir, inputBaseName);

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(inputPath, file.bytes);

    const result = spawnSync(
      libreOffice.command,
      [
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--nodefault",
        "--nolockcheck",
        "--norestore",
        "--convert-to",
        "pdf",
        "--outdir",
        outputDir,
        inputPath,
      ],
      {
        encoding: "utf8",
        shell: false,
        timeout: 180000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || result.stdout?.trim() || "LibreOffice conversion failed.");
    }

    const expectedOutputPath = join(outputDir, inputBaseName.replace(/\.[^.]+$/i, ".pdf"));
    if (existsSync(expectedOutputPath)) {
      return await fs.readFile(expectedOutputPath);
    }

    const generatedFiles = await fs.readdir(outputDir);
    const generatedPdf = generatedFiles.find((entry) => entry.toLowerCase().endsWith(".pdf"));
    if (!generatedPdf) {
      throw new Error("LibreOffice did not create a PDF output.");
    }

    return await fs.readFile(join(outputDir, generatedPdf));
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(origin));
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === "/health" && req.method === "GET") {
    sendJson(
      res,
      200,
      {
        ok: true,
        ghostscript: ghostscript.available,
        command: ghostscript.command,
        bundled: ghostscript.bundled,
        version: ghostscript.version,
        libreOffice: libreOffice.available,
        libreOfficeCommand: libreOffice.command,
        libreOfficeVersion: libreOffice.version,
        platform: `${process.platform}-${process.arch}`,
      },
      origin
    );
    return;
  }

  if (url.pathname !== "/repair" && url.pathname !== "/compress" && url.pathname !== "/convert") {
    sendText(res, 404, "Not found.", origin);
    return;
  }

  if (req.method !== "POST") {
    sendText(res, 405, "Method not allowed.", origin);
    return;
  }

  try {
    const body = await readRequestBody(req, MAX_MULTIPART_BODY_BYTES);
    const { fields, file } = parseMultipartForm(req, body);

    if (url.pathname === "/convert") {
      if (!libreOffice.available) {
        libreOffice = detectLibreOffice();
      }
      if (!libreOffice.available) {
        sendText(res, 503, "LibreOffice is unavailable on this device.", origin);
        return;
      }

      const validation = validateConvertFile(file);
      if (!validation.ok) {
        sendText(res, 400, validation.message, origin);
        return;
      }

      const outputBytes = await convertDocumentThroughLibreOffice(validation.file, validation.extension);
      const outputName = safeDownloadFileName(validation.file.name.replace(/\.[^.]+$/i, ".pdf"));

      sendBuffer(
        res,
        200,
        outputBytes,
        {
          "Content-Disposition": `attachment; filename="${outputName}"`,
          "Content-Type": "application/pdf",
        },
        origin
      );
      return;
    }

    ghostscript = detectGhostscript();
    if (!ghostscript.available) {
      sendText(res, 503, "Ghostscript is unavailable on this device.", origin);
      return;
    }

    const validation = validatePdfFile(file);

    if (!validation.ok) {
      sendText(res, 400, validation.message, origin);
      return;
    }

    const preset = String(fields.get("preset") || "balanced");
    const upload = validation.file;
    const args =
      url.pathname === "/repair"
        ? ["-dPDFSETTINGS=/prepress", ...COMMON_ARGS]
        : PRESETS[preset] || PRESETS.balanced;

    const outputBytes = await processPdfThroughGhostscript(upload, args);
    const filename = url.pathname === "/repair" ? "repaired.pdf" : "compressed.pdf";

    sendBuffer(
      res,
      200,
      outputBytes,
      {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/pdf",
      },
      origin
    );
  } catch (error) {
    sendText(
      res,
      500,
      error instanceof Error ? error.message : "Unknown PDF compress error.",
      origin
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`pdf-compress-server listening on http://${HOST}:${PORT}`);
  console.log(
    `Ghostscript: ${ghostscript.available ? `${ghostscript.command} (${ghostscript.version})` : "unavailable"}`
  );
  console.log(
    `LibreOffice: ${libreOffice.available ? `${libreOffice.command} (${libreOffice.version})` : "unavailable"}`
  );
});
