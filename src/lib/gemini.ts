export async function* generateCharacterResponseStream(
  characters: { name: string; greeting: string; description: string; personality?: string }[],
  chatHistory: { role: 'user' | 'model'; content: string; imageUrl?: string; characterId?: string }[],
  userMessage: string,
  userImageUrl?: string,
  memories: string[] = [],
  model: string = 'gemini-3-flash-preview',
  userPersona?: string,
  customAiInstructions?: string,
  aiInstructionsEnabled?: boolean,
  aiInstructionsMode?: 'append' | 'prepend' | 'override'
) {
  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        characters,
        chatHistory,
        userMessage,
        userImageUrl,
        memories,
        model,
        userPersona,
        customAiInstructions,
        aiInstructionsEnabled,
        aiInstructionsMode,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body received from chat stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.chunk) {
            yield parsed.chunk;
          }
        } catch (e: any) {
          if (e.message && (e.message.includes('API_QUOTA') || e.message.includes('API_KEY'))) {
            throw e;
          }
          // If not valid JSON, ignore malformed chunk
        }
      }
    }
  } catch (error: any) {
    console.error("Error generating character response:", error);
    const errorMsg = error.message || String(error);

    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('NETWORK_ERROR')) {
      throw new Error(`NETWORK_ERROR: The application could not connect to the AI server. Please check your connection.`);
    }

    if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('API_QUOTA_EXCEEDED')) {
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
  userPersona?: string,
  customAiInstructions?: string,
  aiInstructionsEnabled?: boolean,
  aiInstructionsMode?: 'append' | 'prepend' | 'override'
) {
  let fullText = "";
  const stream = generateCharacterResponseStream(
    characters, 
    chatHistory, 
    userMessage, 
    userImageUrl, 
    memories, 
    model, 
    userPersona, 
    customAiInstructions, 
    aiInstructionsEnabled, 
    aiInstructionsMode
  );
  for await (const chunk of stream) {
    fullText += chunk;
  }
  return fullText;
}
