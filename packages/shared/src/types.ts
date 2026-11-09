import type { Tone } from './constants.ts';
import type { Reel } from './schema.ts';

/** A generated series, saved permanently and shown in the gallery. */
export interface Lesson {
  /** Stable id derived from topic + reels + tone, so the same request maps to one lesson. */
  id: string;
  topic: string;
  tone: Tone;
  title: string;
  reels: Reel[];
  /** Model OpenRouter actually routed to. */
  model: string;
  createdAt: string;
}

export type ScriptResponse = Lesson & { cached: boolean };

export interface LessonSummary {
  id: string;
  topic: string;
  tone: Tone;
  title: string;
  reelCount: number;
  createdAt: string;
}

export interface LessonPage {
  lessons: LessonSummary[];
  /** Pass back as ?cursor= for the next page; null when there are no more. */
  cursor: string | null;
}

export interface ApiError {
  error: string;
}
