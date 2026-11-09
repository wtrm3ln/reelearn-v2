import { useState } from 'react';
import type { ScriptResponse } from '@reelearn/shared';
import { Frame } from './Frame.tsx';

export function EndCard({
  script,
  onRestart,
  onHome,
}: {
  script: ScriptResponse;
  onRestart: () => void;
  onHome: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${script.title} · Reelearn`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // share sheet dismissed
    }
  };

  return (
    <Frame className="bg-panel flex flex-col justify-center p-8">
      <p className="text-xs font-semibold tracking-wide text-zap uppercase">Series complete</p>
      <h2 className="mt-2 text-4xl leading-none font-black text-balance">{script.title}</h2>
      <ol className="mt-6 space-y-2">
        {script.reels.map((r, i) => (
          <li key={i} className="flex gap-3 text-zinc-300">
            <span className="font-black text-mute tabular-nums">{i + 1}</span>
            <span>{r.title || r.text.split(' ').slice(0, 6).join(' ') + '…'}</span>
          </li>
        ))}
      </ol>
      <div className="mt-8 grid gap-3">
        <button onClick={onHome} className="rounded-xl bg-zap py-3 font-bold text-ink">
          Learn something new
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onRestart} className="rounded-xl border border-line py-3 font-bold">
            Watch again
          </button>
          <button onClick={share} className="rounded-xl border border-line py-3 font-bold">
            {copied ? 'Link copied' : 'Share'}
          </button>
        </div>
      </div>
      <p className="mt-8 text-xs text-mute">
        Written by <code className="text-zinc-400">{script.model}</code> via OpenRouter
        {script.cached ? ' (saved)' : ''}. Narrated by your browser's voice.
      </p>
    </Frame>
  );
}
