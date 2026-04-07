import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

// Get API keys from environment variables
const getApiKeys = () => {
  const keysString = process.env.GEMINI_KEYS || (import.meta as any).env.VITE_GEMINI_KEYS || process.env.GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY || '';
  return keysString.split(',').map((k: string) => k.trim()).filter((k: string) => k !== '');
};

export async function generateCharacterResponse(
  characters: { name: string; greeting: string; description: string; personality?: string }[],
  chatHistory: { role: 'user' | 'model'; content: string; imageUrl?: string; characterId?: string }[],
  userMessage: string,
  userImageUrl?: string,
  memories: string[] = [],
  model: string = 'gemini-3-flash-preview',
  userPersona?: string
) {
  const apiKeys = getApiKeys();
  
  if (apiKeys.length === 0) {
    console.error("GEMINI_KEYS is missing. Please ensure it is set in the environment variables.");
    throw new Error("API_KEY_MISSING: The application's Gemini API key is not configured. Please contact the administrator.");
  }

  let attempts = 0;
  const maxAttempts = apiKeys.length * 3; // Allow retries across all keys
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  let currentKeyIndex = 0;
  let currentModel = model;

  while (attempts < maxAttempts) {
    const apiKey = apiKeys[currentKeyIndex];
    const ai = new GoogleGenAI({ apiKey });

    try {
      const memoryContext = memories.length > 0 
        ? `\n### ESTABLISHED LORE & MEMORIES ###\n${memories.map(m => `- ${m}`).join('\n')}\n`
        : '';

      const userPersonaContext = userPersona
        ? `\n### USER PERSONA ###\n${userPersona}\n`
        : '';

      const charactersContext = characters.map((char, index) => `
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

      // Ensure roles alternate and merge consecutive messages of the same role
      const contents: any[] = [];
      const filteredHistory = chatHistory.filter(msg => msg.content.trim() !== '' || msg.imageUrl);

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
          // Merge with previous message of the same role
          const lastMsg = contents[contents.length - 1];
          lastMsg.parts.push(...parts);
        } else {
          contents.push({
            role: msg.role,
            parts: parts
          });
        }
      }
      
      // Add the new user message
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
        // If the last message was a user message, we append the new parts to it
        contents[contents.length - 1].parts.push(...newUserParts);
      } else {
        contents.push({
          role: 'user',
          parts: newUserParts
        });
      }

      const response = await ai.models.generateContent({
        model: currentModel,
        contents,
        config: {
          systemInstruction,
          temperature: 0.9,
          topP: 0.95,
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
        }
      });

      if (!response.text) {
        throw new Error('Empty response from AI');
      }

      return response.text;
    } catch (error: any) {
      attempts++;
      const errorMsg = error.message || String(error);
      console.error(`Error generating character response (Attempt ${attempts}/${maxAttempts}, KeyIndex: ${currentKeyIndex}, Model: ${currentModel}):`, errorMsg);

      const isQuotaError = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota');
      
      if (isQuotaError) {
        // Rotate key
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        console.warn(`Quota exceeded for key index ${currentKeyIndex - 1}. Rotating to key index ${currentKeyIndex}.`);
        await delay(1000); // Small delay before trying next key
        continue;
      }

      const isRetryable = errorMsg.includes('503') || errorMsg.includes('high demand') || errorMsg.includes('UNAVAILABLE') || errorMsg.includes('Failed to fetch') || isQuotaError;

      if (isRetryable && attempts < maxAttempts) {
        // Exponential backoff
        await delay(Math.pow(2, attempts) * 1000);
        continue;
      }
      
      if (errorMsg.includes('Failed to fetch')) {
        throw new Error(`NETWORK_ERROR: The application could not connect to Google's AI servers. This might be a temporary issue or a regional block.`);
      }

      if (errorMsg.includes('safety')) {
        return "*OOC: The character's response was filtered by safety settings. Try a different topic.*";
      }
      if (isQuotaError) {
        throw new Error(`API_QUOTA_EXCEEDED: The application's API quota has been exceeded. Please try again later.`);
      }
      if (errorMsg.includes('403') || errorMsg.includes('Forbidden') || errorMsg.includes('API key not valid')) {
        throw new Error(`API_KEY_INVALID: The application's API key is invalid or restricted. Please contact the administrator.`);
      }
      if (errorMsg.includes('503') || errorMsg.includes('high demand') || errorMsg.includes('UNAVAILABLE')) {
        throw new Error(`API_HIGH_DEMAND: Google's AI servers are currently experiencing high demand. Please try again in a few moments.`);
      }
      
      // Try to parse JSON error if it exists
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed.error?.message) {
          throw new Error(`API_ERROR: ${parsed.error.message}`);
        }
      } catch (e) {
        // Not JSON, ignore
      }

      throw new Error(`${errorMsg}`);
    }
  }
  throw new Error('MAX_ATTEMPTS_REACHED: Failed to get a response from AI after multiple attempts.');
}
