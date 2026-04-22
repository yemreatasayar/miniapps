import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import multer from "multer";

const app = express();

const PORT = 4195;
const ROOT_DIR = path.resolve("/Users/yusufemreatasayar/miniapps/stem-splitter/backend");
const TMP_DIR = path.join(ROOT_DIR, "tmp");
const JOBS_DIR = path.join(TMP_DIR, "jobs");
const MODEL_NAME = "htdemucs";
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
const PYTHON_BIN = path.join(ROOT_DIR, ".venv", "bin", "python3");
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

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "http://localhost:4194");
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

function startDemucs(args, options = {}) {
  const process = spawn(PYTHON_BIN, [...DEMUCS_COMMAND, ...args], {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
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

function isFfmpegInstalled() {
  const check = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", shell: false });
  return check.status === 0;
}

function generateWarmupTone(outputFile) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      "ffmpeg",
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
  setCors(response);
  setSecurityHeaders(response);
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
    pythonBin: PYTHON_BIN,
    model: MODEL_NAME,
    warmup: warmupState,
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

app.listen(PORT, "127.0.0.1", async () => {
  await ensureDirs();
  void warmupModel();
  console.log(`Stem Splitter backend listening on http://127.0.0.1:${PORT}`);
});
