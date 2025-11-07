
import Ajv from "ajv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "schemas", "person.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile({ type: "array", items: schema });

const store = new Map();

function hashKey(ssn, customerId) {
  const base = (ssn?.toString().replace(/\D/g, "") || "") + "::" + (customerId || "");
  return crypto.createHash("sha256").update(base).digest("hex");
}

export async function validateAndIngestDataset(records, ttlSeconds = 1800) {
  if (!validate(records)) {
    throw new Error("Dataset does not match expected schema");
  }
  const datasetId = crypto.randomUUID();
  const byKey = new Map();

  records.forEach((p) => {
    const ssn = (p.ssn || "").toString();
    const customerId = (p.customer_id || p.customerId || "").toString();
    const key = hashKey(ssn, customerId);
    p._keySafe = key;
    byKey.set(key, p);
  });

  store.set(datasetId, { expiresAt: Date.now() + ttlSeconds * 1000, byKey });
  setTimeout(() => store.delete(datasetId), ttlSeconds * 1000).unref();
  return datasetId;
}

export async function getPersonByKey(datasetId, { ssn, customerId }) {
  const ds = store.get(datasetId);
  if (!ds || ds.expiresAt < Date.now()) return null;
  const key = hashKey(ssn, customerId);
  return ds.byKey.get(key) || null;
}

export function getPersonBySafeKey(personKey) {
  for (const { byKey } of store.values()) {
    const p = byKey.get(personKey);
    if (p) return p;
  }
  return null;
}
