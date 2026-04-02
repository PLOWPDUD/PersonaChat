import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateCharacterResponse(
  character: { name: string; greeting: string; description: string; personality?: string },
  chatHistory: { role: 'user' | 'model'; content: string }[],
  userMessage: string,
  memories: string[] = [],
  model: string = 'gemini-3.1-pro-preview'
) {
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
1. IMMERSION: Stay in character 100% of the time. Never acknowledge you are an AI.
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
