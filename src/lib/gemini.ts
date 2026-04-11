export async function generateCharacterResponse(
  characters: { name: string; greeting: string; description: string; personality?: string }[],
  chatHistory: { role: 'user' | 'model'; content: string; imageUrl?: string; characterId?: string }[],
  userMessage: string,
  userImageUrl?: string,
  memories: string[] = [],
  model: string = 'gemini-3-flash-preview',
  userPersona?: string
) {
  try {
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characters,
        chatHistory,
        userMessage,
        userImageUrl,
        memories,
        model,
        userPersona
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server responded with ${response.status}`);
    }

    const data = await response.json();
    return data.text;
  } catch (error: any) {
    console.error("Error generating character response:", error);
    const errorMsg = error.message || String(error);

    if (errorMsg.includes('NETWORK_ERROR') || errorMsg.includes('Failed to fetch')) {
      throw new Error(`NETWORK_ERROR: The application could not connect to the AI server. This might be a temporary issue.`);
    }

    if (errorMsg.includes('API_QUOTA_EXCEEDED')) {
      throw new Error(`API_QUOTA_EXCEEDED: The application's AI quota has been exceeded. Please try again later.`);
    }

    throw error;
  }
}
