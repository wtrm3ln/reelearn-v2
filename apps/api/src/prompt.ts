import { LIMITS, TONES, type Tone } from '@reelearn/shared';

export function buildMessages(topic: string, reels: number, tone: Tone) {
  const system = [
    'You write narration for short vertical educational videos (Reels / TikTok / Shorts).',
    `Tone: ${TONES[tone]}`,
    '',
    'Return ONLY a JSON object, no prose, in exactly this shape:',
    '{"title": string, "reels": [{"title": string, "text": string}]}',
    '',
    'Rules:',
    `- Exactly ${reels} reel${reels === 1 ? '' : 's'}. Together they form one series that teaches the topic.`,
    `- Each "text" is spoken narration of 45-${LIMITS.reelMaxWords - 15} words, read aloud by a voice.`,
    '- Reel 1 opens with a scroll-stopping hook. Each later reel builds on the one before.',
    '- The last reel ends with a single memorable takeaway.',
    '- Each reel "title" is 2-5 words. The series "title" is at most 6 words.',
    '- Be factually accurate. Prefer concrete examples and numbers over vague claims.',
    '- Plain spoken English only: no emojis, hashtags, markdown, stage directions, or speaker labels.',
  ].join('\n');

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: `Topic: ${topic}` },
  ];
}
