import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getFallbackRound = (level) => {
  try {
    const filePath = path.resolve('data/fallback-mvp.json');
    if (fs.existsSync(filePath)) {
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const item = fileData[Math.floor(Math.random() * fileData.length)];
      item.response.difficulty = level || 'medium';
      return item.response;
    }
  } catch (e) {
    // Fall back to hardcoded default if file read fails
  }

  return {
    brief: "Gemini timed out, so you're on emergency offline mode! Build a simple functional MVP.",
    teamSize: 2,
    hoursAvailable: 24,
    difficulty: level || 'medium',
    features: [
      { id: "f1", name: "User Auth", description: "Login and signup flow" },
      { id: "f2", name: "Dashboard", description: "Main overview screen" },
      { id: "f3", name: "AI Integration", description: "Connect to external model" }
    ],
    shippedIds: ["f1", "f2"],
    hints: ["Focus on core screens first.", "Cut complex extras."],
    shippedNote: "Keeping auth and dashboard gets you a working demo."
  };
};

router.post('/generate', async (req, res) => {
  const { projectData, level } = req.body;
  console.log("⚡ HIT /api/mvp/generate route for:", projectData.title);

  // Strict 4-second timeout promise so the request never hangs
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Gemini API timeout")), 4000)
  );

  try {
    const prompt = `Generate an MVP scoping challenge for this hackathon project:
    Title: ${projectData.title}
    Description: ${projectData.description}
    Difficulty level: ${level}
    Return valid JSON.`;

    const aiPromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    // Race between Gemini and the 4-second timer
    const response = await Promise.race([aiPromise, timeoutPromise]);
    const result = JSON.parse(response.text);
    result.difficulty = level || 'medium';
    return res.json(result);

  } catch (err) {
    console.warn("⚠️ Gemini API took too long or failed:", err.message);
    // Instantly serve local data so the browser never experiences a timeout
    const fallback = getFallbackRound(level);
    return res.json(fallback);
  }
});

export default router;