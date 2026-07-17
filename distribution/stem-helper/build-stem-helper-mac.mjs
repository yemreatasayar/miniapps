import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const sourceBackendDir = path.join(repoRoot, "stem-splitter", "backend");
const runtimeTemplateAppDir = path.join(__dirname, "runtime-template", "app");
const templateDir = path.join(__dirname, "templates");
const outputDir = path.join(repoRoot, "distribution", "stem-helper-mac");
const artifactPath = path.join(repoRoot, "distribution", "stem-helper", "stem-helper-macos.zip");
const outputRuntimeDir = path.join(outputDir, "runtime");
const outputAppDir = path.join(outputRuntimeDir, "app");
const outputLogsDir = path.join(outputDir, "logs");
const REQUIRED_NODE_MAJOR = 24;
const MINIMUM_FFMPEG_VERSION = [8, 1];
const allowDynamicFfmpeg = process.env.MINIAPPS_STEM_HELPER_ALLOW_DYNAMIC_FFMPEG === "1";

function ensureDir(targetPath) {
  mkdirSync(targetPath, { recursive: true });
}

function resetOutput() {
  rmSync(outputDir, { recursive: true, force: true });
  ensureDir(outputAppDir);
  ensureDir(outputLogsDir);
}

function copyRequiredFile(sourcePath, targetPath) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing required file: ${sourcePath}`);
  }

  ensureDir(path.dirname(targetPath));
  copyFileSync(sourcePath, targetPath);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

function commandVersion(command, args) {
  if (!command || !existsSync(command)) return null;
  return commandOutput(command, args)?.split(/\r?\n/)[0] ?? null;
}

function fileSha256(filePath) {
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) return null;
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function nonSystemMacDependencies(filePath) {
  if (process.platform !== "darwin" || !filePath || !existsSync(filePath)) return [];
  const output = commandOutput("otool", ["-L", filePath]);
  if (!output) return [];

  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(" (")[0])
    .filter(
      (dependency) =>
        dependency &&
        !dependency.startsWith("/usr/lib/") &&
        !dependency.startsWith("/System/Library/")
    );
}

function parseVersionTuple(value) {
  const match = String(value || "").match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return match ? match.slice(1, 4).map((entry) => Number.parseInt(entry || "0", 10)) : null;
}

function versionAtLeast(actual, minimum) {
  const tuple = parseVersionTuple(actual);
  if (!tuple) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    const current = tuple[index] || 0;
    if (current > minimum[index]) return true;
    if (current < minimum[index]) return false;
  }
  return true;
}

function validateRuntimeVersions(runtimes) {
  if (runtimes.node.sourcePath) {
    const nodeVersion = runtimes.node.version;
    const nodeMajor = parseVersionTuple(nodeVersion)?.[0];
    if (nodeMajor !== REQUIRED_NODE_MAJOR) {
      throw new Error(`Node ${REQUIRED_NODE_MAJOR}.x LTS expected, received: ${nodeVersion || "unknown"}`);
    }
  }

  if (
    runtimes.ffmpeg.sourcePath &&
    !versionAtLeast(runtimes.ffmpeg.version, MINIMUM_FFMPEG_VERSION)
  ) {
    throw new Error(`FFmpeg 8.1 or newer expected, received: ${runtimes.ffmpeg.version || "unknown"}`);
  }

  if (
    runtimes.ffprobe.sourcePath &&
    !versionAtLeast(runtimes.ffprobe.version, MINIMUM_FFMPEG_VERSION)
  ) {
    throw new Error(`FFprobe 8.1 or newer expected, received: ${runtimes.ffprobe.version || "unknown"}`);
  }

  if (runtimes.python.version && !runtimes.python.version.startsWith("Python 3.9.")) {
    throw new Error(`Packaged Demucs environment expects Python 3.9, received: ${runtimes.python.version}`);
  }

  for (const runtime of [runtimes.ffmpeg, runtimes.ffprobe]) {
    if (
      runtime.sourcePath &&
      runtime.dynamicDependencies.length > 0 &&
      !allowDynamicFfmpeg
    ) {
      throw new Error(
        `${path.basename(runtime.sourcePath)} is not portable; external dependencies detected: ` +
          `${runtime.dynamicDependencies.join(", ")}. Provide a self-contained runtime or set ` +
          "MINIAPPS_STEM_HELPER_ALLOW_DYNAMIC_FFMPEG=1 for a host-specific test build."
      );
    }
  }
}

function resolveSourcePath(value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function detectNodeSource() {
  const envSource = resolveSourcePath(process.env.MINIAPPS_STEM_HELPER_NODE_SRC);
  if (envSource) {
    return {
      envName: "MINIAPPS_STEM_HELPER_NODE_SRC",
      sourcePath: envSource,
      mode: "provided",
      note: "Using explicit node runtime source.",
      version: commandVersion(envSource, ["--version"]),
      sha256: fileSha256(envSource),
    };
  }

  const archBinary = process.arch === "arm64" ? "node-macos-arm64" : "node-macos-x64";
  const candidate = path.join(repoRoot, "local-runtime", "bin", archBinary);

  if (existsSync(candidate)) {
    return {
      envName: "MINIAPPS_STEM_HELPER_NODE_SRC",
      sourcePath: candidate,
      mode: "autodetected",
      note: `Auto-detected node runtime from local-runtime (${archBinary}).`,
      version: commandVersion(candidate, ["--version"]),
      sha256: fileSha256(candidate),
    };
  }

  return {
    envName: "MINIAPPS_STEM_HELPER_NODE_SRC",
    sourcePath: null,
    mode: "missing",
    note: "Node runtime source not found.",
    version: null,
    sha256: null,
  };
}

function detectFfmpegSource() {
  const envSource = resolveSourcePath(process.env.MINIAPPS_STEM_HELPER_FFMPEG_SRC);
  if (envSource) {
    return {
      envName: "MINIAPPS_STEM_HELPER_FFMPEG_SRC",
      sourcePath: envSource,
      mode: "provided",
      note: "Using explicit ffmpeg runtime source.",
      version: commandVersion(envSource, ["-version"]),
      sha256: fileSha256(envSource),
      dynamicDependencies: nonSystemMacDependencies(envSource),
    };
  }

  const whichFfmpeg = commandOutput("which", ["ffmpeg"]);
  if (whichFfmpeg && existsSync(whichFfmpeg)) {
    return {
      envName: "MINIAPPS_STEM_HELPER_FFMPEG_SRC",
      sourcePath: whichFfmpeg,
      mode: "autodetected",
      note: `Auto-detected ffmpeg from PATH (${whichFfmpeg}).`,
      version: commandVersion(whichFfmpeg, ["-version"]),
      sha256: fileSha256(whichFfmpeg),
      dynamicDependencies: nonSystemMacDependencies(whichFfmpeg),
    };
  }

  return {
    envName: "MINIAPPS_STEM_HELPER_FFMPEG_SRC",
    sourcePath: null,
    mode: "missing",
    note: "FFmpeg runtime source not found.",
    version: null,
    sha256: null,
    dynamicDependencies: [],
  };
}

function detectFfprobeSource(ffmpegRuntime) {
  const envSource = resolveSourcePath(process.env.MINIAPPS_STEM_HELPER_FFPROBE_SRC);
  if (envSource) {
    return {
      envName: "MINIAPPS_STEM_HELPER_FFPROBE_SRC",
      sourcePath: envSource,
      mode: "provided",
      note: "Using explicit ffprobe runtime source.",
      version: commandVersion(envSource, ["-version"]),
      sha256: fileSha256(envSource),
      dynamicDependencies: nonSystemMacDependencies(envSource),
    };
  }

  if (ffmpegRuntime?.sourcePath && existsSync(ffmpegRuntime.sourcePath)) {
    const candidate = path.join(path.dirname(ffmpegRuntime.sourcePath), "ffprobe");
    if (existsSync(candidate)) {
      return {
        envName: "MINIAPPS_STEM_HELPER_FFPROBE_SRC",
        sourcePath: candidate,
        mode: ffmpegRuntime.mode === "provided" ? "derived" : "autodetected",
        note: `Using ffprobe next to ffmpeg (${candidate}).`,
        version: commandVersion(candidate, ["-version"]),
        sha256: fileSha256(candidate),
        dynamicDependencies: nonSystemMacDependencies(candidate),
      };
    }
  }

  const whichFfprobe = commandOutput("which", ["ffprobe"]);
  if (whichFfprobe && existsSync(whichFfprobe)) {
    return {
      envName: "MINIAPPS_STEM_HELPER_FFPROBE_SRC",
      sourcePath: whichFfprobe,
      mode: "autodetected",
      note: `Auto-detected ffprobe from PATH (${whichFfprobe}).`,
      version: commandVersion(whichFfprobe, ["-version"]),
      sha256: fileSha256(whichFfprobe),
      dynamicDependencies: nonSystemMacDependencies(whichFfprobe),
    };
  }

  return {
    envName: "MINIAPPS_STEM_HELPER_FFPROBE_SRC",
    sourcePath: null,
    mode: "missing",
    note: "FFprobe runtime source not found.",
    version: null,
    sha256: null,
    dynamicDependencies: [],
  };
}

function detectPythonSource() {
  const envSource = resolveSourcePath(process.env.MINIAPPS_STEM_HELPER_PYTHON_SRC);
  if (envSource) {
    return {
      envName: "MINIAPPS_STEM_HELPER_PYTHON_SRC",
      sourcePath: envSource,
      mode: "provided",
      note: "Using explicit python runtime source.",
      pythonVersion: "3.9",
      version: null,
      packages: null,
    };
  }

  const localVenv = path.join(sourceBackendDir, ".venv");
  const localPython = path.join(localVenv, "bin", "python3");
  const sitePackagesPath = path.join(localVenv, "lib", "python3.9", "site-packages");

  if (existsSync(sitePackagesPath)) {
    let note = "Auto-detected python site-packages from stem-splitter/backend/.venv.";

    if (existsSync(localPython)) {
      const linkStat = lstatSync(localPython);
      if (linkStat.isSymbolicLink()) {
        const linkTarget = readlinkSync(localPython);
        const absoluteTarget = path.resolve(path.dirname(localPython), linkTarget);
        note = `${note} Host interpreter is external (${absoluteTarget}), so packaging will generate a version-checked shim.`;
      }
    }

    const packageVersions = existsSync(localPython)
      ? commandOutput(localPython, [
          "-c",
          "import demucs, torch, torchaudio; print(f'demucs={demucs.__version__};torch={torch.__version__};torchaudio={torchaudio.__version__}')",
        ])
      : null;

    return {
      envName: "MINIAPPS_STEM_HELPER_PYTHON_SRC",
      sourcePath: sitePackagesPath,
      mode: "autodetected",
      note,
      pythonVersion: "3.9",
      version: commandVersion(localPython, ["--version"]),
      packages: packageVersions,
    };
  }

  return {
    envName: "MINIAPPS_STEM_HELPER_PYTHON_SRC",
    sourcePath: null,
    mode: "missing",
    note: "Python runtime source not found.",
    version: null,
    packages: null,
  };
}

function copyRuntimeSource(runtime, targetPath, placeholderText) {
  if (!runtime.sourcePath) {
    ensureDir(path.dirname(targetPath));
    writeFileSync(`${targetPath}.placeholder.txt`, `${placeholderText}\n`, "utf8");
    return;
  }

  if (!existsSync(runtime.sourcePath)) {
    throw new Error(`Runtime source does not exist for ${runtime.envName}: ${runtime.sourcePath}`);
  }

  ensureDir(path.dirname(targetPath));
  const stats = statSync(runtime.sourcePath);

  if (stats.isDirectory()) {
    cpSync(runtime.sourcePath, targetPath, { recursive: true });
    return;
  }

  copyFileSync(runtime.sourcePath, targetPath);
}

function writePythonShim(runtime) {
  if (!runtime.sourcePath || !runtime.pythonVersion) {
    return;
  }

  const pythonRoot = path.join(outputRuntimeDir, "python");
  const sitePackagesTarget = path.join(pythonRoot, "lib", `python${runtime.pythonVersion}`, "site-packages");

  rmSync(pythonRoot, { recursive: true, force: true });
  ensureDir(path.join(pythonRoot, "bin"));
  ensureDir(path.dirname(sitePackagesTarget));
  cpSync(runtime.sourcePath, sitePackagesTarget, { recursive: true });

  const shim = `#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPECTED_PYTHON="${runtime.pythonVersion}"
SITE_PACKAGES="$SCRIPT_DIR/../lib/python${runtime.pythonVersion}/site-packages"
HOST_PYTHON=""

if [[ -x "/Library/Developer/CommandLineTools/usr/bin/python3" ]]; then
  HOST_PYTHON="/Library/Developer/CommandLineTools/usr/bin/python3"
else
  HOST_PYTHON="$(command -v python3 || true)"
fi

if [[ -z "$HOST_PYTHON" ]]; then
  echo "Python 3 interpreter not found on host."
  exit 1
fi

HOST_VERSION="$("$HOST_PYTHON" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')"
if [[ "$HOST_VERSION" != "$EXPECTED_PYTHON" ]]; then
  echo "Host python version $HOST_VERSION does not match required $EXPECTED_PYTHON."
  exit 1
fi

export PYTHONNOUSERSITE=1
export PYTHONPATH="$SITE_PACKAGES\${PYTHONPATH:+:$PYTHONPATH}"

exec "$HOST_PYTHON" "$@"
`;

  for (const binaryName of ["python3", "python", `python${runtime.pythonVersion}`]) {
    const binaryPath = path.join(pythonRoot, "bin", binaryName);
    writeFileSync(binaryPath, shim, "utf8");
    chmodSync(binaryPath, 0o755);
  }
}

function writeRuntimeManifest(runtimes) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    runtimes: Object.fromEntries(
      Object.entries(runtimes).map(([key, runtime]) => [
        key,
        {
          mode: runtime.mode,
          sourcePath: runtime.sourcePath,
          note: runtime.note,
          version: runtime.version ?? null,
          packages: runtime.packages ?? null,
          sha256: runtime.sha256 ?? null,
          dynamicDependencies: runtime.dynamicDependencies ?? [],
        },
      ])
    ),
  };

  writeFileSync(path.join(outputDir, "runtime-sources.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function writePackageReadme(runtimes) {
  const readme = `# Stem Helper for macOS

Bu klasor generated helper package iskeletidir.

Icerik:

- Install Stem Helper.command
- Uninstall Stem Helper.command
- runtime/app
- runtime/node
- runtime/python
- runtime/ffmpeg
- logs

Runtime kaynak durumu:

- node: ${runtimes.node.mode} - ${runtimes.node.note}
- python: ${runtimes.python.mode} - ${runtimes.python.note}
- ffmpeg: ${runtimes.ffmpeg.mode} - ${runtimes.ffmpeg.note}
- ffprobe: ${runtimes.ffprobe.mode} - ${runtimes.ffprobe.note}

Runtime surumleri:

- node: ${runtimes.node.version ?? "missing"}
- python: ${runtimes.python.version ?? "missing"}
- python packages: ${runtimes.python.packages ?? "missing"}
- ffmpeg: ${runtimes.ffmpeg.version ?? "missing"}
- ffprobe: ${runtimes.ffprobe.version ?? "missing"}

Not:

- Runtime env kaynaklari verilmediyse ilgili klasorlerde *.placeholder.txt dosyalari olusur.
- Python runtime placeholder varsa bu paket install edilir ama helper health check gecmez.
- Gercek runtime binary'leri packaging env ile tekrar build edilerek bu klasore yerlestirilmelidir.
- macOS helper dagitimi icin FFmpeg ve FFprobe self-contained olmalidir; Homebrew binary'leri host dylib'lerine bagli olabilir.
`;

  writeFileSync(path.join(outputDir, "README.md"), readme, "utf8");
}

function createZipArtifact() {
  rmSync(artifactPath, { force: true });

  let result;

  if (process.platform === "darwin") {
    result = spawnSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", outputDir, artifactPath], {
      cwd: path.dirname(outputDir),
      stdio: "inherit",
    });
  } else {
    result = spawnSync("zip", ["-qr", artifactPath, path.basename(outputDir)], {
      cwd: path.dirname(outputDir),
      stdio: "inherit",
    });
  }

  if (result.status !== 0) {
    throw new Error(`Failed to create stem helper zip artifact with exit code ${result.status ?? "unknown"}`);
  }
}

function installBackendNodeDependencies() {
  copyRequiredFile(path.join(sourceBackendDir, "package.json"), path.join(outputAppDir, "package.json"));

  const result = spawnSync(
    "npm",
    ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"],
    {
    cwd: outputAppDir,
    stdio: "inherit",
    env: process.env,
    }
  );

  if (result.status !== 0) {
    throw new Error(`npm ci for backend dependencies failed with exit code ${result.status ?? "unknown"}`);
  }
}

function main() {
  const runtimes = {
    node: detectNodeSource(),
    python: detectPythonSource(),
    ffmpeg: detectFfmpegSource(),
  };
  runtimes.ffprobe = detectFfprobeSource(runtimes.ffmpeg);
  validateRuntimeVersions(runtimes);
  resetOutput();

  copyRequiredFile(path.join(sourceBackendDir, "server.mjs"), path.join(outputAppDir, "server.mjs"));
  copyRequiredFile(path.join(sourceBackendDir, "requirements.txt"), path.join(outputAppDir, "requirements.txt"));
  copyRequiredFile(path.join(sourceBackendDir, "package-lock.json"), path.join(outputAppDir, "package-lock.json"));
  installBackendNodeDependencies();
  copyRequiredFile(
    path.join(runtimeTemplateAppDir, "helper-config.template.json"),
    path.join(outputAppDir, "helper-config.template.json")
  );
  copyRequiredFile(
    path.join(templateDir, "Install Stem Helper.command"),
    path.join(outputDir, "Install Stem Helper.command")
  );
  copyRequiredFile(
    path.join(templateDir, "Uninstall Stem Helper.command"),
    path.join(outputDir, "Uninstall Stem Helper.command")
  );
  copyRequiredFile(
    path.join(templateDir, "com.miniapps.stem-helper.plist.template"),
    path.join(outputDir, "com.miniapps.stem-helper.plist.template")
  );
  chmodSync(path.join(outputDir, "Install Stem Helper.command"), 0o755);
  chmodSync(path.join(outputDir, "Uninstall Stem Helper.command"), 0o755);

  copyRuntimeSource(
    runtimes.node,
    path.join(outputRuntimeDir, "node", "bin", "node"),
    "Node runtime source not provided. Set MINIAPPS_STEM_HELPER_NODE_SRC and rebuild."
  );
  if (runtimes.python.sourcePath && runtimes.python.pythonVersion) {
    writePythonShim(runtimes.python);
  } else {
    copyRuntimeSource(
      runtimes.python,
      path.join(outputRuntimeDir, "python"),
      "Python runtime source not provided. Set MINIAPPS_STEM_HELPER_PYTHON_SRC to a portable runtime and rebuild."
    );
  }
  copyRuntimeSource(
    runtimes.ffmpeg,
    path.join(outputRuntimeDir, "ffmpeg", "bin", "ffmpeg"),
    "FFmpeg runtime source not provided. Set MINIAPPS_STEM_HELPER_FFMPEG_SRC and rebuild."
  );
  copyRuntimeSource(
    runtimes.ffprobe,
    path.join(outputRuntimeDir, "ffmpeg", "bin", "ffprobe"),
    "FFprobe runtime source not provided. Set MINIAPPS_STEM_HELPER_FFPROBE_SRC or provide ffprobe next to ffmpeg and rebuild."
  );

  writeRuntimeManifest(runtimes);
  writePackageReadme(runtimes);
  createZipArtifact();

  console.log(`Stem helper macOS package skeleton generated at ${outputDir}`);
  console.log(`Stem helper macOS zip artifact generated at ${artifactPath}`);
  console.log(`Node runtime: ${runtimes.node.note}`);
  console.log(`Python runtime: ${runtimes.python.note}`);
  console.log(`FFmpeg runtime: ${runtimes.ffmpeg.note}`);
  console.log(`FFprobe runtime: ${runtimes.ffprobe.note}`);
}

main();
