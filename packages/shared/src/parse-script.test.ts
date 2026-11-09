import { describe, expect, it } from 'vitest';
import { parseScript, cleanText } from './parse-script.ts';

describe('parseScript', () => {
  it('parses plain JSON', () => {
    const raw = JSON.stringify({
      title: 'Black holes',
      reels: [
        { title: 'Hook', text: 'Imagine gravity so strong light gives up.' },
        { title: 'How', text: 'A dying star collapses into a point.' },
      ],
    });
    const out = parseScript(raw, 5);
    expect(out.title).toBe('Black holes');
    expect(out.reels).toHaveLength(2);
    expect(out.reels[1]?.title).toBe('How');
  });

  it('parses fenced JSON after a think block', () => {
    const raw =
      '<think>Let me plan this out...</think>\nSure! Here it is:\n```json\n{"title":"T","reels":[{"title":"A","text":"one"}]}\n```';
    const out = parseScript(raw, 5);
    expect(out.reels).toEqual([{ title: 'A', text: 'one' }]);
  });

  it('falls back to legacy [Part N] markers', () => {
    const raw =
      '[Part 1] Ever wondered why the sky is blue? It is scattering.\n\n[Part 2] Shorter wavelengths scatter more, so blue wins.';
    const out = parseScript(raw, 5);
    expect(out.reels).toHaveLength(2);
    expect(out.reels[0]?.text).toMatch(/^Ever wondered/);
  });

  it('treats short same-line text after a marker as a title', () => {
    const raw =
      '**Part 1: The Hook**\nYou use it every day without knowing.\n\n**Part 2: The Twist**\nIt was invented by accident.';
    const out = parseScript(raw, 5);
    expect(out.reels[0]).toEqual({
      title: 'The Hook',
      text: 'You use it every day without knowing.',
    });
    expect(out.reels[1]?.title).toBe('The Twist');
  });

  it('caps the number of reels', () => {
    const raw = JSON.stringify({ reels: [1, 2, 3, 4].map((n) => ({ text: `reel ${n}` })) });
    expect(parseScript(raw, 2).reels).toHaveLength(2);
  });

  it('rejects truncated JSON instead of narrating it', () => {
    expect(() =>
      parseScript('{"title": "Sky", "reels": [{"title": "A", "text": "Sunlight is', 3),
    ).toThrow(/malformed/);
  });

  it('throws on empty output', () => {
    expect(() => parseScript('<think>hmm</think>', 3)).toThrow();
  });
});

describe('cleanText', () => {
  it('strips markdown, emoji and stage directions', () => {
    expect(cleanText('**Wow** 🔥 this is [music swells] _wild_')).toBe('Wow this is wild');
  });
});
