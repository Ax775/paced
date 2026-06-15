/**
 * personalize.js — Runtime content personalization.
 * --------------------------------------------------
 * Two paths, by cost:
 *
 *   personalize()          DEFAULT. Pure template interpolation from user
 *                          state. No network, no AI, free and instant.
 *
 *   personalizeFreeText()  ONLY when the user wrote something (journaling).
 *                          Calls Haiku via a server-side proxy, using the
 *                          tone-of-voice + a matching template as the frame,
 *                          with a low token cap. Output is guardrail-checked;
 *                          any violation, empty result, or error falls back to
 *                          the neutral template.
 *
 * INVARIANT: the runtime never touches the generation model (Opus/Fable).
 * Only MODELS.personalize (Haiku) is ever referenced here.
 */

import { CONTENT_PROXY_URL, MODELS } from '../../config/brand.js';
import { checkGuardrails } from './guardrails.js';
import { selectTemplate } from './templates.js';

/** Hard cap on free-text we forward to the proxy (cost + privacy). */
export const MAX_INPUT_CHARS = 600;

/** Low output cap — these are short, supportive replies, not essays. */
export const MAX_OUTPUT_TOKENS = 160;

/**
 * Default, AI-free personalization. Always cheap, always offline.
 *
 * @param {string} category
 * @param {object} [opts] forwarded to selectTemplate (locale, phase, state, seed)
 * @returns {{ id: string, text: string } | null}
 */
export function personalize(category, opts = {}) {
  return selectTemplate(category, opts);
}

/**
 * The injectable transport. Posts a personalization request to the proxy,
 * which holds the API key and the tone-of-voice server-side. Tests pass their
 * own client; production uses this one.
 */
async function defaultClient(req) {
  if (!CONTENT_PROXY_URL) throw new Error('content proxy not configured');
  const res = await fetch(CONTENT_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`proxy responded ${res.status}`);
  return res.json();
}

/**
 * Personalize around free-text the user wrote. Falls back to a neutral
 * template whenever the AI path is unavailable, empty, unsafe, or errors.
 *
 * @param {object} args
 * @param {string} args.category
 * @param {string} [args.locale='nl']
 * @param {string} [args.phase]
 * @param {object} [args.state]
 * @param {string} [args.userText]  what the user wrote; empty ⇒ no AI call
 * @param {string} [args.seed]
 * @param {(req: object) => Promise<{ text?: string }>} [args.client]
 * @returns {Promise<{ id: string, text: string, source: 'ai' | 'template' } | null>}
 */
export async function personalizeFreeText(args) {
  const {
    category,
    locale = 'nl',
    phase,
    state = {},
    userText = '',
    seed = '',
    client = defaultClient,
  } = args || {};

  const base = selectTemplate(category, { locale, phase, state, seed });
  const fallback = base ? { ...base, source: 'template' } : null;

  // No free text ⇒ stay on the free path entirely.
  if (typeof userText !== 'string' || !userText.trim()) return fallback;

  try {
    const result = await client({
      model: MODELS.personalize, // Haiku — the ONLY model the runtime may use
      category,
      locale,
      phase,
      templateHint: base?.text || '',
      userText: userText.slice(0, MAX_INPUT_CHARS),
      maxTokens: MAX_OUTPUT_TOKENS,
    });

    const text = (result && typeof result.text === 'string' ? result.text : '').trim();
    if (!text) return fallback;

    // Guardrail the model output; any violation ⇒ neutral template.
    if (!checkGuardrails(text).ok) return fallback;

    return { id: 'ai', text, source: 'ai' };
  } catch {
    return fallback;
  }
}
