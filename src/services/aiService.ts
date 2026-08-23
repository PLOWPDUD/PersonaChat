// Simple in-memory cache for moderation results
const moderationCache = new Map<string, ModerationResult>();

export interface ModerationResult {
  isAppropriate: boolean;
  reason?: string;
  suggestion?: string;
}

export async function moderateImage(base64Data: string, mimeType: string): Promise<ModerationResult> {
  const cacheKey = `${base64Data.length}_${base64Data.substring(0, 500)}_${base64Data.substring(base64Data.length - 500)}`;
  
  if (moderationCache.has(cacheKey)) {
    return moderationCache.get(cacheKey)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('/api/moderate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data, mimeType }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const result: ModerationResult = await response.json();
    moderationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn("Moderation image error/timeout, defaulting to appropriate:", error);
    return { 
      isAppropriate: true, 
      reason: "Timeout or error", 
      suggestion: "" 
    };
  }
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const cacheKey = `text_${text.length}_${text.substring(0, 100)}`;
  
  if (moderationCache.has(cacheKey)) {
    return moderationCache.get(cacheKey)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('/api/moderate/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const result: ModerationResult = await response.json();
    moderationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn("Moderation text error/timeout, defaulting to appropriate:", error);
    return { 
      isAppropriate: true, 
      reason: "Error during moderation", 
      suggestion: "" 
    };
  }
}

