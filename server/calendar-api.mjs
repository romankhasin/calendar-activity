import http from "node:http";
import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const host = process.env.CALENDAR_HOST || "127.0.0.1";
const port = Number(process.env.CALENDAR_PORT || 3100);
const dataPath = process.env.CALENDAR_DATA_PATH || "/var/lib/calendar-api/calendar.json";
const allowedOrigin = process.env.CALENDAR_ALLOWED_ORIGIN || "https://romankhasin.github.io";
const maxBodyBytes = 2 * 1024 * 1024;
const maxBackups = 50;

function sendJson(response, status, body, origin = allowedOrigin) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function validPayload(payload) {
  return Boolean(payload && typeof payload === "object" && payload.months && typeof payload.months === "object");
}

async function readState() {
  return JSON.parse(await readFile(dataPath, "utf8"));
}

async function backupState(current) {
  const backupDir = join(dirname(dataPath), "backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  await copyFile(dataPath, join(backupDir, `calendar-${current.revision}-${stamp}.json`));
  const backups = (await readdir(backupDir)).filter(name => name.endsWith(".json")).sort();
  await Promise.all(backups.slice(0, Math.max(0, backups.length - maxBackups)).map(name => unlink(join(backupDir, name))));
}

async function writeState(next) {
  const tempPath = `${dataPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o640 });
  await rename(tempPath, dataPath);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error("Request is too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && origin !== allowedOrigin) return sendJson(response, 403, { error: "Origin is not allowed" });
  if (request.method === "OPTIONS") return sendJson(response, 204, null);

  try {
    if (request.method === "GET" && request.url === "/health") {
      return sendJson(response, 200, { ok: true });
    }
    if (request.url !== "/calendar") return sendJson(response, 404, { error: "Not found" });

    if (request.method === "GET") {
      return sendJson(response, 200, await readState());
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      if (!validPayload(body.payload) || !Number.isInteger(body.expectedRevision)) {
        return sendJson(response, 400, { error: "Invalid calendar payload" });
      }
      const current = await readState();
      if (Number(current.revision) !== body.expectedRevision) {
        return sendJson(response, 409, { error: "Revision conflict", revision: current.revision });
      }
      await backupState(current);
      const next = {
        revision: Number(current.revision) + 1,
        updated_at: new Date().toISOString(),
        payload: body.payload
      };
      await writeState(next);
      return sendJson(response, 200, { revision: next.revision, updated_at: next.updated_at });
    }
    return sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return sendJson(response, error.status || 500, { error: error.status ? error.message : "Internal server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Calendar API listening on http://${host}:${port}`);
});
