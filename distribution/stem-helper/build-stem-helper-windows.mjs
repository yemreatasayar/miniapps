import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repoRoot, "distribution", "stem-helper-windows");
const artifactPath = path.join(__dirname, "stem-helper-windows.zip");
const runtimeDir = path.join(outputDir, "runtime");
const stemAppDir = path.join(runtimeDir, "stem", "app");
const pdfAppDir = path.join(runtimeDir, "pdf");
const nodeDir = path.join(runtimeDir, "node");
const templateDir = path.join(__dirname, "templates-windows");
const requiredNodeMajor = 24;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    const details = [
      result.error?.message,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}` +
        (details ? `\n${details}` : "")
    );
  }

  return result.stdout?.trim() ?? "";
}

function ensureDir(targetPath) {
  mkdirSync(targetPath, { recursive: true });
}

function copyRequired(sourcePath, targetPath) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing required file: ${sourcePath}`);
  }
  ensureDir(path.dirname(targetPath));
  copyFileSync(sourcePath, targetPath);
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function validateWindowsNode(nodePath) {
  if (process.platform !== "win32" || path.extname(nodePath).toLowerCase() !== ".exe") {
    throw new Error("The Windows helper package must be built on Windows with node.exe.");
  }

  const version = run(nodePath, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0], 10);
  if (major !== requiredNodeMajor) {
    throw new Error(`Node ${requiredNodeMajor}.x expected, received ${version || "unknown"}.`);
  }

  return version;
}

function installStemNodeDependencies() {
  const npmCliPath = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js"
  );
  if (!existsSync(npmCliPath)) {
    throw new Error(`npm CLI was not found beside the packaged Node runtime: ${npmCliPath}`);
  }
  run(
    process.execPath,
    [npmCliPath, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: stemAppDir }
  );
}

function writeManifest(nodePath, nodeVersion) {
  const manifest = {
    helperVersion: "0.2.0",
    platform: "windows-x64",
    builtAt: new Date().toISOString(),
    node: {
      version: nodeVersion,
      sha256: fileSha256(nodePath),
    },
    python: "3.11.x",
    ffmpeg: "WinGet Gyan.FFmpeg",
    libreOffice: "WinGet TheDocumentFoundation.LibreOffice",
    demucs: "4.0.1",
    torch: "2.8.0",
    torchaudio: "2.8.0",
  };

  writeFileSync(
    path.join(outputDir, "runtime-sources.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

function createArtifact() {
  rmSync(artifactPath, { force: true });
  run(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${outputDir.replaceAll("'", "''")}\\*' -DestinationPath '${artifactPath.replaceAll("'", "''")}' -Force`,
    ],
    { cwd: outputDir }
  );

  if (!existsSync(artifactPath) || statSync(artifactPath).size < 1_000_000) {
    throw new Error("Windows helper artifact was not created correctly.");
  }
}

function main() {
  const nodeSource = process.env.MINIAPPS_STEM_HELPER_WINDOWS_NODE_SRC || process.execPath;
  const nodeVersion = validateWindowsNode(nodeSource);

  rmSync(outputDir, { recursive: true, force: true });
  ensureDir(stemAppDir);
  ensureDir(pdfAppDir);
  ensureDir(nodeDir);
  ensureDir(path.join(outputDir, "logs"));

  copyRequired(nodeSource, path.join(nodeDir, "node.exe"));
  copyRequired(
    path.join(repoRoot, "stem-splitter", "backend", "server.mjs"),
    path.join(stemAppDir, "server.mjs")
  );
  copyRequired(
    path.join(repoRoot, "stem-splitter", "backend", "package.json"),
    path.join(stemAppDir, "package.json")
  );
  copyRequired(
    path.join(repoRoot, "stem-splitter", "backend", "package-lock.json"),
    path.join(stemAppDir, "package-lock.json")
  );
  copyRequired(
    path.join(repoRoot, "stem-splitter", "backend", "requirements-windows.txt"),
    path.join(stemAppDir, "requirements-windows.txt")
  );
  copyRequired(
    path.join(repoRoot, "pdf-compress-server", "server.mjs"),
    path.join(pdfAppDir, "server.mjs")
  );

  cpSync(templateDir, outputDir, { recursive: true });
  installStemNodeDependencies();
  writeManifest(path.join(nodeDir, "node.exe"), nodeVersion);
  createArtifact();

  console.log(`Windows helper package: ${artifactPath}`);
  console.log(`Artifact SHA-256: ${fileSha256(artifactPath)}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  const annotation = message.replaceAll("\r", "").replaceAll("\n", "%0A");
  console.error(`::error file=distribution/stem-helper/build-stem-helper-windows.mjs::${annotation}`);
  process.exitCode = 1;
}
