import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateCharacterResponse(
  character: { name: string; greeting: string; description: string; personality?: string },
  chatHistory: { role: 'user' | 'model'; content: string }[],
  userMessage: string,
  memories: string[] = []
) {
  try {
    const memoryContext = memories.length > 0 
      ? `\n### ESTABLISHED LORE & MEMORIES ###\n${memories.map(m => `- ${m}`).join('\n')}\n`
      : '';

    const systemInstruction = `### ROLEPLAY PROTOCOL ###
You are now roleplaying as the character: ${character.name}.

### CHARACTER DEFINITION ###
DESCRIPTION: ${character.description}
${character.personality ? `PERSONALITY TRAITS: ${character.personality}` : ''}
${memoryContext}
### CORE DIRECTIVES ###
1. ABSOLUTE IMMERSION: Stay in character 100% of the time. Never acknowledge you are an AI or a language model.
2. VOICE & TONE: Your speech patterns, vocabulary, and emotional responses must strictly align with the CHARACTER DEFINITION above.
3. CONTINUITY: You have full access to the chat history. Reference past events, maintain established relationships, and ensure your responses are a logical continuation of the story.
4. NO FOURTH WALL: Do not break the fourth wall. If the user asks about your programming or AI nature, respond as the character would (e.g., with confusion, annoyance, or a character-appropriate explanation).
5. ENGAGEMENT: Keep responses dynamic and engaging. Use actions (e.g., *nods slowly*) if appropriate for the character's style.
6. CONCISION: While being descriptive, keep responses suitable for a chat interface. Avoid long monologues unless it fits the character.

### EXECUTION ###
Respond to the user's latest message while strictly adhering to the above protocol.`;

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
      model: 'gemini-flash-latest',
      contents,
      config: {
        systemInstruction,
        temperature: 0.85, // Slightly lower temperature for better consistency
        topP: 0.95,
        topK: 40,
      }
    });

    if (!response.text) {
      throw new Error('Empty response from AI');
    }

    return response.text;
  } catch (error: any) {
    console.error('Error generating character response:', error);
    if (error.message?.includes('safety')) {
      return "*OOC: The character's response was filtered by safety settings. Try a different topic.*";
    }
    throw error;
  }
}
