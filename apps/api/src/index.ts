import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  LESSON_ID,
  scriptRequestSchema,
  type ApiError,
  type Lesson,
  type LessonPage,
  type ScriptResponse,
} from '@reelearn/shared';
import { generateScript, UpstreamError } from './openrouter.ts';
import { synthesize } from './tts.ts';
import * as cache from './cache.ts';
import { getLesson, lessonId, listLessons, saveLesson } from './lessons.ts';

type AppEnv = { Bindings: Env };

/** Generations in progress in this isolate, by lesson id. */
const inflight = new Map<string, Promise<Lesson>>();

const app = new Hono<AppEnv>().basePath('/api');

app.use('*', async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return cors({ origin: (origin) => (allowed.includes(origin) ? origin : null) })(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));

app.post('/script', async (c) => {
  const limited = await rateLimit(c, c.env.SCRIPT_LIMITER);
  if (limited) return limited;

  const parsed = scriptRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json<ApiError>({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }
  const input = parsed.data;

  // Every lesson is saved, so asking for the same thing again is free and instant.
  const id = await lessonId(input);
  const existing = await getLesson(c.env, id);
  if (existing) return c.json<ScriptResponse>({ ...existing, cached: true });

  // Concurrent requests for the same lesson (double clicks, retries) share one generation.
  // The save runs in waitUntil, so a lesson is kept even if the viewer gives up waiting.
  let job = inflight.get(id);
  if (!job) {
    job = generateScript(c.env, input).then((script): Lesson => ({
      id,
      topic: input.topic,
      tone: input.tone,
      title: script.title || input.topic,
      reels: script.reels,
      model: script.model,
      createdAt: new Date().toISOString(),
    }));
    inflight.set(id, job);
    c.executionCtx.waitUntil(
      job
        .then((lesson) => saveLesson(c.env, lesson))
        .catch((err) => console.error('lesson not saved', err))
        .finally(() => inflight.delete(id)),
    );
  }

  try {
    return c.json<ScriptResponse>({ ...(await job), cached: false });
  } catch (err) {
    return upstreamError(c, err);
  }
});

app.get('/lessons', async (c) => {
  const cursor = c.req.query('cursor') || undefined;
  c.header('Cache-Control', 'public, max-age=15');
  return c.json<LessonPage>(await listLessons(c.env, cursor));
});

app.get('/lessons/:id', async (c) => {
  const id = c.req.param('id');
  const lesson = LESSON_ID.test(id) ? await getLesson(c.env, id) : null;
  if (!lesson) return c.json<ApiError>({ error: 'Lesson not found' }, 404);
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json<ScriptResponse>({ ...lesson, cached: true });
});

// Narration for one reel of a saved lesson. A plain GET so an <audio> element can stream it.
// The text comes from the stored lesson, never the client, so this can't be used as a
// general-purpose TTS proxy.
app.get('/lessons/:id/audio/:index', async (c) => {
  const id = c.req.param('id');
  const index = Number(c.req.param('index'));
  const lesson = LESSON_ID.test(id) ? await getLesson(c.env, id) : null;
  const reel = Number.isInteger(index) ? lesson?.reels[index] : undefined;
  if (!reel) return c.json<ApiError>({ error: 'Not found' }, 404);

  const headers = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  const key = cache.audioKey(c.env, id, index);
  const cached = await cache.getAudio(c.env, key);
  if (cached) return new Response(cached, { headers });

  // Only fresh synthesis counts against the limit; replays from the cache are free.
  const limited = await rateLimit(c, c.env.TTS_LIMITER);
  if (limited) return limited;

  let audio: ReadableStream<Uint8Array>;
  try {
    audio = await synthesize(c.env, reel.text);
  } catch (err) {
    return upstreamError(c, err);
  }

  // Stream to the client while a copy is collected for the cache.
  const [toClient, toCache] = audio.tee();
  c.executionCtx.waitUntil(
    new Response(toCache).arrayBuffer().then((buf) => cache.putAudio(c.env, key, buf)),
  );
  return new Response(toClient, { headers });
});

app.notFound((c) => c.json<ApiError>({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json<ApiError>({ error: 'Something went wrong' }, 500);
});

async function rateLimit(c: Context<AppEnv>, limiter: RateLimit | undefined) {
  if (!limiter) return null;
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const { success } = await limiter.limit({ key: ip });
  return success
    ? null
    : c.json<ApiError>(
        { error: 'Slow down a little — too many requests. Try again in a minute.' },
        429,
      );
}

function upstreamError(c: Context<AppEnv>, err: unknown) {
  if (err instanceof UpstreamError) {
    return c.json<ApiError>({ error: err.message }, err.status as 500 | 502 | 503);
  }
  throw err;
}

export default app;
