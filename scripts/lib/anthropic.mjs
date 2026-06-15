/**
 * anthropic.mjs — Thin Anthropic client for OFFLINE generation scripts only.
 * --------------------------------------------------------------------------
 * This file is dev-time tooling. It is NEVER imported by the app bundle —
 * the runtime talks to Haiku through a server-side proxy (see
 * supabase/functions/personalize), never directly. Keeping the SDK here means
 * the API key lives only in the generator's shell, never in the browser.
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */

import Anthropic from '@anthropic-ai/sdk';
import { MODELS } from '../../src/config/brand.js';

let _client = null;

function client() {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Generation scripts call the Anthropic API; ' +
        'export the key before running content:* scripts.',
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Single text completion against the GENERATION model (Opus/Fable). Offline only.
 *
 * @param {object} args
 * @param {string} args.system  system prompt (tone-of-voice etc.)
 * @param {string} args.prompt  user message
 * @param {number} [args.maxTokens=4096]
 * @param {number} [args.retries=2]
 * @returns {Promise<string>} the assistant's text
 */
export async function generate({ system, prompt, maxTokens = 4096, retries = 2 }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const msg = await client().messages.create({
        model: MODELS.generate,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      return msg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    } catch (err) {
      lastErr = err;
      // Linear backoff; scripts are not latency-sensitive.
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pull the first fenced code block (```json … ``` or ``` … ```) or return the trimmed text. */
export function extractCodeBlock(text) {
  const fenced = text.match(/```(?:json|markdown|md)?\s*\n([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}
