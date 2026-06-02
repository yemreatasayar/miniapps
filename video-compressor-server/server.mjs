import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.MINIAPPS_VIDEO_HELPER_PORT || "4186", 10);
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_VIDEO_BYTES + 2 * 1024 * 1024;
const VALID_FORMATS = new Set(["original", "mp4", "webm", "mov"]);
const VALID_AUDIO_BITRATES = new Set(["64", "128", "192"]);
const ALLOWED_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"]);

function isLocalOrigin(origin) {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isLocalOrigin(origin) ? origin : "http://127.0.0.1:4324",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Miniapps-Settings, X-Miniapps-File-Name",
    "Access-Control-Expose-Headers": "Content-Disposition, X-Miniapps-Output-File-Name",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function sendJson(response, statusCode, data, origin) {
  response.writeHead(statusCode, {
    ...corsHeaders(origin),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

function sendBuffer(response, statusCode, buffer, fileName, mime, origin) {
  response.writeHead(statusCode, {
    ...corsHeaders(origin),
    "Content-Type": mime,
    "Content-Length": String(buffer.length),
    "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    "X-Miniapps-Output-File-Name": encodeURIComponent(fileName),
  });
  response.end(buffer);
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Video dosyası çok büyük."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function decodeBase64Url(value) {
  if (!value) return null;
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function sanitizeFileName(value) {
  const decoded = decodeBase64Url(value) || "video.mp4";
  const baseName = decoded.split(/[\\/]/).pop() || "video.mp4";
  return baseName.replace(/[^\w .()[\]-]+/g, "_").slice(0, 180) || "video.mp4";
}

function sanitizeSettings(value) {
  const parsed = JSON.parse(decodeBase64Url(value) || "{}");
  const format = VALID_FORMATS.has(parsed.outputFormat) ? parsed.outputFormat : "mp4";
  const crf = Number.isFinite(parsed.videoCrf) ? Math.min(40, Math.max(16, Math.round(parsed.videoCrf))) : 28;
  const includeAudio = typeof parsed.includeAudio === "boolean" ? parsed.includeAudio : true;
  const audioBitrate = VALID_AUDIO_BITRATES.has(String(parsed.audioBitrate)) ? String(parsed.audioBitrate) : "128";
  const segments = Array.isArray(parsed.segments) ? parsed.segments : [];

  return {
    outputFormat: format,
    videoCrf: crf,
    includeAudio,
    audioBitrate,
    segments: segments
      .map((segment) => ({
        start: Number(segment?.start),
        end: Number(segment?.end),
      }))
      .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end - segment.start > 0.1)
      .sort((a, b) => a.start - b.start),
  };
}

function buildBinaryCandidates(name) {
  const envValue = process.env[`MINIAPPS_VIDEO_HELPER_${name.toUpperCase()}_BIN`];
  const binary = name === "ffprobe" ? "ffprobe" : "ffmpeg";
  return [
    envValue,
    process.platform === "darwin" ? `/opt/homebrew/bin/${binary}` : null,
    process.platform === "darwin" ? `/usr/local/bin/${binary}` : null,
    binary,
  ].filter(Boolean);
}

function detectBinary(name) {
  for (const candidate of buildBinaryCandidates(name)) {
    const isPath = candidate.includes("/") || candidate.includes("\\");
    if (isPath && !existsSync(candidate)) continue;

    const probe = spawnSync(candidate, ["-version"], { encoding: "utf8", timeout: 5000 });
    if (probe.status === 0) return candidate;
  }

  return null;
}

const FFMPEG_BIN = detectBinary("ffmpeg");
const FFPROBE_BIN = detectBinary("ffprobe");

function getExtension(fileName) {
  const extension = extname(fileName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : ".mp4";
}

function effectiveFormat(format, inputExtension) {
  if (format !== "original") return format;
  if (inputExtension === ".webm") return "webm";
  if (inputExtension === ".mov") return "mov";
  return "mp4";
}

function outputExtension(format, inputExtension) {
  return `.${effectiveFormat(format, inputExtension)}`;
}

function outputMime(extension) {
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  return "video/mp4";
}

function videoCodecArgs(format, inputExtension, crf) {
  const effective = effectiveFormat(format, inputExtension);
  if (effective === "webm") return ["-vcodec", "libvpx-vp9", "-crf", String(crf), "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-threads", "2"];
  return ["-vcodec", "libx264", "-crf", String(crf), "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p"];
}

function audioCodecArgs(format, inputExtension, includeAudio, bitrate) {
  if (!includeAudio) return ["-an"];
  const effective = effectiveFormat(format, inputExtension);
  if (effective === "webm") return ["-acodec", "libopus", "-b:a", `${bitrate}k`];
  return ["-acodec", "aac", "-b:a", `${bitrate}k`];
}

function containerArgs(format, inputExtension) {
  return effectiveFormat(format, inputExtension) === "mp4" ? ["-movflags", "+faststart"] : [];
}

function hasAudioStream(inputPath) {
  if (!FFPROBE_BIN) return true;

  const result = spawnSync(FFPROBE_BIN, [
    "-v", "error",
    "-select_streams", "a",
    "-show_entries", "stream=index",
    "-of", "csv=p=0",
    inputPath,
  ], { encoding: "utf8", timeout: 15000 });

  if (result.status !== 0) return true;
  return result.stdout.trim().length > 0;
}

function getVideoDuration(inputPath) {
  if (!FFPROBE_BIN) return 0;

  const result = spawnSync(FFPROBE_BIN, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ], { encoding: "utf8", timeout: 15000 });

  if (result.status !== 0) return 0;

  const duration = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(duration) ? duration : 0;
}

function isFullVideo(segments, duration) {
  if (segments.length === 0) return true;
  return segments.length === 1 && segments[0].start <= 0.05 && duration > 0 && segments[0].end >= duration - 0.05;
}

function segmentDuration(segment) {
  return String(Math.max(segment.end - segment.start, 0.1));
}

function buildMultiSegmentArgs(inputPath, outputPath, settings, inputExtension, includeAudio, vc, ac, container) {
  const filterParts = [];
  const concatInputs = [];

  settings.segments.forEach((segment, index) => {
    filterParts.push(`[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`);
    concatInputs.push(`[v${index}]`);

    if (includeAudio) {
      filterParts.push(`[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}]`);
      concatInputs.push(`[a${index}]`);
    }
  });

  const concatOutput = includeAudio ? "[vout][aout]" : "[vout]";
  const filterComplex = `${filterParts.join(";")};${concatInputs.join("")}concat=n=${settings.segments.length}:v=1:a=${includeAudio ? 1 : 0}${concatOutput}`;
  const args = ["-y", "-filter_threads", "1", "-i", inputPath, "-filter_complex", filterComplex, "-map", "[vout]"];
  if (includeAudio) args.push("-map", "[aout]");
  args.push(...vc, ...ac, ...container, outputPath);
  return args;
}

function buildFfmpegArgs(inputPath, outputPath, settings, inputExtension) {
  const includeAudio = settings.includeAudio && hasAudioStream(inputPath);
  const duration = getVideoDuration(inputPath);
  const vc = videoCodecArgs(settings.outputFormat, inputExtension, settings.videoCrf);
  const ac = audioCodecArgs(settings.outputFormat, inputExtension, includeAudio, settings.audioBitrate);
  const container = containerArgs(settings.outputFormat, inputExtension);

  if (isFullVideo(settings.segments, duration)) {
    return ["-y", "-filter_threads", "1", "-i", inputPath, ...vc, ...ac, ...container, outputPath];
  }

  if (settings.segments.length === 1) {
    const segment = settings.segments[0];
    return [
      "-y", "-filter_threads", "1",
      "-ss", String(segment.start),
      "-t", segmentDuration(segment),
      "-i", inputPath,
      ...vc, ...ac,
      "-avoid_negative_ts", "make_zero",
      ...container,
      outputPath,
    ];
  }

  return buildMultiSegmentArgs(inputPath, outputPath, settings, inputExtension, includeAudio, vc, ac, container);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    const logs = [];

    child.stderr.on("data", (chunk) => {
      logs.push(chunk.toString("utf8"));
      if (logs.length > 80) logs.shift();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const message = logs.join("").split(/\r?\n/g).map((line) => line.trim()).filter(Boolean).at(-1);
      reject(new Error(message || `FFmpeg exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function processVideo(request, response, origin) {
  if (!FFMPEG_BIN) {
    sendJson(response, 503, { ok: false, message: "FFmpeg bulunamadı." }, origin);
    return;
  }

  let jobDir = null;

  try {
    const settings = sanitizeSettings(request.headers["x-miniapps-settings"]);
    if (settings.segments.length === 0) {
      throw new Error("Geçerli segment bulunamadı.");
    }

    const fileName = sanitizeFileName(request.headers["x-miniapps-file-name"]);
    const inputExtension = getExtension(fileName);
    const outputExt = outputExtension(settings.outputFormat, inputExtension);
    const baseName = fileName.replace(/\.[^.]+$/, "") || "video";
    const body = await readBody(request, MAX_BODY_BYTES);

    if (body.length === 0) throw new Error("Video dosyası boş.");

    jobDir = join(tmpdir(), `miniapps-video-${randomUUID()}`);
    await fs.mkdir(jobDir, { recursive: true });

    const inputPath = join(jobDir, `input${inputExtension}`);
    const outputPath = join(jobDir, `output${outputExt}`);
    await fs.writeFile(inputPath, body);

    const outputSuffix = isFullVideo(settings.segments, getVideoDuration(inputPath)) ? "compressed" : "cut";
    const outputName = `${baseName}_${outputSuffix}${outputExt}`;
    await runFfmpeg(buildFfmpegArgs(inputPath, outputPath, settings, inputExtension));

    const output = await fs.readFile(outputPath);
    sendBuffer(response, 200, output, outputName, outputMime(outputExt), origin);
  } catch (error) {
    sendJson(response, 500, { ok: false, message: error instanceof Error ? error.message : "Video işlenemedi." }, origin);
  } finally {
    if (jobDir) {
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

const server = http.createServer((request, response) => {
  const origin = request.headers.origin;
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, FFMPEG_BIN ? 200 : 503, {
      ok: Boolean(FFMPEG_BIN),
      ffmpeg: Boolean(FFMPEG_BIN),
      ffprobe: Boolean(FFPROBE_BIN),
    }, origin);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/process") {
    void processVideo(request, response, origin);
    return;
  }

  sendJson(response, 404, { ok: false, message: "Not found." }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`video-compressor-server listening on http://${HOST}:${PORT}`);
});
