import type { Lesson, LessonPage, LessonSummary, Tone } from '@reelearn/shared';

/**
 * Lessons live in the STORE KV namespace with no expiry:
 *   lesson:<id>           full Lesson JSON
 *   index:<desc-ts>:<id>  empty value, LessonSummary in metadata. Keys sort newest first,
 *                         so the gallery is a single prefix list() with a cursor.
 */

const MAX_TS = 9_999_999_999_999;
const PAGE_SIZE = 24;

export async function lessonId(input: {
  topic: string;
  reels: number;
  tone: Tone;
}): Promise<string> {
  const normalized = input.topic.toLowerCase().replace(/\s+/g, ' ').trim();
  const data = new TextEncoder().encode(JSON.stringify([normalized, input.reels, input.tone]));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getLesson(env: Env, id: string): Promise<Lesson | null> {
  return env.STORE.get<Lesson>(`lesson:${id}`, 'json');
}

export async function saveLesson(env: Env, lesson: Lesson): Promise<void> {
  const created = Date.parse(lesson.createdAt);
  const summary: LessonSummary = {
    id: lesson.id,
    topic: lesson.topic.slice(0, 120),
    tone: lesson.tone,
    title: lesson.title.slice(0, 120),
    reelCount: lesson.reels.length,
    createdAt: lesson.createdAt,
  };
  const indexKey = `index:${String(MAX_TS - created).padStart(13, '0')}:${lesson.id}`;
  await Promise.all([
    env.STORE.put(`lesson:${lesson.id}`, JSON.stringify(lesson)),
    env.STORE.put(indexKey, '', { metadata: summary }),
  ]);
}

export async function listLessons(env: Env, cursor?: string): Promise<LessonPage> {
  const page = await env.STORE.list<LessonSummary>({ prefix: 'index:', limit: PAGE_SIZE, cursor });
  // A lesson regenerated in a race can have two index entries; show it once.
  const seen = new Set<string>();
  return {
    lessons: page.keys.flatMap((k) =>
      k.metadata && !seen.has(k.metadata.id) ? (seen.add(k.metadata.id), [k.metadata]) : [],
    ),
    cursor: page.list_complete ? null : page.cursor,
  };
}
