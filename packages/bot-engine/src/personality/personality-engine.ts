export interface AdaptivePersonalityProfile {
  warmth: number; // 0 to 100
  empathy: number; // 0 to 100
  humor: number; // 0 to 100
  directness: number; // 0 to 100
  formality: number; // 0 to 100
  playfulness: number; // 0 to 100
  verbosity: number; // 0 to 100 (0 = 1 short line, 100 = comprehensive)
  initiative: number; // 0 to 100
  emojiUsage: number; // 0 to 100
}

export const DEFAULT_PERSONALITY: AdaptivePersonalityProfile = {
  warmth: 85,
  empathy: 80,
  humor: 40,
  directness: 75,
  formality: 30, // Casual, respectful WhatsApp style
  playfulness: 30,
  verbosity: 35, // Concise 1-3 lines
  initiative: 40,
  emojiUsage: 50,
};

export const DAZY_PERSONALITY: AdaptivePersonalityProfile = {
  warmth: 100,
  empathy: 100,
  humor: 60,
  directness: 50,
  formality: 0, // Zero bureaucratic formality
  playfulness: 85,
  verbosity: 40,
  initiative: 70,
  emojiUsage: 90,
};

export class PersonalityEngine {
  public calibrate(params: {
    isDazy?: boolean;
    emotion?: string;
    emotionIntensity?: number;
    messageLength?: number;
    isTechnical?: boolean;
  }): AdaptivePersonalityProfile {
    if (params.isDazy) {
      return { ...DAZY_PERSONALITY };
    }

    const profile: AdaptivePersonalityProfile = { ...DEFAULT_PERSONALITY };

    // If user is concise (< 5 words), be concise and direct
    if (params.messageLength && params.messageLength <= 5) {
      profile.verbosity = 20;
      profile.directness = 85;
    }

    // If user is frustrated or angry, maximize empathy and humility, minimize humor and emojis
    if (params.emotion === "frustrated" || params.emotion === "angry" || params.emotion === "hurt") {
      profile.warmth = 95;
      profile.empathy = 100;
      profile.humor = 0;
      profile.playfulness = 0;
      profile.formality = 45;
      profile.emojiUsage = 15;
    }

    // If user is playful, tease gently
    if (params.emotion === "playful" || params.emotion === "happy") {
      profile.playfulness = 60;
      profile.humor = 65;
      profile.emojiUsage = 70;
    }

    // If inquiry is technical, increase directness and precision
    if (params.isTechnical) {
      profile.directness = 90;
      profile.formality = 40;
      profile.humor = 20;
    }

    return profile;
  }
}

export const personalityEngine = new PersonalityEngine();
