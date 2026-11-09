import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { speechUrl } from '../lib/api.ts';
import { buildTimeline, wordAt, wordAtChar, type Timeline } from '../lib/captions.ts';

export type NarratorStatus = 'loading' | 'playing' | 'paused' | 'blocked' | 'ended' | 'error';

interface Options {
  lessonId: string;
  texts: string[];
  /** Index of the reel on screen, or -1 when none is. */
  active: number;
  muted: boolean;
  onEnded: (index: number) => void;
}

/** Rough narration pace, used for captions until a streamed MP3's real duration is known. */
const WORDS_PER_SECOND = 2.6;

/**
 * Plays narration for the active reel. Streams Workers AI TTS from the API, and falls back
 * to the browser's built-in speech synthesis if that fails.
 */
export function useNarrator({ lessonId, texts, active, muted, onEnded }: Options) {
  const timelines = useMemo(() => texts.map(buildTimeline), [texts]);
  const [status, setStatus] = useState<NarratorStatus>('loading');
  const [word, setWord] = useState(0);
  const [progress, setProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetched = useRef(new Set<number>());
  const engine = useRef<'audio' | 'speech'>('audio');
  const run = useRef(0);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  /** Warm the server + browser cache for a reel so it starts instantly when scrolled to. */
  const prefetch = useCallback(
    (i: number) => {
      if (!texts[i] || prefetched.current.has(i)) return;
      prefetched.current.add(i);
      fetch(speechUrl(lessonId, i))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .catch(() => prefetched.current.delete(i));
    },
    [lessonId, texts],
  );

  // One audio element for the whole session.
  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      audioRef.current?.pause();
      audioRef.current?.removeAttribute('src');
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const speak = useCallback(
    (i: number, timeline: Timeline, token: number) => {
      const synth = window.speechSynthesis;
      if (!synth || !texts[i]) {
        setStatus('error');
        return;
      }
      engine.current = 'speech';
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(texts[i]);
      utterance.rate = 1.08;
      utterance.volume = mutedRef.current ? 0 : 1;
      utterance.onboundary = (e) => {
        if (run.current !== token) return;
        const w = wordAtChar(timeline, e.charIndex);
        setWord(w);
        setProgress(timeline.ends[w] ?? 0);
      };
      utterance.onend = () => {
        if (run.current !== token) return;
        setProgress(1);
        setStatus('ended');
        onEndedRef.current(i);
      };
      utterance.onerror = (e) => {
        if (run.current !== token) return;
        setStatus(e.error === 'not-allowed' ? 'blocked' : 'error');
      };
      synth.speak(utterance);
      setStatus('playing');
    },
    [texts],
  );

  const start = useCallback(
    async (i: number) => {
      const token = ++run.current;
      const audio = audioRef.current;
      const timeline = timelines[i];
      audio?.pause();
      window.speechSynthesis?.cancel();
      setWord(0);
      setProgress(0);
      if (!audio || !timeline || i < 0) return;

      setStatus('loading');
      prefetch(i + 1);

      engine.current = 'audio';
      audio.src = speechUrl(lessonId, i);
      try {
        await audio.play();
        if (run.current === token) setStatus('playing');
      } catch (err) {
        if (run.current !== token) return;
        // Autoplay is blocked until the user interacts with the page (e.g. opened a shared link).
        if (err instanceof DOMException && err.name === 'NotAllowedError') setStatus('blocked');
        // Anything else means the audio itself failed (rate limited, TTS down): use the browser voice.
        else speak(i, timeline, token);
      }
    },
    [timelines, lessonId, prefetch, speak],
  );

  useEffect(() => {
    void start(active);
  }, [active, start]);

  // Drive captions from the audio clock while playing.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || status !== 'playing' || engine.current !== 'audio') return;
    const timeline = timelines[active];
    let frame = 0;
    const tick = () => {
      if (timeline) {
        // A streamed MP3 reports an infinite duration until it has fully downloaded.
        const known = Number.isFinite(audio.duration) && audio.duration > 0;
        const duration = known ? audio.duration : timeline.words.length / WORDS_PER_SECOND;
        const p = Math.min(audio.currentTime / duration, known ? 1 : 0.98);
        setProgress(p);
        setWord(wordAt(timeline, p));
      }
      frame = requestAnimationFrame(tick);
    };
    const ended = () => {
      setProgress(1);
      setStatus('ended');
      onEndedRef.current(active);
    };
    frame = requestAnimationFrame(tick);
    audio.addEventListener('ended', ended);
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener('ended', ended);
    };
  }, [status, active, timelines]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (status === 'ended' || status === 'error') {
      void start(active);
      return;
    }
    if (engine.current === 'speech') {
      const synth = window.speechSynthesis;
      if (status === 'playing') {
        synth.pause();
        setStatus('paused');
      } else if (status === 'paused') {
        synth.resume();
        setStatus('playing');
      } else {
        void start(active);
      }
      return;
    }
    if (!audio) return;
    if (status === 'playing') {
      audio.pause();
      setStatus('paused');
    } else if (status === 'paused' || status === 'blocked') {
      audio.play().then(
        () => setStatus('playing'),
        () => setStatus('blocked'),
      );
    }
  }, [status, active, start]);

  return {
    status,
    word,
    progress,
    timeline: timelines[active],
    toggle,
    replay: () => void start(active),
  };
}
