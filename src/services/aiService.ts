import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ModerationResult {
  isAppropriate: boolean;
  reason?: string;
  suggestion?: string;
}

export async function moderateImage(base64Data: string, mimeType: string): Promise<ModerationResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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

    const text = response.text;
    return JSON.parse(text || "{}");
  } catch (error) {
    console.error("Error moderating image:", error);
    // Default to appropriate if AI fails to avoid blocking users unnecessarily
    return { isAppropriate: true };
  }
}
