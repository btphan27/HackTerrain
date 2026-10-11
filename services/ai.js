// One small helper for every Gemini call in the app.
// - Uses GEMINI_API_KEY (and optionally GEMINI_MODEL) from .env.
// - Returns null when there is no key, the package is missing, the call is too slow, or the
//   answer is not valid JSON. Callers then use their offline fallback, so nothing ever crashes.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash"; // check AI Studio for the current model name
// Structured JSON answers can take a while (models that "think" first are slower), so be patient.
// Change with GEMINI_TIMEOUT_MS in .env (milliseconds).
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 45000;
// Optional: GEMINI_THINKING_BUDGET=0 turns off "thinking" on models that support it (much faster).
// 2.5 Flash is switched off by default because these games do not need deep reasoning.
function thinkingConfig() {
  const env = process.env.GEMINI_THINKING_BUDGET;
  if (env !== undefined && env !== "") return { thinkingBudget: Number(env) };
  if (/2\.5-flash/.test(MODEL) && !/pro/.test(MODEL)) return { thinkingBudget: 0 };
  return undefined;
}

const log = require("./log");
let client = null;
let Type = null;
function getClient() {
  if (client) return client;
  if (!process.env.GEMINI_API_KEY) { log.once("Gemini", "no GEMINI_API_KEY in .env, using offline fallback questions"); return null; }
  try {
    const sdk = require("@google/genai");
    client = new sdk.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    Type = sdk.Type;
    return client;
  } catch (e) {
    console.error("Gemini unavailable (is @google/genai installed?):", e.message);
    return null;
  }
}

const enabled = () => !!getClient();

// buildSchema receives the SDK's Type helper and returns a response schema.
async function generateJson(prompt, buildSchema, label = "request") {
  const ai = getClient();
  if (!ai) return null;
  let timer;
  const t0 = Date.now();
  log("Gemini", `calling ${MODEL} for ${label}...`);
  try {
    const call = ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: Object.assign({ responseMimeType: "application/json", responseSchema: buildSchema(Type) },
        thinkingConfig() ? { thinkingConfig: thinkingConfig() } : {}),
    });
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Gemini timed out")), TIMEOUT_MS); });
    const response = await Promise.race([call, timeout]);
    const parsed = JSON.parse(response.text);
    log("Gemini", `${label} answered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return parsed;
  } catch (err) {
    log("Gemini", `FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s (${MODEL}): ${log.why(err)}. Using offline fallback.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { generateJson, enabled, MODEL };
