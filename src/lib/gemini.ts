import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function* generateCharacterResponseStream(
  characters: { name: string; greeting: string; description: string; personality?: string }[],
  chatHistory: { role: 'user' | 'model'; content: string; imageUrl?: string; characterId?: string }[],
  userMessage: string,
  userImageUrl?: string,
  memories: string[] = [],
  model: string = 'gemini-flash-latest',
  userPersona?: string
) {
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
        yield text;
      }
    }
  } catch (error: any) {
    console.error("Error generating character response:", error);
    const errorMsg = error.message || String(error);

    if (errorMsg.includes('NETWORK_ERROR') || errorMsg.includes('Failed to fetch')) {
      throw new Error(`NETWORK_ERROR: The application could not connect to the AI server. This might be a temporary issue.`);
    }

    if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error(`API_QUOTA_EXCEEDED: The application's AI quota has been exceeded. Please try again later.`);
    }

    throw error;
  }
}

export async function generateCharacterResponse(
  characters: { name: string; greeting: string; description: string; personality?: string }[],
  chatHistory: { role: 'user' | 'model'; content: string; imageUrl?: string; characterId?: string }[],
  userMessage: string,
  userImageUrl?: string,
  memories: string[] = [],
  model: string = 'gemini-3-flash-preview',
  userPersona?: string
) {
  let fullText = "";
  const stream = generateCharacterResponseStream(characters, chatHistory, userMessage, userImageUrl, memories, model, userPersona);
  for await (const chunk of stream) {
    fullText += chunk;
  }
  return fullText;
}
