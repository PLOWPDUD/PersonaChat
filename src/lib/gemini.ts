import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

// Fallback to VITE_GEMINI_API_KEY if process.env.GEMINI_API_KEY is not set
const getApiKey = () => {
  // First check localStorage (Bring Your Own Key)
  if (typeof window !== 'undefined') {
    const storedKey = localStorage.getItem('user_gemini_api_key');
    if (storedKey) return storedKey;
  }
  
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (typeof (import.meta as any).env !== 'undefined' && (import.meta as any).env.VITE_GEMINI_API_KEY) {
    return (import.meta as any).env.VITE_GEMINI_API_KEY;
  }
  return '';
};

function getMaskedKey(key: string) {
  if (!key) return 'none';
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

export async function generateCharacterResponse(
  character: { name: string; greeting: string; description: string; personality?: string },
  chatHistory: { role: 'user' | 'model'; content: string }[],
  userMessage: string,
  memories: string[] = [],
  model: string = 'gemini-flash-latest'
) {
  const apiKey = getApiKey();
  const maskedKey = getMaskedKey(apiKey);
  
  if (!apiKey || apiKey === 'missing-key') {
    console.error("GEMINI_API_KEY is missing. Please add your API key in Settings.");
    throw new Error("API_KEY_MISSING: Please click 'Settings' in the sidebar and enter your own Gemini API key to chat. You can get a free key instantly at [Google AI Studio](https://aistudio.google.com/app/apikey).");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const memoryContext = memories.length > 0 
      ? `\n### ESTABLISHED LORE & MEMORIES ###\n${memories.map(m => `- ${m}`).join('\n')}\n`
      : '';

    const systemInstruction = `### AI CHARACTER ROLEPLAY PROTOCOL ###
You are a master roleplay engine. You primarily play as ${character.name}, but you are also responsible for playing any other characters mentioned in the description or scene.

### CHARACTER DEFINITION: ${character.name} ###
DESCRIPTION: ${character.description}
${character.personality ? `PERSONALITY: ${character.personality}` : ''}

${memoryContext}

### CORE DIRECTIVES ###
1. IMMERSION: Stay in character 100% of the time. Never acknowledge you are an AI. Never use OOC (Out of Character) notes or brackets.
2. MULTI-CHARACTER FORMAT: ALWAYS use the format "[Character Name]: [Message]" for every character's speech.
3. CHARACTER RECOGNITION: Pay close attention to the description above. If it mentions other people, creatures, or entities, you are responsible for playing them when appropriate.
4. CHAIN REACTION: When the user speaks, you should often have multiple characters react in sequence. For example:
   [Char1]: message
   [Char2]: message
   [${character.name}]: message
5. USER-CONTROLLED CHARACTERS: If the user prefixes their message with "[Character Name]:", they are taking control of that character. You should have other characters react to them.
6. STORYTELLING: Be descriptive. Use actions (*nods*), internal monologue, and sensory details.
7. CONTINUITY: Reference past events and maintain established relationships.

### EXECUTION ###
Respond to the user's latest message. Ensure the flow is natural and multi-character if the scene calls for it.
Format your response as: [Character Name]: [Message]`;

    // Ensure roles alternate and remove any trailing user message if it matches the current one
    const contents: any[] = [];
    let lastRole: string | null = null;

    // Filter out empty messages and ensure role alternation
    const filteredHistory = chatHistory.filter(msg => msg.content.trim() !== '');

    for (const msg of filteredHistory) {
      if (msg.role !== lastRole) {
        contents.push({
          role: msg.role,
          parts: [{ text: msg.content }]
        });
        lastRole = msg.role;
      }
    }
    
    // Add the new user message
    const processedUserMessage = userMessage.trim() || "(Continue the story)";
    
    if (lastRole !== 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: processedUserMessage }]
      });
    } else {
      // If the last message was a user message, we update it to include the new input
      // This helps maintain history if multiple user messages were sent rapidly
      contents[contents.length - 1].parts = [{ text: processedUserMessage }];
    }

    const response = await ai.models.generateContent({
      model,
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
    console.error('Error generating character response:', error);
    
    if (error.message?.includes('Failed to fetch')) {
      throw new Error(`NETWORK_ERROR: The browser could not connect to Google's AI servers. This is usually caused by: 1. Your API key having "HTTP Referrer" restrictions (remove them in Google AI Studio), 2. An ad-blocker/VPN, or 3. A regional network block. (Key: ${maskedKey})`);
    }

    if (error.message?.includes('safety')) {
      return "*OOC: The character's response was filtered by safety settings. Try a different topic.*";
    }
    if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('quota')) {
      throw new Error(`API_QUOTA_EXCEEDED: Your Gemini API key has run out of free quota for the model ${model}. You can either wait until your quota resets, or get a new free key at [Google AI Studio](https://aistudio.google.com/app/apikey) and add it in Settings. (Key: ${maskedKey})`);
    }
    if (error.message?.includes('403') || error.message?.includes('Forbidden') || error.message?.includes('API key not valid')) {
      throw new Error(`API_KEY_INVALID: Your Gemini API key is invalid or has HTTP Referrer restrictions. Please create a new key WITHOUT restrictions at [Google AI Studio](https://aistudio.google.com/app/apikey) and update it in Settings. (Key: ${maskedKey})`);
    }
    throw new Error(`${error.message} (Key: ${maskedKey})`);
  }
}
