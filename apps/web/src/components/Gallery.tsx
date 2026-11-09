import { useEffect, useState } from 'react';
import type { LessonSummary } from '@reelearn/shared';
import { fetchLessons } from '../lib/api.ts';
import { TONE_LABELS } from '../lib/tones.ts';

const timeAgo = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(iso: string): string {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return timeAgo.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

/** Every lesson anyone has generated, newest first. */
export function Gallery({ onOpen }: { onOpen: (id: string) => void }) {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');

  const load = (from: string | null, signal?: AbortSignal) => {
    setState('loading');
    fetchLessons(from, signal).then(
      (page) => {
        setLessons((prev) => (from ? [...prev, ...page.lessons] : page.lessons));
        setCursor(page.cursor);
        setState('idle');
      },
      () => !signal?.aborted && setState('error'),
    );
  };

  useEffect(() => {
    const ctrl = new AbortController();
    load(null, ctrl.signal);
    return () => ctrl.abort();
  }, []);

  return (
    <section className="mt-14" aria-labelledby="gallery-heading">
      <div className="mb-4 flex items-baseline justify-between">
        <h2
          id="gallery-heading"
          className="text-xs font-semibold tracking-wide text-mute uppercase"
        >
          Gallery
        </h2>
        {lessons.length > 0 && <span className="text-xs text-mute">Recently generated</span>}
      </div>

      {state === 'error' && lessons.length === 0 && (
        <p className="text-sm text-mute">Couldn't load the gallery right now.</p>
      )}
      {state === 'idle' && lessons.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-mute">
          Nothing here yet. Every lesson you generate is saved here for anyone to rewatch.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {lessons.map((l) => (
          <li key={l.id}>
            <button
              onClick={() => onOpen(l.id)}
              className="group flex h-full w-full flex-col rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-zap/60"
            >
              <span className="line-clamp-2 font-bold text-balance group-hover:text-zap">
                {l.title}
              </span>
              {l.title.toLowerCase() !== l.topic.toLowerCase() && (
                <span className="mt-1 line-clamp-1 text-sm text-mute">{l.topic}</span>
              )}
              <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs text-mute">
                <span>{TONE_LABELS[l.tone] ?? l.tone}</span>
                <span>
                  {l.reelCount} reel{l.reelCount === 1 ? '' : 's'}
                </span>
                <span>{ago(l.createdAt)}</span>
              </span>
            </button>
          </li>
        ))}
        {state === 'loading' &&
          Array.from({ length: lessons.length ? 2 : 4 }, (_, i) => (
            <li
              key={`s${i}`}
              className="h-24 animate-pulse rounded-2xl border border-line bg-panel"
            />
          ))}
      </ul>

      {cursor && state !== 'loading' && (
        <button
          onClick={() => load(cursor)}
          className="mt-4 w-full rounded-xl border border-line py-3 text-sm font-semibold text-zinc-300 hover:text-white"
        >
          Load more
        </button>
      )}
    </section>
  );
}
