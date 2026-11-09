import { useState, type FormEvent } from 'react';
import { LIMITS, TONES, type Tone } from '@reelearn/shared';
import type { LearnParams } from '../lib/params.ts';
import { TONE_LABELS } from '../lib/tones.ts';
import { Gallery } from './Gallery.tsx';

const EXAMPLES = [
  'Why the sky is blue',
  'How compound interest works',
  'Black holes',
  'The TCP handshake',
  'How vaccines train your immune system',
  'Why the Roman Empire fell',
];

export function Home({
  onStart,
  onOpen,
}: {
  onStart: (p: LearnParams) => void;
  onOpen: (lessonId: string) => void;
}) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<Tone>('brainrot');
  const [reels, setReels] = useState<number>(LIMITS.defaultReels);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = topic.trim();
    if (t.length >= 2) onStart({ topic: t, tone, reels });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-[12vh] pb-16">
      <div className="mb-10">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs font-medium tracking-wide text-mute uppercase">
          <span className="size-1.5 rounded-full bg-zap" /> Reelearn
        </p>
        <h1 className="text-5xl leading-[0.95] font-black tracking-tight text-balance sm:text-6xl">
          Learn anything,
          <br />
          <span className="text-zap">one reel at a time.</span>
        </h1>
        <p className="mt-4 text-lg text-mute">
          Type a topic. Get a short narrated series you can scroll through in under five minutes.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div className="flex gap-2 rounded-2xl border border-line bg-panel p-2 focus-within:border-zap/60">
          <input
            autoFocus
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={LIMITS.topicMaxChars}
            placeholder="e.g. how black holes form"
            aria-label="Topic"
            className="min-w-0 flex-1 bg-transparent px-3 text-lg outline-none placeholder:text-mute/70"
          />
          <button
            type="submit"
            disabled={topic.trim().length < 2}
            className="rounded-xl bg-zap px-5 py-3 font-bold text-ink transition hover:brightness-110 disabled:opacity-40"
          >
            Learn
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Style</legend>
            <span className="text-mute">Style</span>
            <div className="flex rounded-xl border border-line p-1">
              {(Object.keys(TONES) as Tone[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tone === t}
                  title={TONES[t]}
                  onClick={() => setTone(t)}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                    tone === t ? 'bg-white text-ink' : 'text-mute hover:text-white'
                  }`}
                >
                  {TONE_LABELS[t]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Number of reels</legend>
            <span className="text-mute">Reels</span>
            <div className="flex rounded-xl border border-line p-1">
              {Array.from({ length: LIMITS.maxReels }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={reels === n}
                  onClick={() => setReels(n)}
                  className={`w-8 rounded-lg py-1.5 font-semibold tabular-nums transition ${
                    reels === n ? 'bg-white text-ink' : 'text-mute hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </form>

      <div className="mt-10">
        <p className="mb-3 text-xs font-semibold tracking-wide text-mute uppercase">Try one</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => onStart({ topic: ex, tone, reels })}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zap/60 hover:text-white"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <Gallery onOpen={onOpen} />

      <p className="mt-16 text-xs text-mute">
        Scripts are written by free models on OpenRouter and can be wrong. Double-check anything
        important.
      </p>
    </main>
  );
}
