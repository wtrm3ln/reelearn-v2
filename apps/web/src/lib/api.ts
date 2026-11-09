import type { ApiError, LessonPage, ScriptResponse } from '@reelearn/shared';
import type { LearnParams } from './params.ts';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function generateLesson(p: LearnParams, signal?: AbortSignal) {
  const res = await fetch('/api/script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: p.topic, reels: p.reels, tone: p.tone }),
    signal,
  });
  return json<ScriptResponse>(res);
}

export async function fetchLesson(id: string, signal?: AbortSignal) {
  return json<ScriptResponse>(await fetch(`/api/lessons/${id}`, { signal }));
}

export async function fetchLessons(cursor?: string | null, signal?: AbortSignal) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return json<LessonPage>(await fetch(`/api/lessons${qs}`, { signal }));
}

/** Streamed MP3 narration for one reel. A plain GET so <audio> can play while it downloads. */
export function speechUrl(lessonId: string, index: number): string {
  return `/api/lessons/${lessonId}/audio/${index}`;
}
