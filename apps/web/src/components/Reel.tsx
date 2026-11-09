import type { Reel as ReelData } from '@reelearn/shared';
import type { useNarrator } from '../hooks/useNarrator.ts';
import { chunkFor } from '../lib/captions.ts';
import { Frame } from './Frame.tsx';

interface Props {
  index: number;
  total: number;
  reel: ReelData;
  seriesTitle: string;
  isActive: boolean;
  narrator: ReturnType<typeof useNarrator>;
  muted: boolean;
  onToggleMute: () => void;
}

export function Reel({
  index,
  total,
  reel,
  seriesTitle,
  isActive,
  narrator,
  muted,
  onToggleMute,
}: Props) {
  const status = isActive ? narrator.status : 'paused';
  const progress = isActive ? narrator.progress : 0;

  return (
    // Transparent: the shared background video (see Feed) shows through.
    <Frame className="bg-transparent">
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/10 to-black/80" />

      {/* Tap anywhere to play / pause */}
      <button
        aria-label={status === 'playing' ? 'Pause narration' : 'Play narration'}
        onClick={isActive ? narrator.toggle : undefined}
        className="absolute inset-0 z-10 cursor-pointer"
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-4 pt-16 sm:pt-4">
        <div className="flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full bg-white"
                style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs font-semibold tracking-wide text-white/70 uppercase">
          {seriesTitle} · {index + 1}/{total}
        </p>
        {reel.title && <h2 className="mt-1 text-xl font-black">{reel.title}</h2>}
      </header>

      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-6 text-center">
        {isActive && narrator.timeline && status !== 'loading' ? (
          <Captions narrator={narrator} />
        ) : (
          <p className="caption text-4xl leading-tight uppercase">
            {reel.title || `Part ${index + 1}`}
          </p>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        {status === 'loading' && (
          <div className="mt-48 size-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        )}
        {isActive && (status === 'paused' || status === 'blocked') && (
          <div className="mt-56 rounded-full bg-black/60 px-5 py-3 text-sm font-bold backdrop-blur">
            {status === 'blocked' ? '▶ Tap to play' : '▶ Paused'}
          </div>
        )}
        {isActive && status === 'error' && (
          <div className="mt-56 rounded-full bg-black/60 px-5 py-3 text-sm font-bold backdrop-blur">
            Audio failed. Tap to retry
          </div>
        )}
      </div>

      <div className="absolute right-3 bottom-28 z-30 flex flex-col gap-3">
        <RailButton label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
          <Icon
            d={
              muted
                ? 'M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6'
                : 'M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14'
            }
          />
        </RailButton>
        <RailButton label="Replay" onClick={narrator.replay} disabled={!isActive}>
          <Icon d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
        </RailButton>
      </div>

      <details className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 to-transparent p-4 pt-10 text-sm text-white/85 [&[open]]:bg-black/90">
        <summary className="cursor-pointer list-none font-semibold text-white/70">
          Transcript
        </summary>
        <p className="mt-2 max-h-48 overflow-y-auto leading-relaxed">{reel.text}</p>
      </details>
    </Frame>
  );
}

function Captions({ narrator }: { narrator: ReturnType<typeof useNarrator> }) {
  const timeline = narrator.timeline!;
  const [start, end] = chunkFor(timeline, narrator.word);
  return (
    <p
      key={start}
      className="caption animate-pop text-[2.6rem] leading-[1.1] uppercase sm:text-5xl"
    >
      {timeline.words.slice(start, end).map((w, i) => (
        <span key={i} className={start + i === narrator.word ? 'text-zap' : 'text-white'}>
          {w}{' '}
        </span>
      ))}
    </p>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

function RailButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-12 place-items-center rounded-full bg-black/50 text-xl backdrop-blur transition hover:bg-black/70 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
