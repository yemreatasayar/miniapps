import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = "/Users/yusufemreatasayar/miniapps";
const sourceExecutable = path.join(repoRoot, "pdf-compress-server", "bin", "gs");
const outputExecutable = path.join(repoRoot, "pdf-compress-server", "bin", "gs-macos-arm64");
const outputLibDir = path.join(repoRoot, "pdf-compress-server", "lib");

function listDependencies(filePath) {
  const output = execFileSync("otool", ["-L", filePath], { encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(" (")[0])
    .filter(Boolean);
}

function resolveDependencyPath(rawDependency, parentFile) {
  if (rawDependency.startsWith("/opt/homebrew/") || rawDependency.startsWith("/usr/lib/")) {
    return rawDependency;
  }

  if (rawDependency.startsWith("@loader_path/")) {
    return path.resolve(path.dirname(parentFile), rawDependency.slice("@loader_path/".length));
  }

  if (rawDependency.startsWith("@rpath/")) {
    const relativeName = rawDependency.slice("@rpath/".length);
    const candidates = [
      path.resolve(path.dirname(parentFile), relativeName),
      path.join("/opt/homebrew/lib", relativeName),
      path.join("/opt/homebrew/opt/webp/lib", relativeName),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  return null;
}

function isHomebrewDependency(filePath) {
  return filePath?.startsWith("/opt/homebrew/");
}

function collectDependencyClosure(entryPath) {
  const queue = [entryPath];
  const visited = new Set();
  const dependencies = new Set();

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    for (const rawDependency of listDependencies(current)) {
      const resolvedDependency = resolveDependencyPath(rawDependency, current);
      if (!isHomebrewDependency(resolvedDependency) || dependencies.has(resolvedDependency)) continue;
      dependencies.add(resolvedDependency);
      queue.push(resolvedDependency);
    }
  }

  return [...dependencies].sort();
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function copyFile(sourcePath, destinationPath) {
  ensureDirectory(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
  fs.chmodSync(destinationPath, 0o755);
}

function runInstallNameTool(args) {
  execFileSync("install_name_tool", args, { stdio: "inherit" });
}

function bundleGhostscript() {
  if (!fs.existsSync(sourceExecutable)) {
    throw new Error(`Ghostscript source executable missing: ${sourceExecutable}`);
  }

  ensureDirectory(outputLibDir);
  copyFile(sourceExecutable, outputExecutable);

  const dependencyClosure = collectDependencyClosure(sourceExecutable);
  const destinationForOriginal = new Map();

  for (const dependency of dependencyClosure) {
    const destination = path.join(outputLibDir, path.basename(dependency));
    copyFile(dependency, destination);
    destinationForOriginal.set(dependency, destination);
  }

  for (const dependency of dependencyClosure) {
    const destination = destinationForOriginal.get(dependency);
    if (!destination) continue;

    runInstallNameTool(["-id", `@loader_path/${path.basename(destination)}`, destination]);
  }

  for (const dependency of dependencyClosure) {
    const destination = destinationForOriginal.get(dependency);
    if (!destination) continue;

    for (const rawDependency of listDependencies(dependency)) {
      const resolvedDependency = resolveDependencyPath(rawDependency, dependency);
      const nestedDestination = destinationForOriginal.get(resolvedDependency);
      if (!nestedDestination) continue;

      runInstallNameTool(
        [
          "-change",
          rawDependency,
          `@loader_path/${path.basename(nestedDestination)}`,
          destination,
        ]
      );
    }
  }

  for (const rawDependency of listDependencies(sourceExecutable)) {
    const resolvedDependency = resolveDependencyPath(rawDependency, sourceExecutable);
    const destination = destinationForOriginal.get(resolvedDependency);
    if (!destination) continue;

    runInstallNameTool(
      [
        "-change",
        rawDependency,
        `@executable_path/../lib/${path.basename(destination)}`,
        outputExecutable,
      ]
    );
  }

  console.log(`Bundled Ghostscript executable: ${outputExecutable}`);
  console.log(`Bundled dylib count: ${dependencyClosure.length}`);
}

bundleGhostscript();
