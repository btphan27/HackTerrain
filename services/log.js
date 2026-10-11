// Tiny terminal logger so you can see what the server is calling: [Gemini], [Dataset], [Game]
const t = () => new Date().toLocaleTimeString();
const log = (tag, msg) => console.log(`${t()}  [${tag}] ${msg}`);
const once = new Set();
log.once = (tag, msg) => { const k = tag + msg; if (!once.has(k)) { once.add(k); log(tag, msg); } };
module.exports = log;

// Turns a vague error ("fetch failed") into the real reason plus a plain-English hint.
log.why = (err) => {
  const c = (err && err.cause) || {};
  const code = c.code || err.code || "";
  const status = err.status || err.code;
  const msg = [err.message, c.message && c.message !== err.message ? c.message : "", code].filter(Boolean).join(" | ");
  let hint = "";
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) hint = "DNS/no internet from Node: check wifi, VPN, or try another network";
  else if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|UND_ERR_CONNECT_TIMEOUT/.test(code)) hint = "connection blocked: firewall, VPN, school/work wifi or antivirus";
  else if (/CERT|SELF_SIGNED|LEAF_SIGNATURE|ISSUER/.test(code)) hint = "SSL inspection by antivirus/school network: set NODE_EXTRA_CA_CERTS to your network's certificate, or use another network";
  else if (/API key|API_KEY|\b400\b|INVALID_ARGUMENT/i.test(msg)) hint = "GEMINI_API_KEY looks invalid: make a new key in Google AI Studio and paste it in .env";
  else if (/\b404\b|NOT_FOUND|not found/i.test(msg)) hint = "that model name does not exist: set GEMINI_MODEL=gemini-2.5-flash in .env";
  else if (/\b403\b|PERMISSION/i.test(msg)) hint = "key not allowed for this model/region";
  else if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg)) hint = "rate limit/quota used up: wait a minute or check AI Studio quota";
  else if (/timed out|timeout/i.test(msg)) hint = "too slow: raise GEMINI_TIMEOUT_MS in .env";
  return msg + (hint ? "  -> " + hint : "");
};
