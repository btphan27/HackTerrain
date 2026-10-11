// Run:  node scripts/check-gemini.js
// Tells you whether your Gemini key + model work and how long a call takes.
require("dotenv").config();
const ai = require("../services/ai");

(async () => {
  console.log("Model:", ai.MODEL);
  console.log("Key set:", !!process.env.GEMINI_API_KEY);
  if (!ai.enabled()) { console.log("No GEMINI_API_KEY in .env, so the games use their offline questions."); return; }
  const t0 = Date.now();
  const out = await ai.generateJson('Return JSON with one field "ok" set to the word yes.', (T) => ({
    type: T.OBJECT, properties: { ok: { type: T.STRING } }, required: ["ok"],
  }));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(out ? `Gemini works. Answer: ${JSON.stringify(out)} (${secs}s)` : `Gemini FAILED after ${secs}s. The reason is printed above.`);
})();
