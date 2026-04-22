import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteRoot = path.join(__dirname, "site");
const port = Number(process.env.PORT || 4179);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
};

function resolveRequestPath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  let target = path.join(siteRoot, normalized);

  if (existsSync(target) && statSync(target).isDirectory()) {
    target = path.join(target, "index.html");
  } else if (!path.extname(target)) {
    const directoryIndex = path.join(target, "index.html");
    if (existsSync(directoryIndex)) {
      target = directoryIndex;
    }
  }

  return target;
}

const server = createServer((req, res) => {
  const target = resolveRequestPath(req.url || "/");

  if (!target.startsWith(siteRoot) || !existsSync(target) || statSync(target).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(target);
  const contentType = mimeTypes[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(readFileSync(target));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`GitHub Pages preview running at http://127.0.0.1:${port}/`);
});
