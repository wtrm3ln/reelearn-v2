import { UpstreamError } from './openrouter.ts';

/**
 * Text-to-speech on Workers AI, returned as an MP3 stream.
 *
 * Synthesis time grows with text length (a 70-word reel takes ~10s in one call), so the text
 * is split into sentence groups that are synthesized in parallel and streamed back in order.
 * MP3 frames concatenate cleanly, so the client sees one continuous file and can start
 * playing as soon as the first sentence is ready.
 */
export async function synthesize(env: Env, text: string): Promise<ReadableStream<Uint8Array>> {
  const jobs = splitForSpeech(text).map((part) => synthesizeOne(env, part));
  // Avoid unhandled rejections for later parts if we bail out on the first one.
  jobs.forEach((job) => job.catch(() => {}));

  const first = await jobs[0]!; // fail before sending headers if TTS is down
  let i = 1;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(first));
    },
    async pull(controller) {
      if (i >= jobs.length) return controller.close();
      try {
        controller.enqueue(new Uint8Array(await jobs[i++]!));
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Split into sentences, then group them so each request is a reasonable size. The first
 * group is kept short so playback starts quickly.
 */
export function splitForSpeech(text: string, target = 160): string[] {
  const sentences =
    text
      .match(/[^.!?]+(?:[.!?]+["')\]]?|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (sentences.length === 0) return [text];
  const groups: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const limit = groups.length === 0 ? target / 2 : target;
    if (current && current.length + sentence.length + 1 > limit) {
      groups.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) groups.push(current);
  return groups;
}

/**
 * Deepgram Aura models return raw MP3; MeloTTS returns JSON with base64 audio. Asking for the
 * raw response and branching on content-type lets TTS_MODEL be switched without code changes.
 */
async function synthesizeOne(env: Env, text: string): Promise<ArrayBuffer> {
  const model = env.TTS_MODEL as keyof AiModels;
  const input = env.TTS_MODEL.includes('melotts')
    ? { prompt: text, lang: 'en' }
    : { text, speaker: env.TTS_VOICE, encoding: 'mp3' };

  let res: Response;
  try {
    res = await env.AI.run(model, input as never, { returnRawResponse: true });
  } catch (err) {
    console.error('TTS failed', err);
    throw new UpstreamError('Text-to-speech is unavailable right now', 502);
  }
  if (!res.ok) {
    console.error('TTS failed', res.status, await res.text().catch(() => ''));
    throw new UpstreamError('Text-to-speech is unavailable right now', 502);
  }

  if ((res.headers.get('content-type') ?? '').includes('json')) {
    const body = (await res.json()) as { audio?: string; result?: { audio?: string } };
    const b64 = body.audio ?? body.result?.audio;
    if (!b64) throw new UpstreamError('Text-to-speech returned no audio', 502);
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  }
  return res.arrayBuffer();
}
