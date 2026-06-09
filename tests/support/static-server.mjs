import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const port = Number(process.argv[2] || 4173);
const root = resolve(".");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function resolveRequestPath(url) {
  const { pathname } = new URL(url, `http://127.0.0.1:${port}`);
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const relative = normalized === sep ? "index.html" : normalized.slice(1);
  const filePath = resolve(join(root, relative));
  if (!filePath.startsWith(root + sep) && filePath !== root) return null;
  return filePath;
}

const server = createServer((req, res) => {
  const filePath = resolveRequestPath(req.url || "/");
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let target = filePath;
  try {
    const stats = statSync(target);
    if (stats.isDirectory()) {
      target = join(target, "index.html");
      statSync(target);
    }
  } catch {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const contentType = mimeTypes[extname(target)] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  createReadStream(target).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Rain Math test server listening on http://127.0.0.1:${port}`);
});
