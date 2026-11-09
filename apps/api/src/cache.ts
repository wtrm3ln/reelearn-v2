/**
 * Narration audio, stored in the STORE KV namespace with no expiry: each saved lesson's
 * audio is synthesized once, so replays from the gallery cost no Workers AI usage.
 * Failures degrade to a cache miss.
 */

export function audioKey(env: Env, lessonId: string, index: number): string {
  return `audio:${lessonId}:${index}:${env.TTS_MODEL}:${env.TTS_VOICE}`;
}

export async function getAudio(env: Env, key: string): Promise<ArrayBuffer | null> {
  try {
    return await env.STORE.get(key, 'arrayBuffer');
  } catch {
    return null;
  }
}

export async function putAudio(env: Env, key: string, audio: ArrayBuffer): Promise<void> {
  try {
    await env.STORE.put(key, audio);
  } catch (err) {
    console.warn('audio cache put failed', err);
  }
}
