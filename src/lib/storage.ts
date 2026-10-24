import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./crypto";

// shortcut: local-disk storage only; add an S3/R2 driver here before deploying to serverless hosting.
const root = () => path.resolve(process.env.STORAGE_DIR || ".storage");

function safePath(key: string) {
  const p = path.resolve(root(), key);
  if (!p.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return p;
}

export async function putFile(tenantId: string, name: string, data: Buffer | Uint8Array): Promise<string> {
  const ext = path.extname(name).replace(/[^.\w]/g, "").slice(0, 10);
  const key = `${tenantId}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}${ext}`;
  const p = safePath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
  return key;
}

/** Reads a file; the key must belong to the tenant (keys are prefixed with tenant id). */
export async function getFile(tenantId: string, key: string): Promise<Buffer> {
  if (!key.startsWith(tenantId + "/")) throw new Error("Not found");
  return readFile(safePath(key));
}

export async function deleteFile(tenantId: string, key: string) {
  if (key.startsWith(tenantId + "/")) await unlink(safePath(key)).catch(() => {});
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif|heic)|application\/pdf|text\/plain|text\/csv)$/;
