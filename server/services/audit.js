
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_PATH = path.join(__dirname, "..", "audit.log");

export async function writeAudit(evt) {
  const line = { ts: new Date().toISOString(), id: crypto.randomUUID(), ...evt };
  fs.appendFileSync(AUDIT_PATH, JSON.stringify(line) + "\n", { encoding: "utf-8" });
}
