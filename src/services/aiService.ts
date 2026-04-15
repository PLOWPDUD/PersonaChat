import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Simple in-memory cache for moderation results
const moderationCache = new Map<string, ModerationResult>();

export interface ModerationResult {
  isAppropriate: boolean;
  reason?: string;
  suggestion?: string;
}

export async function moderateImage(base64Data: string, mimeType: string): Promise<ModerationResult> {
  // Use a simple hash of the base64 data for caching
  // We'll just use the first 1000 characters + length as a weak but fast "hash"
  const cacheKey = `${base64Data.length}_${base64Data.substring(0, 500)}_${base64Data.substring(base64Data.length - 500)}`;
  
  if (moderationCache.has(cacheKey)) {
    return moderationCache.get(cacheKey)!;
  }

  try {
    // Add a timeout to the moderation call
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Moderation timeout")), 20000)
    );

    const moderationPromise = ai.models.generateContent({
      model: "gemini-flash-latest",
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

    const response = await Promise.race([moderationPromise, timeoutPromise]) as any;

    const text = response.text;
    const result = JSON.parse(text || "{}");
    
    // Cache the result
    const cacheKey = `${base64Data.length}_${base64Data.substring(0, 500)}_${base64Data.substring(base64Data.length - 500)}`;
    moderationCache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "Moderation timeout") {
      console.warn("Moderation timed out, defaulting to appropriate.");
    } else {
      console.error("Error moderating image:", error);
    }
    // Default to appropriate if AI fails or times out to avoid blocking users unnecessarily
    return { 
      isAppropriate: true, 
      reason: "Timeout or error", 
      suggestion: "" 
    };
  }
}
