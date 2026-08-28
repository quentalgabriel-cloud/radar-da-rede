import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export const createRadarWebServer = ({ root = resolve(import.meta.dirname, "../dist") } = {}) =>
  createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const candidate = resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
    if (!candidate.startsWith(root)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      if (!(await stat(candidate)).isFile()) throw new Error("not_file");
      response.writeHead(200, {
        "content-type": contentTypes[extname(candidate)] ?? "application/octet-stream",
        "cache-control": pathname.startsWith("/data/") ? "no-store" : "public, max-age=300"
      });
      createReadStream(candidate).pipe(response);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? "4173");
  createRadarWebServer().listen(port, "127.0.0.1", () =>
    console.log(`Radar Web listening on http://127.0.0.1:${port}`)
  );
}
