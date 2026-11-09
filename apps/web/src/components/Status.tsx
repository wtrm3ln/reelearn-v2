import { useEffect, useState } from 'react';
import { Frame } from './Frame.tsx';

const STEPS = [
  'Finding a free model',
  'Writing the hook',
  'Cutting the boring bits',
  'Making it stick',
  'Still writing, free models are busy',
];

export function Loading({ topic, saved = false }: { topic: string; saved?: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (saved) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(id);
  }, [saved]);

  return (
    <Frame className="flex flex-col items-center justify-center bg-panel p-8 text-center">
      <div className="mb-8 size-12 animate-spin rounded-full border-4 border-line border-t-zap" />
      <p className="text-sm font-semibold tracking-wide text-mute uppercase">
        {saved ? 'Loading lesson' : `${STEPS[step]}…`}
      </p>
      {topic && <h1 className="mt-3 text-3xl font-black text-balance">{topic}</h1>}
      {!saved && (
        <p className="mt-6 max-w-64 text-xs text-mute">
          Free models can take up to a minute when they're busy. It gets saved to the gallery once
          it's done.
        </p>
      )}
    </Frame>
  );
}

export function Failure({
  message,
  onRetry,
  onHome,
}: {
  message: string;
  onRetry: () => void;
  onHome: () => void;
}) {
  return (
    <Frame className="flex flex-col items-center justify-center bg-panel p-8 text-center">
      <p className="text-4xl">:/</p>
      <h1 className="mt-4 text-2xl font-black">That didn't work</h1>
      <p className="mt-2 text-mute">{message}</p>
      <div className="mt-8 flex gap-3">
        <button onClick={onRetry} className="rounded-xl bg-zap px-5 py-3 font-bold text-ink">
          Try again
        </button>
        <button onClick={onHome} className="rounded-xl border border-line px-5 py-3 font-bold">
          New topic
        </button>
      </div>
    </Frame>
  );
}
