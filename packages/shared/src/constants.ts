export const LIMITS = {
  topicMaxChars: 200,
  minReels: 1,
  maxReels: 5,
  defaultReels: 3,
  reelMaxWords: 90,
} as const;

export const TONES = {
  brainrot: 'Hooky, fast, internet-native. Punchy sentences, a strong hook in the first line.',
  chill: 'Calm, friendly and clear, like a good teacher on a walk.',
  eli5: "Explain it like I'm five. Simple words, one vivid analogy per reel.",
} as const;

export type Tone = keyof typeof TONES;

export const LESSON_ID = /^[a-f0-9]{16}$/;
