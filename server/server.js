
import express from "express";
import crypto from "crypto";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { validateAndIngestDataset, getPersonByKey } from "./services/datastore.js";
import { generateQuestions, swapQuestion, validateAnswers } from "./engine/kbaEngine.js";
import { writeAudit } from "./services/audit.js";
import { requireBearer } from "./middleware/auth.js";
import { getPolicy, setPolicy } from "./engine/policy.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: [/localhost:\d+$/], credentials: false }));
app.use(express.json({ limit: "2mb" }));
app.set("trust proxy", 1);

app.use(rateLimit({ windowMs: 60_000, max: 120 }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Policy endpoints
app.get("/api/policy", requireBearer, (_req, res) => {
  res.json(getPolicy());
});
app.post("/api/policy", requireBearer, (req, res) => {
  const updated = setPolicy(req.body || {});
  writeAudit({ action: "policy_update", meta: updated });
  res.json(updated);
});

// Upload dataset
app.post("/api/dataset/upload", requireBearer, async (req, res) => {
  try {
    const { records, ttlSeconds = 1800 } = req.body;
    const datasetId = await validateAndIngestDataset(records, ttlSeconds);
    await writeAudit({
      action: "dataset_upload",
      datasetId,
      meta: { count: Array.isArray(records) ? records.length : 0 }
    });
    res.json({ datasetId, expiresIn: ttlSeconds });
  } catch (e) {
    res.status(400).json({ error: e.message || "Invalid dataset" });
  }
});

// Start KBA session
app.post("/api/kba/start", requireBearer, async (req, res) => {
  try {
    const { datasetId, ssn, customerId } = req.body;
    if (!datasetId || (!ssn && !customerId)) {
      return res.status(400).json({ error: "datasetId and (ssn OR customerId) are required" });
    }
    const person = await getPersonByKey(datasetId, { ssn, customerId });
    if (!person) return res.status(404).json({ error: "Person not found" });

    const policy = getPolicy();
    const { questions, personKey } = generateQuestions(person, policy);
    const sessionId = crypto.randomUUID();

    await writeAudit({
      action: "kba_start",
      datasetId,
      sessionId,
      subjectKey: personKey,
      meta: { qCount: questions.length }
    });

    res.json({ sessionId, questions, policy });
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not start KBA" });
  }
});

// Swap question
app.post("/api/kba/swap", requireBearer, async (req, res) => {
  try {
    const { datasetId, sessionId, personKey, question } = req.body;
    if (!datasetId || !sessionId || !personKey || !question) {
      return res.status(400).json({ error: "datasetId, sessionId, personKey, question required" });
    }
    const newQ = swapQuestion(personKey, question);
    await writeAudit({ action: "kba_swap", datasetId, sessionId, subjectKey: personKey, meta: { type: question.type } });
    res.json({ question: newQ });
  } catch (e) {
    res.status(400).json({ error: e.message || "Swap failed" });
  }
});

// Submit answers
app.post("/api/kba/submit", requireBearer, async (req, res) => {
  try {
    const { datasetId, sessionId, personKey, answers } = req.body;
    if (!datasetId || !sessionId || !personKey || !Array.isArray(answers)) {
      return res.status(400).json({ error: "datasetId, sessionId, personKey, answers[] required" });
    }
    const policy = getPolicy();
    const result = validateAnswers(personKey, answers, policy);

    await writeAudit({
      action: "kba_submit",
      datasetId,
      sessionId,
      subjectKey: personKey,
      meta: {
        correct: result.correct,
        incorrect: result.incorrect,
        declined: result.declined,
        status: result.status
      }
    });

    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || "Validation failed" });
  }
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`KBA server listening on :${PORT}`));
