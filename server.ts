import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Helper to get Gemini client
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || (process.env.GEMINI_KEYS ? process.env.GEMINI_KEYS.split(',')[0]?.trim() : '');
  if (!apiKey) {
    console.warn("Warning: GEMINI_API_KEY is not set in environment.");
  }
  return new GoogleGenAI({ apiKey: apiKey || '' });
}

// Build system instructions for roleplay
function buildSystemInstruction(
  characters: any[] = [],
  memories: string[] = [],
  userPersona?: string,
  customAiInstructions?: string,
  aiInstructionsEnabled?: boolean,
  aiInstructionsMode: string = 'append'
): string {
  const memoryContext = memories?.length > 0 
    ? `\n### ESTABLISHED LORE & MEMORIES ###\n${memories.map((m: string) => `- ${m}`).join('\n')}\n`
    : '';

  const userPersonaContext = userPersona
    ? `\n### USER PERSONA ###\n${userPersona}\n`
    : '';

  const charactersContext = characters.map((char: any, index: number) => `
### CHARACTER ${index + 1}: ${char.name} ###
GREETING: ${char.greeting || ''}
DESCRIPTION: ${char.description || ''}
${char.personality ? `PERSONALITY: ${char.personality}` : ''}
`).join('\n');

  let systemInstruction = `### AI MULTI-CHARACTER ROLEPLAY PROTOCOL ###
You are a master roleplay engine. You are responsible for playing ALL characters listed below simultaneously.

${charactersContext}

${memoryContext}
${userPersonaContext}
`;

  const defaultDirectives = `### CORE DIRECTIVES ###
1. IMMERSION: Stay in character 100% of the time. Never acknowledge you are an AI.
2. STYLE MATCHING: You MUST closely mirror the linguistic style, tone, capitalization, and punctuation of each character's GREETING.
3. FORMATTING: 
   - Use the format "Name: Message" with each character on a NEW LINE.
   - PREFER ONE CHARACTER PER TURN: Unless the user mentions multiple characters or the scene absolutely requires it, only ONE character should speak in this turn.
   - Choose the most relevant character to respond.
   - Always respond with a single cohesive block of text that can be split by "Name: " if needed.
   - NEVER include meta-commentary, turn-taking prompts, or instructions like "(Character, talk with Character)".
4. MENTIONS & TURN-TAKING: 
   - STRICT MENTIONS: If the user mentions specific characters by name (e.g., "Hey Character1"), ONLY those characters should respond. Other characters MUST remain silent. This is a HARD constraint.
   - CHARACTER-TO-CHARACTER: When a character addresses another, they should use their name. Characters should interact naturally and instantly without needing to invite others to speak.
   - If the user does NOT mention any names, the most appropriate character should react. Do NOT have everyone speak at once.
   - If the user "skips" their turn, exactly ONE character should speak to continue the conversation or address another character.
   - NO MONOPOLIZING: A character should not speak twice in a row if there are other characters who can contribute.
5. INTERACTION: Characters should talk to EACH OTHER. They have their own dynamics, conflicts, and relationships.
6. DYNAMIC RESPONSE: Maintain a natural flow. Characters should take turns rather than all speaking at once.
7. STORYTELLING: Be extremely brief. Only use actions (*nods*) or sensory details when absolutely necessary.
8. CONCISENESS: STRICT BREVITY. Total response MUST be between 10 and 60 words. Never exceed 80 words.
9. LANGUAGE: You are permitted to use vulgar, profane, or explicit language if it fits the character's personality or the scene.
10. EXPRESSION: Keep it grounded and realistic. Avoid "over-acting".
11. LINE BREAKS: Talk in lines. Use frequent line breaks and paragraph breaks (e.g. after every 1-2 sentences) to make messages easy to read on mobile.
12. WORLD KNOWLEDGE: Characters possess common sense and modern knowledge (e.g., they know what a phone is) unless their specific description or the established lore/setting explicitly states otherwise.
13. CONTINUITY: Maintain strict continuity with the established chat timeline, story, and previous events. Do not forget what has happened.
14. ACTIONS: You may optionally react to the latest user message by including "<react>👍</react>" (where 👍 is a single emoji) anywhere in your text. Only use this if you want to react.

### EXECUTION ###
Respond to the user's latest message. Ensure the flow is natural and characters interact with each other.
Format your response as a single block with newlines (if multiple characters speak), e.g.:
Name1: Message
Name2: Message
(Or just the message if only one character speaks)`;

  if (customAiInstructions && aiInstructionsEnabled) {
    if (aiInstructionsMode === 'override') {
      systemInstruction += `\n### OVERRIDDEN CUSTOM AI DIRECTIVES ###\n${customAiInstructions}\n`;
    } else if (aiInstructionsMode === 'prepend') {
      systemInstruction += `\n### CUSTOM AI DIRECTIVES (HIGH PRIORITY) ###\n${customAiInstructions}\n\n${defaultDirectives}`;
    } else {
      systemInstruction += `\n${defaultDirectives}\n\n### ADDITIONAL CUSTOM DIRECTIVES ###\n${customAiInstructions}`;
    }
  } else {
    systemInstruction += `\n${defaultDirectives}`;
  }

  return systemInstruction;
}

// Build contents array from history and message
function buildContents(chatHistory: any[] = [], userMessage: string = '', userImageUrl?: string): any[] {
  const contents: any[] = [];
  const filteredHistory = (chatHistory || []).filter((msg: any) => (msg.content && msg.content.trim() !== '') || msg.imageUrl);

  for (const msg of filteredHistory) {
    const parts: any[] = [{ text: msg.content || '' }];
    
    if (msg.imageUrl && typeof msg.imageUrl === 'string' && msg.imageUrl.startsWith('data:')) {
      const [header, base64Data] = msg.imageUrl.split(',');
      if (header && base64Data) {
        const mimeType = header.split(';')[0]?.split(':')[1] || 'image/jpeg';
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }
    }

    if (contents.length > 0 && contents[contents.length - 1].role === msg.role) {
      contents[contents.length - 1].parts.push(...parts);
    } else {
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: parts
      });
    }
  }
  
  const processedUserMessage = (userMessage || '').trim() || (userImageUrl ? "" : "(Continue the story)");
  const newUserParts: any[] = [{ text: processedUserMessage }];
  
  if (userImageUrl && typeof userImageUrl === 'string' && userImageUrl.startsWith('data:')) {
    const [header, base64Data] = userImageUrl.split(',');
    if (header && base64Data) {
      const mimeType = header.split(';')[0]?.split(':')[1] || 'image/jpeg';
      newUserParts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }
  }

  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts.push(...newUserParts);
  } else {
    contents.push({
      role: 'user',
      parts: newUserParts
    });
  }

  return contents;
}

// --- API ROUTES FIRST ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Streaming character response
app.post("/api/chat/stream", async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const {
      characters = [],
      chatHistory = [],
      userMessage = '',
      userImageUrl,
      memories = [],
      model = 'gemini-3-flash-preview',
      userPersona,
      customAiInstructions,
      aiInstructionsEnabled,
      aiInstructionsMode
    } = req.body;

    const systemInstruction = buildSystemInstruction(
      characters,
      memories,
      userPersona,
      customAiInstructions,
      aiInstructionsEnabled,
      aiInstructionsMode
    );

    const contents = buildContents(chatHistory, userMessage, userImageUrl);
    const ai = getGeminiClient();

    const responseStream = await ai.models.generateContentStream({
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

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error("API /api/chat/stream error:", error);
    const errorMsg = error.message || String(error);
    
    let userFacingError = errorMsg;
    if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
      userFacingError = "API_QUOTA_EXCEEDED: The AI quota has been temporarily exceeded. Please try again later.";
    } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('GEMINI_API_KEY')) {
      userFacingError = "API_KEY_ERROR: Gemini API key is missing or invalid.";
    }

    res.write(`data: ${JSON.stringify({ error: userFacingError })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Non-streaming chat/bot generation
app.post("/api/chat/message", async (req, res) => {
  try {
    const { prompt, model = 'gemini-3-flash-preview', systemInstruction } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const ai = getGeminiClient();
    const result = await ai.models.generateContent({
      model: model || "gemini-3-flash-preview",
      contents: prompt,
      config: systemInstruction ? { systemInstruction } : undefined
    });

    res.json({ text: result.text || '' });
  } catch (error: any) {
    console.error("API /api/chat/message error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI message" });
  }
});

// Text moderation
app.post("/api/moderate/text", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.json({ isAppropriate: true, reason: "", suggestion: "" });
    }

    const ai = getGeminiClient();
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { text: `Analyze the following text for inappropriate content, specifically hate speech, harassment, or highly suggestive/explicit language. Respond in JSON format with the following structure: { "isAppropriate": boolean, "reason": string, "suggestion": string }. If the text is appropriate, isAppropriate should be true. If it is inappropriate, provide a brief reason and a suggestion for the user.\n\nText: ${text}` },
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

    const parsed = JSON.parse(result.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("API /api/moderate/text error:", error);
    res.json({ isAppropriate: true, reason: "Error during moderation", suggestion: "" });
  }
});

// Image moderation
app.post("/api/moderate/image", async (req, res) => {
  try {
    const { base64Data, mimeType = 'image/jpeg' } = req.body;
    if (!base64Data) {
      return res.json({ isAppropriate: true, reason: "", suggestion: "" });
    }

    const ai = getGeminiClient();
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

    const parsed = JSON.parse(result.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("API /api/moderate/image error:", error);
    res.json({ isAppropriate: true, reason: "Error during moderation", suggestion: "" });
  }
});

// --- Vite middleware setup ---
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

