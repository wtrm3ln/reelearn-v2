# Reelearn

Learn anything as a short series of narrated, swipeable reels. Type a topic, and a free LLM on
[OpenRouter](https://openrouter.ai) writes a 1–5 part script, Workers AI narrates it, and the
app plays it back TikTok-style with big word-by-word captions over gameplay footage. Every
generated lesson is saved to a public gallery on the home page.

Runs entirely on Cloudflare: **Pages** for the frontend, a **Worker** for the API.

```
reelearn/
├── apps/
│   ├── web/            Cloudflare Pages: Vite + React + Tailwind
│   │   └── functions/  Pages Function proxying /api/* to the Worker (service binding)
│   └── api/            Cloudflare Worker: Hono, OpenRouter, Workers AI TTS, KV
└── packages/
    └── shared/         Types, zod request schemas, LLM output parser (+ tests)
```

## How it works

```
browser ──/api/*──▶ Pages Function ──service binding──▶ reelearn-api Worker
                                                          ├─ POST /api/script               → OpenRouter (free models)
                                                          ├─ GET  /api/lessons              → gallery (KV)
                                                          ├─ GET  /api/lessons/:id          → saved lesson (KV)
                                                          └─ GET  /api/lessons/:id/audio/:n → Workers AI TTS, cached in KV
```

- **Scripts.** `OPENROUTER_MODELS` is an ordered list of free models. Requests are _hedged_:
  the next model starts as soon as one fails (free models are often rate limited) or has been
  running for 12s, and the first valid script wins. Output is parsed defensively (JSON, fenced
  JSON, `[Part N]` markers, paragraphs), and scripts with missing or too-short reels are
  rejected so the next model gets a turn.
- **Lessons are saved.** Each lesson's id is a hash of topic + reel count + style, so asking for
  the same thing again returns the saved lesson instantly without calling a model. After
  generating, the URL becomes `/?lesson=<id>`, a permalink that never regenerates.
- **Narration.** The reel text is split into sentence groups that are synthesized in parallel and
  streamed back in order as one MP3, so playback starts after the first sentence. Audio is stored
  in KV permanently, so replays cost nothing. If TTS fails, the browser's built-in speech
  synthesis takes over.
- **Abuse limits.** Per-IP rate limits on script generation and fresh TTS. The audio endpoint
  only speaks text from saved lessons, so it can't be used as an open TTS proxy.

## Local development

Requires Node 20+ and a free [OpenRouter API key](https://openrouter.ai/settings/keys).

```bash
npm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then paste your OpenRouter key
npx wrangler login                                  # Workers AI runs remotely, even in dev
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `wrangler dev` on :8787. KV and rate limits
are simulated locally. Workers AI calls are real and count against your account's allowance.

```bash
npm run check      # typecheck + tests in every workspace
npm run build      # production build of the web app
```

## Deploying

```bash
npx wrangler secret put OPENROUTER_API_KEY --cwd apps/api   # once
npm run deploy     # deploys the API Worker, then builds + deploys the Pages site
```

The first `wrangler deploy` provisions the `STORE` KV namespace automatically, and the first
`wrangler pages deploy` creates the `reelearn` Pages project. Deploy the Worker first: the
Pages project's `API` service binding points at `reelearn-api`. If you use a custom domain,
update `APP_URL` and `ALLOWED_ORIGINS` in `apps/api/wrangler.jsonc`.

To deploy from git instead, connect the repo in the Cloudflare dashboard: a Pages project with
root `apps/web`, build command `npm run build`, output `dist`, and Workers Builds for
`apps/api`.

## Configuration (`apps/api/wrangler.jsonc`)

| Var                 | Default                                                     | Notes                                                                                                                                         |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_MODELS` | gemma-4-31b → dots-3-note → xing4.0-29b → `openrouter/free` | Free models change often; see [openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0).                                   |
| `TTS_MODEL`         | `@cf/myshell-ai/melotts`                                    | Cheap enough for the free plan. `@cf/deepgram/aura-2-en` sounds much better but uses the 10k neurons/day free allowance after about 12 reels. |
| `TTS_VOICE`         | `orion`                                                     | Aura voices only.                                                                                                                             |

## Limits worth knowing

- OpenRouter free models: roughly 50 requests/day per account without credits (1,000/day with
  $10+ of credits). Hedging can spend 2–3 requests on a slow generation.
- Workers AI free plan: 10,000 neurons/day across the account.
- The gallery is public and unmoderated: anyone can see every topic that was generated.

The pre-rework Next.js app and Worker live in `_legacy/` locally. That folder is git-ignored
because it contains hardcoded API keys.
