import { llmScriptSchema, type LlmScript, type Reel } from './schema.ts';

/**
 * Free models are inconsistent about following output formats, so parse defensively:
 *   1. JSON (optionally inside ``` fences, possibly preceded by <think> blocks)
 *   2. "[Part N]" / "Part N:" markers (the legacy format)
 *   3. blank-line separated paragraphs
 */
export function parseScript(raw: string, maxReels: number): LlmScript {
  const cleaned = stripReasoning(raw);

  const fromJson = tryParseJson(cleaned);
  if (fromJson) return finalize(fromJson.title, fromJson.reels, maxReels);
  // Looks like JSON but didn't parse (usually truncated): don't read raw JSON aloud.
  if (/^\s*(```(json)?\s*)?\{/i.test(cleaned)) throw new Error('Model returned malformed JSON');

  const fromMarkers = splitOnPartMarkers(cleaned);
  if (fromMarkers.length > 0) return finalize('', fromMarkers, maxReels);

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => cleanText(p))
    .filter((p) => p.split(/\s+/).length >= 8)
    .map((text) => ({ title: '', text }));
  if (paragraphs.length > 0) return finalize('', paragraphs, maxReels);

  const whole = cleanText(cleaned);
  if (!whole) throw new Error('Model returned an empty script');
  return finalize('', [{ title: '', text: whole }], maxReels);
}

function stripReasoning(raw: string): string {
  return raw.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
}

function tryParseJson(text: string): LlmScript | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, text];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const result = llmScriptSchema.safeParse(JSON.parse(candidate.trim()));
      if (result.success) return result.data;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const PART_MARKER =
  /^\s*(?:\*\*|#+\s*)?\[?\s*(?:part|reel|video)\s*(\d+)\s*\]?(?:\*\*)?\s*[:.\-–—]?\s*(.*)$/gim;

function splitOnPartMarkers(text: string): Reel[] {
  const matches = [...text.matchAll(PART_MARKER)];
  if (matches.length === 0) return [];
  return matches
    .map((match, i) => {
      const bodyStart = (match.index ?? 0) + match[0].length;
      const bodyEnd = matches[i + 1]?.index ?? text.length;
      const sameLine = (match[2] ?? '').trim();
      const body = text.slice(bodyStart, bodyEnd);
      // "Part 1: The Hook" followed by a body -> title; "[Part 1] Some sentence..." -> body
      const looksLikeTitle = sameLine.length > 0 && sameLine.length < 60 && body.trim().length > 0;
      return {
        title: looksLikeTitle ? cleanText(sameLine) : '',
        text: cleanText(looksLikeTitle ? body : `${sameLine} ${body}`),
      };
    })
    .filter((reel) => reel.text.length > 0);
}

/** Remove markdown, emoji and stage directions so the text reads well aloud. */
export function cleanText(text: string): string {
  return text
    .replace(/\[(?:music|sfx|pause|beat)[^\]]*\]/gi, '')
    .replace(/\((?:music|sfx|pause|beat)[^)]*\)/gi, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function finalize(title: string, reels: Reel[], maxReels: number): LlmScript {
  const cleanedReels = reels
    .map((reel) => ({ title: cleanText(reel.title), text: cleanText(reel.text) }))
    .filter((reel) => reel.text.length > 0)
    .slice(0, maxReels);
  if (cleanedReels.length === 0) throw new Error('Model returned an empty script');
  return { title: cleanText(title), reels: cleanedReels };
}
