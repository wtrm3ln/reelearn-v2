import { parseScript, type LlmScript, type Tone } from '@reelearn/shared';
import { buildMessages } from './prompt.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Give up on a single model after this long. */
const ATTEMPT_TIMEOUT_MS = 60_000;
/** If a model hasn't answered after this long, start the next one in parallel. */
const HEDGE_AFTER_MS = 12_000;
/** Reject scripts with reels shorter than this; the prompt asks for 45+. */
const MIN_WORDS_PER_REEL = 25;

interface ChatCompletion {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null } }[];
  error?: { message?: string; code?: number; metadata?: { raw?: string } };
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

type Input = { topic: string; reels: number; tone: Tone };
type Result = LlmScript & { model: string };

/**
 * Generate a script from OpenRouter's free models.
 *
 * Free models are often rate limited (fast 429s) or slow (reasoning models can take a
 * minute), so requests are hedged: models are tried in the configured order, the next one
 * starts as soon as the current one fails *or* has been running for HEDGE_AFTER_MS, and the
 * first usable script wins. The rest are aborted.
 */
export async function generateScript(env: Env, input: Input): Promise<Result> {
  if (!env.OPENROUTER_API_KEY) {
    throw new UpstreamError('OPENROUTER_API_KEY is not configured on the API worker', 500);
  }
  const models = env.OPENROUTER_MODELS.split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  if (models.length === 0) throw new UpstreamError('No OpenRouter models configured', 500);

  const winner = new AbortController();
  const failures: string[] = [];

  return new Promise<Result>((resolve, reject) => {
    let next = 0;
    let running = 0;
    let settled = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null;

    const launch = () => {
      clearTimeout(hedgeTimer);
      if (settled || next >= models.length) return;
      const model = models[next++]!;
      running++;
      hedgeTimer = setTimeout(launch, HEDGE_AFTER_MS);
      const started = Date.now();

      attempt(env, model, input, winner.signal).then(
        (result) => {
          running--;
          if (settled) return;
          settled = true;
          clearTimeout(hedgeTimer);
          winner.abort();
          console.log(`script ok: ${result.model} in ${Date.now() - started}ms`);
          resolve(result);
        },
        (err: unknown) => {
          running--;
          if (settled) return;
          const reason = `${model}: ${err instanceof Error ? err.message : String(err)}`;
          failures.push(reason);
          console.warn(`script attempt failed after ${Date.now() - started}ms: ${reason}`);
          if (next < models.length) launch();
          else if (running === 0) {
            settled = true;
            clearTimeout(hedgeTimer);
            console.error('All OpenRouter models failed', failures);
            reject(
              new UpstreamError(
                'All free models are busy right now. Please try again in a minute.',
                503,
              ),
            );
          }
        },
      );
    };

    launch();
  });
}

async function attempt(
  env: Env,
  model: string,
  input: Input,
  cancel: AbortSignal,
): Promise<Result> {
  const signal = AbortSignal.any([cancel, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)]);
  let body: ChatCompletion;
  let status: number;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.APP_URL,
        'X-Title': 'Reelearn',
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(input.topic, input.reels, input.tone),
        temperature: 0.8,
        // Many free models reason before answering; reasoning tokens count against this.
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        reasoning: { effort: 'low', exclude: true },
      }),
    });
    status = res.status;
    body = (await res.json()) as ChatCompletion;
  } catch (err) {
    if (signal.aborted) {
      throw new Error(
        cancel.aborted ? 'cancelled' : `timed out after ${ATTEMPT_TIMEOUT_MS / 1000}s`,
      );
    }
    throw err;
  }

  if (status >= 400 || body.error) {
    const detail =
      body.error?.code === 429 ? 'rate limited' : (body.error?.message ?? `HTTP ${status}`);
    throw new Error(detail);
  }
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error('ran out of tokens');

  const script = parseScript(choice?.message?.content ?? '', input.reels);
  // Small free models sometimes cut corners; treat that as a failed attempt so the next model runs.
  if (script.reels.length < input.reels) {
    throw new Error(`returned ${script.reels.length} of ${input.reels} reels`);
  }
  const shortest = Math.min(...script.reels.map((r) => r.text.split(/\s+/).length));
  if (shortest < MIN_WORDS_PER_REEL) throw new Error(`reel too short (${shortest} words)`);
  return { ...script, model: body.model ?? model };
}
