import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScriptResponse } from '@reelearn/shared';
import { fetchLesson, generateLesson } from '../lib/api.ts';
import { toUrl, type Route } from '../lib/params.ts';
import { useNarrator } from '../hooks/useNarrator.ts';
import { Reel } from './Reel.tsx';
import { EndCard } from './EndCard.tsx';
import { Frame } from './Frame.tsx';
import { Failure, Loading } from './Status.tsx';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; script: ScriptResponse };

export function Reels({
  route,
  onHome,
}: {
  route: Exclude<Route, { kind: 'home' }>;
  onHome: () => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    const load =
      route.kind === 'lesson'
        ? fetchLesson(route.id, ctrl.signal)
        : generateLesson(route, ctrl.signal);
    load.then(
      (script) => {
        // Swap ?q=... for the saved lesson's permalink, so reloading or sharing never regenerates.
        history.replaceState(null, '', toUrl({ kind: 'lesson', id: script.id }));
        document.title = `${script.title} · Reelearn`;
        setState({ kind: 'ready', script });
      },
      (err: Error) => {
        if (!ctrl.signal.aborted) setState({ kind: 'error', message: err.message });
      },
    );
    return () => ctrl.abort();
  }, [route, attempt]);

  if (state.kind === 'loading') {
    return route.kind === 'lesson' ? <Loading topic="" saved /> : <Loading topic={route.topic} />;
  }
  if (state.kind === 'error') {
    return (
      <Failure message={state.message} onRetry={() => setAttempt((a) => a + 1)} onHome={onHome} />
    );
  }
  return <Feed script={state.script} onHome={onHome} />;
}

function Feed({ script, onHome }: { script: ScriptResponse; onHome: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const texts = useMemo(() => script.reels.map((r) => r.text), [script]);
  const count = script.reels.length;

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(i, count));
      sections.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [count],
  );

  const onEnded = useCallback(
    (i: number) => {
      // Auto-advance, unless the viewer has already scrolled somewhere else.
      setTimeout(() => {
        if (activeRef.current === i) goTo(i + 1);
      }, 900);
    },
    [goTo],
  );

  const narrator = useNarrator({
    lessonId: script.id,
    texts,
    active: active < count ? active : -1,
    muted,
    onEnded,
  });

  // Track which section is on screen.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = sections.current.indexOf(entry.target as HTMLElement);
          if (i !== -1) setActive(i);
        }
      },
      { root, threshold: 0.6 },
    );
    sections.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [count]);

  // Keyboard: arrows / j k to move, space to play-pause, m to mute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        goTo(activeRef.current + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        goTo(activeRef.current - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        narrator.toggle();
      } else if (e.key === 'm') {
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, narrator]);

  return (
    <div
      ref={scroller}
      className="no-scrollbar h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-contain"
    >
      <Background playing={active < count} />

      <button
        onClick={onHome}
        className="fixed top-4 left-4 z-30 rounded-full bg-black/50 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-black/70"
      >
        ← New topic
      </button>

      {script.reels.map((reel, i) => (
        <section
          key={i}
          ref={(el) => void (sections.current[i] = el)}
          className="relative z-10 snap-start snap-always"
        >
          <Reel
            index={i}
            total={count}
            reel={reel}
            seriesTitle={script.title}
            isActive={active === i}
            narrator={narrator}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
          />
        </section>
      ))}

      <section
        ref={(el) => void (sections.current[count] = el)}
        className="relative z-10 snap-start snap-always"
      >
        <EndCard script={script} onRestart={() => goTo(0)} onHome={onHome} />
      </section>
    </div>
  );
}

/**
 * One background video for the whole feed, fixed behind the (transparent) reel frames.
 * A single element means the clip downloads once and keeps playing across reels.
 */
function Background({ playing }: { playing: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <Frame>
        <video
          ref={video}
          src="/backgrounds/gameplay-1.mp4"
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          className="absolute inset-0 size-full object-cover"
        />
      </Frame>
    </div>
  );
}
