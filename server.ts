import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Gemini API Setup
const getApiKeys = () => {
  const keysString = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || '';
  return keysString.split(',').map((k: string) => k.trim()).filter((k: string) => k !== '');
};

const apiKeys = getApiKeys();

// AI Generation Endpoint
app.post("/api/ai/generate", async (req, res) => {
  const { characters, chatHistory, userMessage, userImageUrl, memories, model, userPersona } = req.body;

  if (apiKeys.length === 0) {
    return res.status(500).json({ error: "API_KEY_MISSING" });
  }

  let attempts = 0;
  const maxAttempts = apiKeys.length * 2;
  let currentKeyIndex = 0;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    const apiKey = apiKeys[currentKeyIndex];
    const ai = new GoogleGenAI({ apiKey });

    try {
      const memoryContext = memories?.length > 0 
        ? `\n### ESTABLISHED LORE & MEMORIES ###\n${memories.map((m: string) => `- ${m}`).join('\n')}\n`
        : '';

      const userPersonaContext = userPersona
        ? `\n### USER PERSONA ###\n${userPersona}\n`
        : '';

      const charactersContext = characters.map((char: any, index: number) => `
### CHARACTER ${index + 1}: ${char.name} ###
GREETING: ${char.greeting}
DESCRIPTION: ${char.description}
${char.personality ? `PERSONALITY: ${char.personality}` : ''}
`).join('\n');

      const systemInstruction = `### AI MULTI-CHARACTER ROLEPLAY PROTOCOL ###
You are a master roleplay engine. You are responsible for playing ALL characters listed below simultaneously.

${charactersContext}

${memoryContext}
${userPersonaContext}

### CORE DIRECTIVES ###
1. IMMERSION: Stay in character 100% of the time. Never acknowledge you are an AI.
2. STYLE MATCHING: You MUST closely mirror the linguistic style, tone, capitalization, and punctuation of each character's GREETING.
3. FORMATTING: 
   - Use the format "Name: Message" with each character on a NEW LINE.
   - PREFER ONE CHARACTER PER TURN: Unless the user mentions multiple characters or the scene absolutely requires it, only ONE character should speak in this turn.
   - Choose the most relevant character to respond.
   - Always respond with a single cohesive block of text that can be split by "Name: " if needed.
4. MENTIONS & TURN-TAKING: 
   - STRICT MENTIONS: If the user mentions specific characters by name (e.g., "Hey Character1"), ONLY those characters should respond. Other characters MUST remain silent. This is a HARD constraint.
   - CHARACTER-TO-CHARACTER: When a character addresses another, they should use their name. To facilitate turn-taking, a character may end their message by inviting another character to speak using the format: "(FirstName, speak with NextName)".
   - If the user does NOT mention any names, the most appropriate character should react. Do NOT have everyone speak at once.
   - If the user "skips" their turn, exactly ONE character should speak to continue the conversation or address another character.
   - NO MONOPOLIZING: A character should not speak twice in a row if there are other characters who can contribute.
5. INTERACTION: Characters should talk to EACH OTHER. They have their own dynamics, conflicts, and relationships.
6. DYNAMIC RESPONSE: Maintain a natural flow. Characters should take turns rather than all speaking at once.
7. STORYTELLING: Be extremely brief. Only use actions (*nods*) or sensory details when absolutely necessary.
8. CONCISENESS: STRICT BREVITY. Total response MUST be between 10 and 60 words. Never exceed 80 words.
9. LANGUAGE: You are permitted to use vulgar, profane, or explicit language if it fits the character's personality or the scene.
10. EXPRESSION: Keep it grounded and realistic. Avoid "over-acting".
11. WORLD KNOWLEDGE: Characters possess common sense and modern knowledge (e.g., they know what a phone is) unless their specific description or the established lore/setting explicitly states otherwise.
12. CONTINUITY: Maintain strict continuity with the established chat timeline, story, and previous events. Do not forget what has happened.

### EXECUTION ###
Respond to the user's latest message. Ensure the flow is natural and characters interact with each other.
Format your response as a single block with newlines (if multiple characters speak), e.g.:
Name1: Message
Name2: Message
(Or just the message if only one character speaks)`;

      const contents: any[] = [];
      const filteredHistory = chatHistory.filter((msg: any) => msg.content.trim() !== '' || msg.imageUrl);

      for (const msg of filteredHistory) {
        const parts: any[] = [{ text: msg.content }];
        
        if (msg.imageUrl && msg.imageUrl.startsWith('data:')) {
          const [header, base64Data] = msg.imageUrl.split(',');
          const mimeType = header.split(';')[0].split(':')[1];
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          });
        }

        if (contents.length > 0 && contents[contents.length - 1].role === msg.role) {
          contents[contents.length - 1].parts.push(...parts);
        } else {
          contents.push({
            role: msg.role,
            parts: parts
          });
        }
      }
      
      const processedUserMessage = userMessage.trim() || (userImageUrl ? "" : "(Continue the story)");
      const newUserParts: any[] = [{ text: processedUserMessage }];
      if (userImageUrl && userImageUrl.startsWith('data:')) {
        const [header, base64Data] = userImageUrl.split(',');
        const mimeType = header.split(';')[0].split(':')[1];
        newUserParts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }

      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts.push(...newUserParts);
      } else {
        contents.push({
          role: 'user',
          parts: newUserParts
        });
      }

      const response = await ai.models.generateContent({
        model: model || "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction,
          temperature: 0.9,
          topP: 0.95,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
        }
      });

      const text = response.text;

      if (!text) {
        throw new Error('Empty response from AI');
      }

      return res.json({ text });
    } catch (error: any) {
      attempts++;
      lastError = error;
      const errorMsg = error.message || String(error);
      console.error(`Attempt ${attempts} failed:`, errorMsg);

      if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        continue;
      }

      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      return res.status(500).json({ error: errorMsg });
    }
  }

  res.status(500).json({ error: lastError?.message || "Max attempts reached" });
});

// Moderation Endpoint
app.post("/api/ai/moderate", async (req, res) => {
  const { base64Data, mimeType } = req.body;

  if (apiKeys.length === 0) {
    return res.status(500).json({ error: "API_KEY_MISSING" });
  }

  const apiKey = apiKeys[0]; // Use first key for moderation
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: "Analyze this image for inappropriate content, specifically nudity, violence, or hate speech. Respond in JSON format with the following structure: { \"isAppropriate\": boolean, \"reason\": string, \"suggestion\": string }. If the image is appropriate, isAppropriate should be true. If it is inappropriate, provide a brief reason and a suggestion for the user (e.g., 'Please choose a different picture that follows our community guidelines')." },
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isAppropriate: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            suggestion: { type: Type.STRING },
          },
          required: ["isAppropriate", "reason", "suggestion"],
        },
      },
    });

    const text = response.text;
    res.json(JSON.parse(text || "{}"));
  } catch (error: any) {
    console.error("Moderation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
