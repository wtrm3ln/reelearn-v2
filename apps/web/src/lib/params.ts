import { LESSON_ID, LIMITS, TONES, type Tone } from '@reelearn/shared';

export interface LearnParams {
  topic: string;
  reels: number;
  tone: Tone;
}

export type Route =
  { kind: 'home' } | ({ kind: 'generate' } & LearnParams) | { kind: 'lesson'; id: string };

export function readRoute(search = window.location.search): Route {
  const params = new URLSearchParams(search);
  const id = params.get('lesson');
  if (id && LESSON_ID.test(id)) return { kind: 'lesson', id };

  const topic = params.get('q')?.trim();
  if (!topic) return { kind: 'home' };
  const n = Number(params.get('n'));
  const tone = params.get('tone');
  return {
    kind: 'generate',
    topic,
    reels:
      Number.isInteger(n) && n >= LIMITS.minReels && n <= LIMITS.maxReels ? n : LIMITS.defaultReels,
    tone: tone && tone in TONES ? (tone as Tone) : 'brainrot',
  };
}

export function toUrl(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'lesson':
      return `/?lesson=${route.id}`;
    case 'generate':
      return `/?${new URLSearchParams({ q: route.topic, n: String(route.reels), tone: route.tone })}`;
  }
}
