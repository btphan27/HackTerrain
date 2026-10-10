from datasets import load_dataset
import json

HACKS = ["cal-hacks-12-0", "hackgt-12", "madhacks-fall-2025",
         "pennapps-xxv", "treehacks-2025"]
out = []
for h in HACKS:
    ds = load_dataset("twangodev/devpost-hacks", h, split="train")
    for r in ds:
        desc = (r.get("description") or "").strip()
        if not r["results"] or len(desc) < 200:
            continue
        out.append({
            "hackathon": h,
            "title": r.get("title") or "",
            "tagline": r.get("tagline") or "",
            "description": desc[:1200],
        })

with open("data/winners-2025.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print(len(out), "winning projects saved")