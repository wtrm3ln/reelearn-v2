/**
 * Caption timing. TTS gives us an MP3 with no word timestamps, so we estimate each word's
 * position from its length plus a pause after punctuation. Good enough to keep big
 * on-screen captions in step with the voice.
 */

export interface Timeline {
  words: string[];
  /** Cumulative end position of each word, normalised to 0..1. */
  ends: number[];
  /** Words grouped into short on-screen chunks: [startWord, endWordExclusive]. */
  chunks: [number, number][];
  /** Sentences as word ranges: [startWord, endWordExclusive]. */
  sentences: [number, number][];
}

const MAX_CHUNK_WORDS = 4;

export function buildTimeline(text: string): Timeline {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => {
    let weight = w.replace(/[^\p{L}\p{N}]/gu, '').length + 2;
    if (/[.!?]["')\]]?$/.test(w)) weight += 6;
    else if (/[,;:—–-]["')\]]?$/.test(w)) weight += 3;
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const ends = weights.map((w) => (acc += w) / total);

  const chunks: [number, number][] = [];
  let start = 0;
  words.forEach((w, i) => {
    const size = i - start + 1;
    const breakHere = /[.!?,;:]["')\]]?$/.test(w) || size >= MAX_CHUNK_WORDS;
    if (breakHere || i === words.length - 1) {
      chunks.push([start, i + 1]);
      start = i + 1;
    }
  });

  const sentences: [number, number][] = [];
  let sentenceStart = 0;
  words.forEach((w, i) => {
    if (/[.!?]["')\]]?$/.test(w) || i === words.length - 1) {
      sentences.push([sentenceStart, i + 1]);
      sentenceStart = i + 1;
    }
  });

  return { words, ends, chunks, sentences };
}

export function wordAt(timeline: Timeline, progress: number): number {
  const i = timeline.ends.findIndex((end) => progress <= end);
  return i === -1 ? timeline.words.length - 1 : i;
}

/**
 * Map a character offset within the text `words[start..end)` (as spoken by one utterance,
 * from a speechSynthesis boundary event) to a word index.
 */
export function wordAtChar(
  timeline: Timeline,
  start: number,
  end: number,
  charIndex: number,
): number {
  let pos = 0;
  for (let i = start; i < end; i++) {
    pos += timeline.words[i]!.length + 1;
    if (charIndex < pos) return i;
  }
  return end - 1;
}

export function chunkFor(timeline: Timeline, word: number): [number, number] {
  return timeline.chunks.find(([s, e]) => word >= s && word < e) ?? timeline.chunks[0] ?? [0, 0];
}
