import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";

const app = express();
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4195;
const DEFAULT_MODEL_NAME = "htdemucs";
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const JOB_TTL_MS = 15 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/x-aiff",
  "audio/aiff",
]);
const ALLOWED_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".aif", ".aiff"]);

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function resolveFrom(baseDir, value, { allowBareCommand = false } = {}) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (
    allowBareCommand &&
    !trimmed.startsWith(".") &&
    !path.isAbsolute(trimmed) &&
    !trimmed.includes("/") &&
    !trimmed.includes("\\")
  ) {
    return trimmed;
  }

  return path.isAbsolute(trimmed) ? trimmed : path.resolve(baseDir, trimmed);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOriginList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseOriginList(entry));
  }
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  if (typeof origin !== "string" || !origin.trim()) {
    return null;
  }

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function uniqueOrigins(origins) {
  return [...new Set(origins.map((origin) => normalizeOrigin(origin)).filter(Boolean))];
}

function loadConfigFile(configPath) {
  if (!existsSync(configPath)) {
    return {};
  }

  const content = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Geçersiz helper config formatı: ${configPath}`);
  }

  return parsed;
}

function loadRuntimeConfig() {
  const configOverride = getArgValue("--config") ?? process.env.MINIAPPS_STEM_HELPER_CONFIG;
  const configPath = resolveFrom(process.cwd(), configOverride ?? path.join(SERVER_DIR, "helper-config.json")) ?? path.join(SERVER_DIR, "helper-config.json");
  const fileConfig = loadConfigFile(configPath);
  const configDir = path.dirname(configPath);
  const baseDirSetting = process.env.MINIAPPS_STEM_HELPER_BASE_DIR ?? fileConfig.baseDir ?? ".";
  const baseDir = resolveFrom(configDir, baseDirSetting) ?? configDir;

  const allowedOrigins = uniqueOrigins([
    ...parseOriginList(fileConfig.allowedOrigins),
    ...parseOriginList(fileConfig.extraOrigins),
    ...parseOriginList(process.env.MINIAPPS_STEM_HELPER_ALLOWED_ORIGINS),
    ...parseOriginList(process.env.MINIAPPS_STEM_HELPER_EXTRA_ORIGINS),
  ]);

  const ffmpegBin =
    resolveFrom(
      baseDir,
      process.env.MINIAPPS_STEM_HELPER_FFMPEG_BIN ?? fileConfig.ffmpegBin ?? "ffmpeg",
      { allowBareCommand: true }
    ) ?? "ffmpeg";
  const ffprobeDefault =
    typeof ffmpegBin === "string" && ffmpegBin.includes(path.sep)
      ? path.join(path.dirname(ffmpegBin), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
      : "ffprobe";

  return {
    configPath,
    baseDir,
    host: process.env.MINIAPPS_STEM_HELPER_HOST ?? fileConfig.host ?? DEFAULT_HOST,
    port: parseInteger(process.env.MINIAPPS_STEM_HELPER_PORT ?? fileConfig.port, DEFAULT_PORT),
    tmpDir:
      resolveFrom(baseDir, process.env.MINIAPPS_STEM_HELPER_TMP_DIR ?? fileConfig.tmpDir ?? "./tmp") ??
      path.join(baseDir, "tmp"),
    pythonBin:
      resolveFrom(baseDir, process.env.MINIAPPS_STEM_HELPER_PYTHON_BIN ?? fileConfig.pythonBin ?? "./.venv/bin/python3") ??
      path.join(baseDir, ".venv", "bin", "python3"),
    ffmpegBin,
    ffprobeBin:
      resolveFrom(baseDir, process.env.MINIAPPS_STEM_HELPER_FFPROBE_BIN ?? fileConfig.ffprobeBin ?? ffprobeDefault, {
        allowBareCommand: true,
      }) ?? ffprobeDefault,
    modelName: process.env.MINIAPPS_STEM_HELPER_MODEL ?? fileConfig.modelName ?? DEFAULT_MODEL_NAME,
    helperVersion: process.env.MINIAPPS_STEM_HELPER_VERSION ?? fileConfig.helperVersion ?? null,
    helperPlatform: process.env.MINIAPPS_STEM_HELPER_PLATFORM ?? fileConfig.platform ?? `${process.platform}-${process.arch}`,
    allowedOrigins,
  };
}

const runtimeConfig = loadRuntimeConfig();
const ROOT_DIR = runtimeConfig.baseDir;
const TMP_DIR = runtimeConfig.tmpDir;
const JOBS_DIR = path.join(TMP_DIR, "jobs");
const MODEL_NAME = runtimeConfig.modelName;
const PYTHON_BIN = runtimeConfig.pythonBin;
const FFMPEG_BIN = runtimeConfig.ffmpegBin;
const FFPROBE_BIN = runtimeConfig.ffprobeBin;
const ALLOWED_ORIGINS = new Set(runtimeConfig.allowedOrigins);
const DEMUCS_COMMAND = [
  "-m",
  "demucs",
  "-n",
  MODEL_NAME,
  "--two-stems=vocals",
  "--mp3",
  "--mp3-bitrate",
  "320",
  "-d",
  "cpu",
];
const DEMUCS_ENV = createDemucsEnv();

/** @type {Map<string, any>} */
const jobs = new Map();
let warmupState = { status: "pending", message: "Warm-up bekliyor." };

function extractProgressValue(text) {
  const matches = [...text.matchAll(/(\d{1,3})%\|/g)];
  const lastMatch = matches.at(-1);
  if (!lastMatch) return null;
  const value = Number(lastMatch[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function extractLastMessage(text) {
  const segments = text
    .split(/[\r\n]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return segments.at(-1) ?? null;
}

function hasActiveProcessingJob() {
  return Array.from(jobs.values()).some((job) => job.status === "processing");
}

function getAllowedOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return null;
  return ALLOWED_ORIGINS.has(normalized) ? normalized : null;
}

function setCors(response, origin) {
  response.setHeader("Vary", "Origin");

  if (!origin) {
    return;
  }

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
}

function sanitizeExtension(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : null;
}

function isAllowedMime(mimeType) {
  return ALLOWED_MIME_TYPES.has((mimeType || "").toLowerCase());
}

function makeJobPaths(jobId, extension) {
  const jobDir = path.join(JOBS_DIR, jobId);
  const inputDir = path.join(jobDir, "input");
  const outputDir = path.join(jobDir, "output");
  const inputFile = path.join(inputDir, `source${extension}`);
  return { jobDir, inputDir, outputDir, inputFile };
}

async function ensureDirs() {
  await fs.mkdir(JOBS_DIR, { recursive: true });
}

async function cleanupJob(jobId) {
  const job = jobs.get(jobId);
  if (job?.cleanupTimer) {
    clearTimeout(job.cleanupTimer);
  }
  jobs.delete(jobId);
  const jobDir = path.join(JOBS_DIR, jobId);
  await fs.rm(jobDir, { recursive: true, force: true });
}

function scheduleCleanup(jobId, delay = JOB_TTL_MS) {
  const job = jobs.get(jobId);
  if (!job) return;
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(() => {
    void cleanupJob(jobId);
  }, delay);
}

function createDemucsEnv() {
  const env = { ...process.env };
  const ffmpegDir =
    typeof FFMPEG_BIN === "string" && FFMPEG_BIN.includes(path.sep) ? path.dirname(FFMPEG_BIN) : null;

  if (ffmpegDir) {
    const currentPath = env.PATH ?? "";
    const segments = currentPath.split(path.delimiter).filter(Boolean);

    if (!segments.includes(ffmpegDir)) {
      env.PATH = [ffmpegDir, ...segments].join(path.delimiter);
    }
  }

  // Demucs probes ffmpeg from the child process environment, so keep the
  // packaged binary visible even under LaunchAgent's minimal PATH.
  env.FFMPEG_BINARY = FFMPEG_BIN;
  env.FFPROBE_BINARY = FFPROBE_BIN;
  return env;
}

function probeCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function startDemucs(args, options = {}) {
  const process = spawn(PYTHON_BIN, [...DEMUCS_COMMAND, ...args], {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: DEMUCS_ENV,
    ...options,
  });

  const promise = new Promise((resolve, reject) => {
    const child = process;
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = stderr || stdout || `Demucs process exited with code ${code ?? "unknown"}`;
      if (signal) {
        reject(new Error(`Demucs process ${signal} ile durduruldu. ${detail}`));
        return;
      }
      reject(new Error(detail));
    });
  });

  return { process, promise };
}

async function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return false;

  if (job.cleanupTimer) {
    clearTimeout(job.cleanupTimer);
  }

  job.cancelled = true;

  if (job.process && !job.process.killed) {
    job.process.kill("SIGTERM");
    setTimeout(() => {
      if (job.process && !job.process.killed) {
        job.process.kill("SIGKILL");
      }
    }, 2_000);
  }

  await cleanupJob(jobId);
  return true;
}

function runDemucs(args, options = {}) {
  const { promise } = startDemucs(args, options);
  return promise;
}

function isPythonInstalled() {
  return probeCommand(PYTHON_BIN, ["--version"]).ok;
}

function isFfmpegInstalled() {
  return probeCommand(FFMPEG_BIN, ["-version"]).ok && probeCommand(FFPROBE_BIN, ["-version"]).ok;
}

function generateWarmupTone(outputFile) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      FFMPEG_BIN,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=20",
        "-ac",
        "2",
        "-ar",
        "44100",
        outputFile,
      ],
      { stdio: ["ignore", "ignore", "pipe"], shell: false }
    );

    let stderr = "";
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg warm-up tone generation failed with code ${code}`));
    });
  });
}

async function warmupModel() {
  warmupState = { status: "running", message: "Model warm-up çalışıyor." };
  const warmupDir = path.join(TMP_DIR, "warmup");
  const inputFile = path.join(warmupDir, "silence.wav");
  const outputDir = path.join(warmupDir, "out");

  await fs.rm(warmupDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await generateWarmupTone(inputFile);

  try {
    await runDemucs(["-o", outputDir, inputFile]);
    warmupState = { status: "ready", message: `Model hazır: ${MODEL_NAME}` };
    console.log(`[warmup] ${warmupState.message}`);
  } catch (error) {
    warmupState = {
      status: "error",
      message: error instanceof Error ? error.message : "Warm-up başarısız oldu.",
    };
    console.error(`[warmup] ${warmupState.message}`);
  } finally {
    await fs.rm(warmupDir, { recursive: true, force: true });
  }
}

app.use((request, response, next) => {
  const requestOrigin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
  const allowedOrigin = getAllowedOrigin(requestOrigin);

  setSecurityHeaders(response);

  if (requestOrigin && !allowedOrigin) {
    response.status(403).json({
      error: "Origin izinli değil.",
      allowedOrigins: runtimeConfig.allowedOrigins,
    });
    return;
  }

  setCors(response, allowedOrigin);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

app.get("/api/health", async (_request, response) => {
  response.json({
    ok: true,
    ffmpegInstalled: isFfmpegInstalled(),
    ffmpegBin: FFMPEG_BIN,
    ffprobeBin: FFPROBE_BIN,
    pythonInstalled: isPythonInstalled(),
    pythonBin: PYTHON_BIN,
    model: MODEL_NAME,
    warmup: warmupState,
    install: {
      helperVersion: runtimeConfig.helperVersion,
      platform: runtimeConfig.helperPlatform,
      configPath: runtimeConfig.configPath,
      baseDir: ROOT_DIR,
      allowedOrigins: runtimeConfig.allowedOrigins,
    },
  });
});

app.post("/api/split", upload.single("file"), async (request, response) => {
  const file = request.file;

  if (!file) {
    response.status(400).json({ error: "Ses dosyası bulunamadı." });
    return;
  }

  const extension = sanitizeExtension(file.originalname);
  if (!extension || !isAllowedMime(file.mimetype)) {
    response.status(400).json({ error: "Desteklenmeyen dosya türü." });
    return;
  }

  if (warmupState.status !== "ready") {
    response.status(503).json({ error: `Model henüz hazır değil. ${warmupState.message}` });
    return;
  }

  if (hasActiveProcessingJob()) {
    response.status(429).json({ error: "Şu anda başka bir stem separation işlemi çalışıyor. Lütfen mevcut iş tamamlanınca tekrar dene." });
    return;
  }

  const jobId = crypto.randomUUID();
  const paths = makeJobPaths(jobId, extension);

  await fs.mkdir(paths.inputDir, { recursive: true });
  await fs.mkdir(paths.outputDir, { recursive: true });
  await fs.writeFile(paths.inputFile, file.buffer);

  const job = {
    id: jobId,
    status: "processing",
    createdAt: Date.now(),
    fileName: file.originalname,
    progress: 2,
    progressMessage: "Stem separation başlatıldı.",
    logs: [],
    outputDir: paths.outputDir,
    downloaded: { vocals: false, instrumental: false },
    cleanupTimer: null,
    process: null,
    cancelled: false,
  };

  jobs.set(jobId, job);
  scheduleCleanup(jobId);

  const { process, promise } = startDemucs(["-o", paths.outputDir, paths.inputFile]);
  job.process = process;
  process.stderr.on("data", (chunk) => {
    if (!jobs.has(jobId) || job.cancelled) return;
    const text = chunk.toString();
    const nextProgress = extractProgressValue(text);
    if (nextProgress !== null) {
      job.progress = nextProgress;
    }
    const nextMessage = extractLastMessage(text);
    if (nextMessage) {
      job.progressMessage = nextMessage;
    }
  });

  promise
    .then(async ({ stdout, stderr }) => {
      if (!jobs.has(jobId) || job.cancelled) return;
      job.logs.push(stdout, stderr);
      const baseName = path.basename(paths.inputFile, extension);
      const resultDir = path.join(paths.outputDir, MODEL_NAME, baseName);
      const vocalsPath = path.join(resultDir, "vocals.mp3");
      const instrumentalPath = path.join(resultDir, "no_vocals.mp3");

      await fs.access(vocalsPath);
      await fs.access(instrumentalPath);

      job.status = "done";
      job.progress = 100;
      job.progressMessage = "Stem dosyaları hazır.";
      job.result = {
        vocals: { path: vocalsPath, fileName: `${path.basename(file.originalname, extension)}_vocals.mp3` },
        instrumental: {
          path: instrumentalPath,
          fileName: `${path.basename(file.originalname, extension)}_instrumental.mp3`,
        },
      };
      scheduleCleanup(jobId);
    })
    .catch((error) => {
      if (!jobs.has(jobId) || job.cancelled) return;
      job.status = "error";
      job.progress = 0;
      job.progressMessage = "Stem separation tamamlanamadı.";
      job.error = error instanceof Error ? error.message : "Stem separation başarısız oldu.";
      scheduleCleanup(jobId);
    })
    .finally(() => {
      if (jobs.has(jobId)) {
        job.process = null;
      }
    });

  response.status(202).json({ jobId });
});

app.post("/api/jobs/:jobId/cancel", async (request, response) => {
  const wasCancelled = await cancelJob(request.params.jobId);
  if (!wasCancelled) {
    response.status(404).json({ error: "Job bulunamadı." });
    return;
  }

  response.status(202).json({ ok: true });
});

app.get("/api/jobs/:jobId", (request, response) => {
  const job = jobs.get(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: "Job bulunamadı." });
    return;
  }

  response.json({
    id: job.id,
    status: job.status,
    error: job.error ?? null,
    fileName: job.fileName,
    progress: job.progress ?? 0,
    progressMessage: job.progressMessage ?? null,
    downloads:
      job.status === "done"
        ? {
            vocals: `/api/download/${job.id}/vocals`,
            instrumental: `/api/download/${job.id}/instrumental`,
          }
        : null,
  });
});

app.get("/api/download/:jobId/:stem", async (request, response) => {
  const job = jobs.get(request.params.jobId);
  if (!job || job.status !== "done" || !job.result) {
    response.status(404).json({ error: "Çıktı bulunamadı." });
    return;
  }

  const stem = request.params.stem === "vocals" ? "vocals" : request.params.stem === "instrumental" ? "instrumental" : null;
  if (!stem) {
    response.status(400).json({ error: "Geçersiz stem." });
    return;
  }

  const fileInfo = job.result[stem];
  response.download(fileInfo.path, fileInfo.fileName, async (error) => {
    if (error) return;
    job.downloaded[stem] = true;
    if (job.downloaded.vocals && job.downloaded.instrumental) {
      scheduleCleanup(job.id, 5_000);
    }
  });
});

app.listen(runtimeConfig.port, runtimeConfig.host, async () => {
  await ensureDirs();
  void warmupModel();
  console.log(`Stem Splitter backend listening on http://${runtimeConfig.host}:${runtimeConfig.port}`);
  console.log(`[config] ${runtimeConfig.configPath}`);
  console.log(`[runtime] baseDir=${ROOT_DIR}`);
  console.log(`[runtime] python=${PYTHON_BIN}`);
  console.log(`[runtime] ffmpeg=${FFMPEG_BIN}`);
  console.log(`[runtime] ffprobe=${FFPROBE_BIN}`);
});
