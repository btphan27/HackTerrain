import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const router = Router();

const loadLocalFallback = (mode) => {
  try {
    const filePath = path.join(process.cwd(), 'data', 'fallback-judging.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data[mode] || data['easy'] || null;
    }
  } catch (e) {
    console.error("❌ Error reading fallback-judging.json:", e.message);
  }
  
  // Ultimate safety fallback
  return {
    levelName: "Emergency Judge Sandbox",
    creeperName: "Bug Creeper",
    questions: [
      {
        id: 1,
        category: "Technical Architecture",
        prompt: "Where should client-side JavaScript event listeners be handled?",
        options: [
          { text: "Inside public/js files after DOM load", correct: true },
          { text: "Directly inside inline HTML header tags only", correct: false },
          { text: "Inside the server routing configuration", correct: false }
        ]
      }
    ]
  };
};

router.get('/level/:mode', async (req, res) => {
  const mode = req.params.mode;

  if (!process.env.GEMINI_API_KEY) {
    console.log("⚠️ No Gemini API key found, using local fallback.");
    return res.json(loadLocalFallback(mode));
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `
      You are generating content for a Minecraft-themed hackathon judging game called "Creeper Puncher".
      Generate 3 multiple-choice questions for the level mode: "${mode}" (where 'easy' is a chill sandbox with a Baby Creeper, and 'survival' is hardcore judges with a Charged Creeper).
      
      Return ONLY a valid JSON object matching this exact structure, with no markdown formatting blocks or extra text:
      {
        "levelName": "String description of level",
        "creeperName": "String name of creeper",
        "questions": [
          {
            "id": 1,
            "category": "Technical Judge",
            "prompt": "Question text...",
            "options": [
              { "text": "Option text", "correct": true },
              { "text": "Option text", "correct": false },
              { "text": "Option text", "correct": false }
            ]
          }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    let textResponse = response.text ? response.text.trim() : "";
    if (textResponse.startsWith("```json")) {
      textResponse = textResponse.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (textResponse.startsWith("```")) {
      textResponse = textResponse.replace(/^```/, "").replace(/```$/, "").trim();
    }

    return res.json(JSON.parse(textResponse));

  } catch (err) {
    console.warn("⚠️ Gemini generation failed, using local fallback:", err.message);
    return res.json(loadLocalFallback(mode));
  }
});

export default router;