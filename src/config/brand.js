/**
 * brand.js — Single source of truth for branding + content-pipeline config.
 * ------------------------------------------------------------------------
 * The app's working name is "Paced", but the public name is in transition.
 * Nothing user-facing should hardcode it: read `BRAND_NAME` from here.
 *
 * Isomorphic: safe to import from both the browser bundle and Node scripts
 * (`scripts/*.mjs`). No DOM/React imports at module scope; `window` access
 * is guarded so Node falls back to the defaults.
 *
 * NOTE on storage keys: existing installs persist data under the `paced.*`
 * localStorage prefix (`paced.locale`, `paced.partner.consent.v1`, …). That
 * prefix is FROZEN — renaming it would orphan real user data. `BRAND_NAME`
 * is the *display* name only; `STORAGE_PREFIX` is an internal, stable id.
 */

/** Read a deploy-time override from `window.PACED_<KEY>`, else fall back. */
function fromWindow(key, fallback) {
  try {
    if (typeof window !== 'undefined' && window[`PACED_${key}`]) {
      return window[`PACED_${key}`];
    }
  } catch {
    /* no window (Node) or locked-down global — use fallback */
  }
  return fallback;
}

/** Public, user-facing brand name. Override at deploy time via window.PACED_BRAND_NAME. */
export const BRAND_NAME = fromWindow('BRAND_NAME', 'Paced');

/** Frozen internal id for storage keys, cache names, namespaced globals. Do NOT change. */
export const STORAGE_PREFIX = 'paced';

/**
 * Model ids, split by pipeline phase. The split is load-bearing:
 *   - `generate` (Opus/Fable) runs ONLY in offline scripts/*.mjs.
 *   - `personalize` (Haiku) is the ONLY model allowed in the runtime path.
 * The runtime must never reference `MODELS.generate`.
 */
export const MODELS = Object.freeze({
  generate: 'claude-opus-4-8',
  personalize: 'claude-haiku-4-5-20251001',
});

/**
 * Endpoint for the runtime personalization proxy (Haiku, server-side key).
 * Empty string ⇒ runtime AI disabled ⇒ free-text falls back to pure template
 * interpolation. Set via window.PACED_CONTENT_PROXY_URL at deploy time.
 */
export const CONTENT_PROXY_URL = fromWindow('CONTENT_PROXY_URL', '');
