import { createReadStream, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const port = Number(process.argv[2] || 4173);
const root = resolve(".");

// Live-reload is opt-in (LIVERELOAD=1, set by `npm run dev`). When off, this
// server is byte-for-byte the plain static host Playwright/`npm start` use.
const liveReload = process.env.LIVERELOAD === "1" || process.argv.includes("--reload");

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

// Small client that reconnects automatically and reloads on a change event.
const LIVE_RELOAD_SNIPPET = `\n<script>
(() => {
  const es = new EventSource("/__livereload");
  es.onmessage = (e) => { if (e.data === "reload") location.reload(); };
})();
</script>\n`;

const reloadClients = new Set();

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
  // Server-Sent-Events channel for live-reload (dev only).
  if (liveReload && (req.url || "").startsWith("/__livereload")) {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    reloadClients.add(res);
    req.on("close", () => reloadClients.delete(res));
    return;
  }

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
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });

  // In dev, inject the reload client into HTML; otherwise stream untouched.
  if (liveReload && extname(target) === ".html") {
    let html = readFileSync(target, "utf8");
    html = html.includes("</body>")
      ? html.replace("</body>", `${LIVE_RELOAD_SNIPPET}</body>`)
      : html + LIVE_RELOAD_SNIPPET;
    res.end(html);
    return;
  }
  createReadStream(target).pipe(res);
});

if (liveReload) {
  const ignored = /(^|[/\\])(node_modules|\.git|test-results|coverage|playwright-report|blob-report)([/\\]|$)/;
  let timer = null;
  try {
    watch(root, { recursive: true }, (_event, filename) => {
      if (!filename || ignored.test(filename.toString())) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const client of reloadClients) client.write("data: reload\n\n");
      }, 120);
    });
  } catch {
    console.warn("Live-reload file watching unavailable on this platform; serving without it.");
  }
}

server.listen(port, "127.0.0.1", () => {
  console.log(`Rain Math server listening on http://127.0.0.1:${port}${liveReload ? " (live-reload on)" : ""}`);
});
