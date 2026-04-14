import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ModerationResult {
  isAppropriate: boolean;
  reason?: string;
  suggestion?: string;
}

export async function moderateImage(base64Data: string, mimeType: string): Promise<ModerationResult> {
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
    return JSON.parse(text || "{}");
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
