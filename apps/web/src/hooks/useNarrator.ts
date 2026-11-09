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

const SPEECH_RATE = 1.05;
/** Rough narration pace (words/second) for captions when no word timings are available. */
const WORDS_PER_SECOND = 2.6;
/** If speech hasn't started by now, assume the browser wants a tap first. */
const SPEECH_START_TIMEOUT_MS = 4000;

/**
 * Narrates the active reel.
 *
 * The browser's built-in speech synthesis is the default: it's free and instant. The
 * Workers AI voice from the API (which spends the account's daily allowance) is only used
 * when the browser can't speak, e.g. no speechSynthesis support or a synthesis error.
 *
 * Speech is queued one sentence at a time. That works around Chrome cutting off long
 * utterances, makes pause/resume reliable across browsers, and anchors captions to the
 * current sentence even in browsers that don't report word boundaries.
 */
export function useNarrator({ lessonId, texts, active, muted, onEnded }: Options) {
  const timelines = useMemo(() => texts.map(buildTimeline), [texts]);
  const [status, setStatus] = useState<NarratorStatus>('loading');
  const [word, setWord] = useState(0);
  const [progress, setProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engine = useRef<'speech' | 'audio'>('speech');
  /** Bumped on every start/stop so callbacks from cancelled speech or audio are ignored. */
  const run = useRef(0);
  const speech = useRef({
    reel: -1,
    sentence: 0,
    startedAt: 0,
    sawBoundary: false,
    // Safari can garbage-collect an utterance mid-speech (dropping its events) unless it's referenced.
    utterance: null as SpeechSynthesisUtterance | null,
  });
  const voice = usePreferredVoice();
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      run.current++;
      audioRef.current?.pause();
      audioRef.current?.removeAttribute('src');
      window.speechSynthesis?.cancel();
    };
  }, []);

  const showWord = useCallback((timeline: Timeline, w: number) => {
    setWord(w);
    setProgress(timeline.ends[w] ?? 0);
  }, []);

  /** Server voice (Workers AI). Generated once per reel, then cached forever by the API. */
  const playAudio = useCallback(
    async (i: number, token: number) => {
      const audio = audioRef.current;
      if (!audio || run.current !== token) return;
      window.speechSynthesis?.cancel();
      engine.current = 'audio';
      setStatus('loading');
      audio.src = speechUrl(lessonId, i);
      audio.muted = mutedRef.current;
      try {
        await audio.play();
        if (run.current === token) setStatus('playing');
      } catch (err) {
        if (run.current !== token) return;
        setStatus(
          err instanceof DOMException && err.name === 'NotAllowedError' ? 'blocked' : 'error',
        );
      }
    },
    [lessonId],
  );

  const speakFrom = useCallback(
    (i: number, sentence: number, token: number) => {
      const synth = window.speechSynthesis;
      const timeline = timelines[i];
      const range = timeline?.sentences[sentence];
      if (!synth || !timeline || !range) return;
      const [start, end] = range;

      engine.current = 'speech';
      const s = speech.current;
      s.reel = i;
      s.sentence = sentence;
      s.sawBoundary = false;

      const utterance = new SpeechSynthesisUtterance(timeline.words.slice(start, end).join(' '));
      s.utterance = utterance;
      if (voice.current) {
        utterance.voice = voice.current;
        utterance.lang = voice.current.lang;
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = SPEECH_RATE;
      utterance.volume = mutedRef.current ? 0 : 1;

      let started = false;
      const startTimer = setTimeout(() => {
        if (!started && run.current === token) setStatus('blocked');
      }, SPEECH_START_TIMEOUT_MS);

      utterance.onstart = () => {
        started = true;
        clearTimeout(startTimer);
        if (run.current !== token) return;
        s.startedAt = performance.now();
        showWord(timeline, start);
        setStatus('playing');
      };
      utterance.onboundary = (e) => {
        if (run.current !== token || (e.name && e.name !== 'word')) return;
        s.sawBoundary = true;
        showWord(timeline, wordAtChar(timeline, start, end, e.charIndex));
      };
      utterance.onend = () => {
        clearTimeout(startTimer);
        if (run.current !== token) return;
        if (sentence + 1 < timeline.sentences.length) {
          speakFrom(i, sentence + 1, token);
        } else {
          setProgress(1);
          setStatus('ended');
          onEndedRef.current(i);
        }
      };
      utterance.onerror = (e) => {
        clearTimeout(startTimer);
        if (run.current !== token || e.error === 'interrupted' || e.error === 'canceled') return;
        if (e.error === 'not-allowed') setStatus('blocked');
        // The browser can't speak this: fall back to the server voice for this reel.
        else void playAudio(i, token);
      };
      synth.speak(utterance);
    },
    [timelines, voice, showWord, playAudio],
  );

  /** Stop whatever is playing and invalidate its callbacks. Returns a fresh run token. */
  const halt = useCallback(() => {
    const token = ++run.current;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    return token;
  }, []);

  const start = useCallback(
    (i: number) => {
      const token = halt();
      setWord(0);
      setProgress(0);
      if (i < 0 || !timelines[i]) return;
      setStatus('loading');
      if ('speechSynthesis' in window) {
        // Some browsers drop a speak() issued in the same tick as cancel().
        setTimeout(() => run.current === token && speakFrom(i, 0, token), 60);
      } else {
        void playAudio(i, token);
      }
    },
    [halt, timelines, speakFrom, playAudio],
  );

  useEffect(() => {
    start(active);
  }, [active, start]);

  // Muting mid-sentence: restart the sentence at the new volume (utterance volume is fixed).
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
    if (engine.current === 'speech' && status === 'playing') {
      speakFrom(speech.current.reel, speech.current.sentence, halt());
    }
    // Only react to mute changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  // Captions: follow the audio clock, or estimate within the current sentence when the
  // browser doesn't report word boundaries.
  useEffect(() => {
    if (status !== 'playing') return;
    const timeline = timelines[active];
    const audio = audioRef.current;
    if (!timeline || !audio) return;
    let frame = 0;

    const tick = () => {
      if (engine.current === 'audio') {
        // A streamed MP3 reports an infinite duration until it has fully downloaded.
        const known = Number.isFinite(audio.duration) && audio.duration > 0;
        const duration = known ? audio.duration : timeline.words.length / WORDS_PER_SECOND;
        const p = Math.min(audio.currentTime / duration, known ? 1 : 0.98);
        setProgress(p);
        setWord(wordAt(timeline, p));
      } else if (!speech.current.sawBoundary) {
        const range = timeline.sentences[speech.current.sentence];
        if (range) {
          const elapsed = (performance.now() - speech.current.startedAt) / 1000;
          const w = range[0] + Math.floor(elapsed * WORDS_PER_SECOND * SPEECH_RATE);
          showWord(timeline, Math.min(w, range[1] - 1));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const audioEnded = () => {
      if (engine.current !== 'audio') return;
      setProgress(1);
      setStatus('ended');
      onEndedRef.current(active);
    };

    frame = requestAnimationFrame(tick);
    audio.addEventListener('ended', audioEnded);
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener('ended', audioEnded);
    };
  }, [status, active, timelines, showWord]);

  const toggle = useCallback(() => {
    if (status === 'ended' || status === 'error') return start(active);

    if (engine.current === 'speech') {
      if (status === 'playing') {
        halt(); // keeps speech.current.sentence, so resume picks up from this sentence
        setStatus('paused');
      } else if (speech.current.reel === active) {
        // Resume, or the first tap after the browser blocked speech without a gesture.
        speakFrom(active, speech.current.sentence, halt());
      } else {
        start(active);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    if (status === 'playing') {
      audio.pause();
      setStatus('paused');
    } else {
      audio.play().then(
        () => setStatus('playing'),
        () => setStatus('blocked'),
      );
    }
  }, [status, active, start, halt, speakFrom]);

  return {
    status,
    word,
    progress,
    timeline: timelines[active],
    toggle,
    replay: () => start(active),
  };
}

/** Pick the most natural-sounding English voice the browser offers. Voices load async. */
function usePreferredVoice() {
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const pick = () => {
      voice.current = bestVoice(synth.getVoices());
    };
    pick();
    synth.addEventListener('voiceschanged', pick);
    return () => synth.removeEventListener('voiceschanged', pick);
  }, []);
  return voice;
}

/** Novelty voices that ship with macOS. */
const NOVELTY =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox/i;

function bestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const score = (v: SpeechSynthesisVoice) => {
    if (!/^en(-|_|$)/i.test(v.lang)) return -1;
    let s = 0;
    if (/natural|neural|premium|enhanced/i.test(v.name)) s += 5;
    if (/google us english|samantha|ava|zoe|daniel|aria|jenny|guy/i.test(v.name)) s += 3;
    if (/en[-_]US/i.test(v.lang)) s += 2;
    if (v.default) s += 1;
    if (NOVELTY.test(v.name)) s -= 10;
    return s;
  };
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const v of voices) {
    const s = score(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}
