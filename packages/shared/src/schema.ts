import { z } from 'zod';
import { TONES, LIMITS, type Tone } from './constants.ts';

export const toneSchema = z.enum(Object.keys(TONES) as [Tone, ...Tone[]]);

export const scriptRequestSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(2, 'Topic is too short')
    .max(LIMITS.topicMaxChars, `Topic must be under ${LIMITS.topicMaxChars} characters`),
  reels: z.number().int().min(LIMITS.minReels).max(LIMITS.maxReels).default(LIMITS.defaultReels),
  tone: toneSchema.default('brainrot'),
});
export type ScriptRequest = z.input<typeof scriptRequestSchema>;

export const reelSchema = z.object({
  title: z.string().trim().max(120).default(''),
  text: z.string().trim().min(1),
});
export type Reel = z.infer<typeof reelSchema>;

/** Shape we ask the LLM to return. */
export const llmScriptSchema = z.object({
  title: z.string().trim().max(160).default(''),
  reels: z.array(reelSchema).min(1),
});
export type LlmScript = z.infer<typeof llmScriptSchema>;
