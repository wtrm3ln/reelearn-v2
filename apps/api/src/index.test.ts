import { afterEach, describe, expect, it, vi } from 'vitest';
import app from './index.ts';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODELS: 'model/a:free,model/b:free',
    TTS_MODEL: '@cf/deepgram/aura-2-en',
    TTS_VOICE: 'orion',
    APP_URL: 'http://localhost:5173',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    STORE: memoryKv(),
    SCRIPT_LIMITER: { limit: async () => ({ success: true }) },
    TTS_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  } as unknown as Env;
}

/** Minimal in-memory KV with the bits the API uses (get/put/list with metadata). */
function memoryKv() {
  const data = new Map<string, { value: string; metadata?: unknown }>();
  return {
    async get(key: string, type?: string) {
      const v = data.get(key)?.value;
      if (v === undefined) return null;
      return type === 'json'
        ? JSON.parse(v)
        : type === 'arrayBuffer'
          ? new TextEncoder().encode(v).buffer
          : v;
    },
    async put(key: string, value: string | ArrayBuffer, opts?: { metadata?: unknown }) {
      data.set(key, {
        value: typeof value === 'string' ? value : new TextDecoder().decode(value),
        metadata: opts?.metadata,
      });
    },
    async list({ prefix = '' }: { prefix?: string }) {
      const keys = [...data.keys()].filter((k) => k.startsWith(prefix)).sort();
      return {
        keys: keys.map((name) => ({ name, metadata: data.get(name)!.metadata })),
        list_complete: true,
        cursor: '',
      };
    },
  };
}

const pending: Promise<unknown>[] = [];
const ctx = {
  waitUntil: (p: Promise<unknown>) => void pending.push(p.catch(() => {})),
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function postScript(body: unknown, env = makeEnv()) {
  return app.request(
    '/api/script',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    env,
    ctx,
  );
}

const LONG =
  'The moon pulls on the ocean as it orbits, raising a bulge of water on the near side and another on the far side, and as Earth spins beneath those bulges every coast sees two high tides a day.';

function completion(content: string, model = 'model/b:free') {
  return new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), {
    status: 200,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('lessons', () => {
  it('saves a generated lesson, lists it in the gallery and serves repeats without the model', async () => {
    const env = makeEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        completion(JSON.stringify({ title: 'Tides', reels: [{ title: 'Moon', text: LONG }] })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = (await (
      await postScript({ topic: 'Why  tides happen', reels: 1 }, env)
    ).json()) as { id: string; cached: boolean };
    expect(first.cached).toBe(false);
    await Promise.all(pending);

    const again = (await (
      await postScript({ topic: 'why tides happen', reels: 1 }, env)
    ).json()) as { id: string; cached: boolean };
    expect(again).toMatchObject({ id: first.id, cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const gallery = (await (await app.request('/api/lessons', {}, env, ctx)).json()) as {
      lessons: { id: string; title: string; reelCount: number }[];
    };
    expect(gallery.lessons).toEqual([
      expect.objectContaining({ id: first.id, title: 'Tides', reelCount: 1 }),
    ]);

    const one = await app.request(`/api/lessons/${first.id}`, {}, env, ctx);
    expect(one.status).toBe(200);
    expect((await app.request('/api/lessons/nope', {}, env, ctx)).status).toBe(404);
  });
});

describe('POST /api/script', () => {
  it('rejects an invalid body', async () => {
    const res = await postScript({ topic: '' });
    expect(res.status).toBe(400);
  });

  it('falls through to the next model when one fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }),
      )
      .mockResolvedValueOnce(
        completion(JSON.stringify({ title: 'Sky', reels: [{ title: 'Why blue', text: LONG }] })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await postScript({ topic: 'why is the sky blue', reels: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ title: 'Sky', model: 'model/b:free', cached: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).model).toBe('model/b:free');
  });

  it('starts the next model when the first is slow, and uses whichever answers first', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const slow = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init.signal!.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        ),
      );
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(slow)
      .mockResolvedValueOnce(
        completion(JSON.stringify({ title: 'T', reels: [{ text: `fast answer ${LONG}` }] })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const pending = postScript({ topic: 'hedging', reels: 1 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1); // no hedge yet
    await vi.advanceTimersByTimeAsync(12_000);
    const res = await pending;
    vi.useRealTimers();

    expect(res.status).toBe(200);
    expect(((await res.json()) as { reels: { text: string }[] }).reels[0]!.text).toMatch(
      /^fast answer/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal!.aborted).toBe(true);
  });

  it('rejects scripts with missing or too-short reels and tries the next model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion(JSON.stringify({ reels: [{ text: LONG }] })))
      .mockResolvedValueOnce(
        completion(JSON.stringify({ reels: [{ text: LONG }, { text: 'Too short.' }] })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = await postScript({ topic: 'tides again', reels: 2 });
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one generation between concurrent identical requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion(JSON.stringify({ title: 'X', reels: [{ text: LONG }] })));
    vi.stubGlobal('fetch', fetchMock);
    const env = makeEnv();
    const [a, b] = await Promise.all([
      postScript({ topic: 'same thing', reels: 1 }, env),
      postScript({ topic: 'same thing', reels: 1 }, env),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when every model fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    const res = await postScript({ topic: 'anything' });
    expect(res.status).toBe(503);
  });

  it('returns 429 when rate limited', async () => {
    const env = makeEnv({
      SCRIPT_LIMITER: { limit: async () => ({ success: false }) } as unknown as RateLimit,
    });
    const res = await postScript({ topic: 'anything' }, env);
    expect(res.status).toBe(429);
  });
});

describe('GET /api/lessons/:id/audio/:index', () => {
  it('synthesizes a saved reel once, then serves it from the cache', async () => {
    const env = makeEnv();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(completion(JSON.stringify({ title: 'T', reels: [{ text: LONG }] }))),
    );
    const { id } = (await (await postScript({ topic: 'audio test', reels: 1 }, env)).json()) as {
      id: string;
    };
    await Promise.all(pending);

    const run = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }),
    );
    env.AI = { run } as unknown as Ai;
    const first = await app.request(`/api/lessons/${id}/audio/0`, {}, env, ctx);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('audio/mpeg');
    const bytes = new Uint8Array(await first.arrayBuffer());
    expect(bytes.length).toBe(3 * run.mock.calls.length); // one MP3 segment per sentence group
    expect((run.mock.calls[0] as unknown[])[1]).toMatchObject({
      text: expect.any(String),
      speaker: 'orion',
    });
    await Promise.all(pending);

    const calls = run.mock.calls.length;
    const again = await app.request(`/api/lessons/${id}/audio/0`, {}, env, ctx);
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(bytes);
    expect(run.mock.calls.length).toBe(calls);

    expect((await app.request(`/api/lessons/${id}/audio/5`, {}, env, ctx)).status).toBe(404);
  });
});

describe('MeloTTS', () => {
  it('decodes base64 JSON audio and sends {prompt, lang}', async () => {
    const env = makeEnv({ TTS_MODEL: '@cf/myshell-ai/melotts' } as Partial<Env>);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(completion(JSON.stringify({ title: 'T', reels: [{ text: LONG }] }))),
    );
    const { id } = (await (await postScript({ topic: 'melo test', reels: 1 }, env)).json()) as {
      id: string;
    };
    await Promise.all(pending);

    const run = vi.fn(async () => Response.json({ audio: btoa('\x01\x02') }));
    env.AI = { run } as unknown as Ai;
    const res = await app.request(`/api/lessons/${id}/audio/0`, {}, env, ctx);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 2)]).toEqual([1, 2]);
    expect((run.mock.calls[0] as unknown[])[1]).toEqual({ prompt: expect.any(String), lang: 'en' });
  });
});

describe('splitForSpeech', () => {
  it('keeps the first group short and the rest near the target size', async () => {
    const { splitForSpeech } = await import('./tts.ts');
    const text =
      'Black holes are wild. They form when big stars die. Gravity pulls everything inward, even light itself. Past the event horizon there is no way back. Scientists first photographed one in 2019!';
    const parts = splitForSpeech(text);
    expect(parts[0]).toBe('Black holes are wild. They form when big stars die.');
    expect(parts.join(' ')).toBe(text);
    expect(parts.length).toBeGreaterThan(1);
  });
});
