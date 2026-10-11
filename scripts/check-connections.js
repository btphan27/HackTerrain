// Run:  node scripts/check-connections.js
// Tests the two things the games call from Node: the Hugging Face dataset API and Gemini.
require("dotenv").config();
const log = require("../services/log");
const ai = require("../services/ai");
(async () => {
  console.log("Node", process.version, "| model:", ai.MODEL, "| key set:", !!process.env.GEMINI_API_KEY, "\n");
  try {
    const t = Date.now();
    const r = await fetch("https://datasets-server.huggingface.co/splits?dataset=twangodev/devpost-hacks", { signal: AbortSignal.timeout(10000) });
    console.log(r.ok ? `Dataset OK (${Date.now() - t} ms)` : `Dataset FAILED: HTTP ${r.status}`);
  } catch (e) { console.log("Dataset FAILED:", log.why(e)); }
  try {
    const t = Date.now();
    const r = await fetch("https://generativelanguage.googleapis.com/", { signal: AbortSignal.timeout(10000) });
    console.log(`Google reachable (HTTP ${r.status}, ${Date.now() - t} ms)`);
  } catch (e) { console.log("Google NOT reachable:", log.why(e)); }
  const d = await ai.generateJson('Return {"ok":true}', (T) => ({ type: T.OBJECT, properties: { ok: { type: T.BOOLEAN } } }), "connection test");
  console.log(d ? "Gemini OK" : "Gemini FAILED (see the [Gemini] line above)");
})();
