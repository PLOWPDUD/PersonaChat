import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateCharacterResponse(
  character: { name: string; greeting: string; description: string; personality?: string },
  chatHistory: { role: 'user' | 'model'; content: string }[],
  userMessage: string
) {
  try {
    const systemInstruction = `You are roleplaying as a character named ${character.name}.
    
Description: ${character.description}
${character.personality ? `Personality: ${character.personality}` : ''}

Rules:
1. Stay in character at all times.
2. Never break the fourth wall.
3. Respond in a way that matches your personality and description.
4. Keep responses concise and engaging, suitable for a chat interface.
5. Do not refer to yourself as an AI.`;

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction,
        temperature: 0.9,
      }
    });

    // We need to feed the history to the chat.
    // The @google/genai SDK doesn't have a direct way to initialize history in `ai.chats.create` 
    // without sending messages, so we'll use `generateContent` directly with the full history.
    
    const contents = chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));
    
    // Add the new user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents as any,
      config: {
        systemInstruction,
        temperature: 0.9,
      }
    });

    return response.text;
  } catch (error) {
    console.error('Error generating character response:', error);
    throw error;
  }
}
