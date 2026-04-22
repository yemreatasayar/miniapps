import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = path.join(__dirname, "launcher-config.json");
const stateDir = path.join(__dirname, ".state");
const pidFile = path.join(stateDir, "miniapps-launcher.pid");
const logFile = path.join(stateDir, "miniapps-launcher.log");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".map": "application/json; charset=utf-8",
};

function ensureStateDir() {
  fs.mkdirSync(stateDir, { recursive: true });
}

function appendLog(message) {
  ensureStateDir();
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, "utf8");
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readExistingPid() {
  if (!fs.existsSync(pidFile)) return null;

  const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
  return Number.isFinite(pid) ? pid : null;
}

function writePid() {
  ensureStateDir();
  fs.writeFileSync(pidFile, `${process.pid}\n`, "utf8");
}

function clearPid() {
  fs.rmSync(pidFile, { force: true });
}

function createHeaders(extraHeaders = {}) {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  };
}

function loadConfig() {
  if (!fs.existsSync(configFile)) {
    throw new Error(`Missing launcher config: ${configFile}`);
  }

  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const servers = Array.isArray(config.servers)
    ? config.servers.map((server) => ({
        ...server,
        dir: path.resolve(__dirname, server.dir),
      }))
    : [];
  const helpers = Array.isArray(config.helpers)
    ? config.helpers.map((helper) => ({
        ...helper,
        script: path.resolve(__dirname, helper.script),
        cwd: helper.cwd ? path.resolve(__dirname, helper.cwd) : __dirname,
      }))
    : [];

  if (servers.length === 0) {
    throw new Error("Launcher config does not define any servers.");
  }

  return {
    targetUrl: config.targetUrl || "http://127.0.0.1:4310/",
    servers,
    helpers,
  };
}

function waitForLocalPort(port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

function resolveRequestedFile(baseDir, requestPath) {
  const normalizedPath = decodeURIComponent(requestPath.split("?")[0] || "/");
  const relativePath = normalizedPath === "/" ? "/index.html" : normalizedPath;
  const candidatePath = path.resolve(baseDir, `.${relativePath}`);

  if (!candidatePath.startsWith(baseDir)) {
    return null;
  }

  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return candidatePath;
  }

  const indexPath = path.join(baseDir, "index.html");
  return fs.existsSync(indexPath) ? indexPath : null;
}

function serveStatic({ name, port, dir, headers }) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Missing build output for ${name}: ${dir}`);
  }

  const server = http.createServer((request, response) => {
    const filePath = resolveRequestedFile(dir, request.url || "/");

    if (!filePath) {
      response.writeHead(404, createHeaders(headers));
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension] ?? "application/octet-stream";

    response.writeHead(200, createHeaders({ "Content-Type": contentType, ...headers }));
    fs.createReadStream(filePath).pipe(response);
  });

  server.listen(port, "127.0.0.1", () => {
    appendLog(`${name} listening on http://127.0.0.1:${port}/ from ${dir}`);
  });

  return server;
}

function startHelper(helper) {
  if (!fs.existsSync(helper.script)) {
    appendLog(`helper ${helper.name} script missing: ${helper.script}`);
    return null;
  }

  appendLog(`helper ${helper.name} starting via ${process.execPath} ${helper.script}`);

  const child = spawn(process.execPath, [helper.script, ...(helper.args ?? [])], {
    cwd: helper.cwd,
    env: {
      ...process.env,
      ...(helper.env ?? {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    const message = chunk.toString().trim();
    if (message) appendLog(`helper ${helper.name}: ${message}`);
  });

  child.stderr.on("data", (chunk) => {
    const message = chunk.toString().trim();
    if (message) appendLog(`helper ${helper.name} error: ${message}`);
  });

  child.on("exit", (code, signal) => {
    appendLog(`helper ${helper.name} exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
  });

  void waitForLocalPort(helper.port, helper.waitForPortTimeoutMs ?? 8000).then((available) => {
    appendLog(
      available
        ? `helper ${helper.name} reachable on http://127.0.0.1:${helper.port}/`
        : `helper ${helper.name} unavailable on port ${helper.port}`
    );
  });

  return child;
}

function start() {
  const existingPid = readExistingPid();
  if (existingPid && processExists(existingPid)) {
    console.error(`Miniapps launcher is already running with PID ${existingPid}.`);
    process.exit(1);
  }

  const config = loadConfig();

  writePid();
  appendLog(`launcher starting for ${config.targetUrl}`);

  const servers = config.servers.map(serveStatic);
  const helpers = config.helpers.map(startHelper).filter(Boolean);

  const shutdown = () => {
    appendLog("launcher shutting down");
    clearPid();
    for (const server of servers) {
      server.close();
    }
    for (const helper of helpers) {
      if (helper.pid && processExists(helper.pid)) {
        helper.kill("SIGTERM");
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("uncaughtException", (error) => {
    appendLog(`uncaught exception: ${error.stack || error.message}`);
    shutdown();
  });

  appendLog("launcher ready");
}

function stop() {
  const existingPid = readExistingPid();
  if (!existingPid || !processExists(existingPid)) {
    console.log("Miniapps launcher is not running.");
    clearPid();
    return;
  }

  process.kill(existingPid, "SIGTERM");
  console.log(`Sent SIGTERM to launcher PID ${existingPid}.`);
}

const command = process.argv[2] ?? "start";
if (command === "start") {
  start();
} else if (command === "stop") {
  stop();
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
