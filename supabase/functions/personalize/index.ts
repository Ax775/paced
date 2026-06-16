// Supabase Edge Function: personalize
// ====================================
// Runtime content personalization proxy. The browser (src/lib/content/
// personalize.js → personalizeFreeText) posts free-text journaling context
// here; we call Haiku with the tone-of-voice + a template hint as the frame
// and return a short, supportive reply. The Anthropic API key stays
// server-side — it never reaches the client.
//
// HARD RULE: this proxy only ever calls the Haiku personalization model. The
// generation model (Opus/Fable) is offline-only and must never appear here.
//
// Guardrails are enforced again on BOTH sides: the client re-checks output and
// falls back to a neutral template on any violation, so a prompt-injected or
// off-voice reply can never reach the user.
//
// Required secrets (supabase secrets set ...):
//   ANTHROPIC_API_KEY   sk-ant-…
//   PACED_TONE_OF_VOICE (optional) the tone-of-voice.md contents; if unset a
//                        compact built-in guide is used.
//
// Deploy: supabase functions deploy personalize

const PERSONALIZE_MODEL = 'claude-haiku-4-5-20251001'; // mirrors MODELS.personalize
const MAX_INPUT_CHARS = 600;
const MAX_OUTPUT_TOKENS = 160;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACK_TOV = `Warm, never patronising. No medical claims, no diagnoses. No calorie or
weight numbers. No comparative body language. No shame, guilt, or diet-culture framing. Body-positive,
consent-forward. Use {brand} for the app name; never hardcode it. Reply in the user's locale, briefly.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'not configured' }, 503);

    const body = await req.json().catch(() => ({}));
    const userText = String(body.userText ?? '').slice(0, MAX_INPUT_CHARS).trim();
    if (!userText) return json({ text: '' });

    const locale = body.locale === 'en' ? 'en' : 'nl';
    const templateHint = String(body.templateHint ?? '').slice(0, 400);
    const category = String(body.category ?? 'journal').slice(0, 40);
    const tov = Deno.env.get('PACED_TONE_OF_VOICE') ?? FALLBACK_TOV;

    const system =
      `${tov}\n\nYou are responding to a wellness journaling entry (category: ${category}). ` +
      `Reply in ${locale === 'en' ? 'English' : 'Dutch'} with ONE short, supportive sentence. ` +
      `Stay strictly within the tone-of-voice. If the template hint fits, echo its spirit.`;

    const userMsg = templateHint
      ? `Template hint: "${templateHint}"\n\nThe user wrote: "${userText}"`
      : `The user wrote: "${userText}"`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PERSONALIZE_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    if (!res.ok) return json({ text: '' }); // client falls back to template
    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();

    return json({ text });
  } catch (_err) {
    return json({ text: '' }); // never leak errors; client falls back
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}
