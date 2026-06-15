# Content Pipeline — todo

> Doel: kostenefficiënte content-pipeline. **Opus/Fable (`claude-opus-4-8`)** genereert
> eenmalig offline; **Haiku (`claude-haiku-4-5-20251001`)** personaliseert runtime
> alleen bij vrije tekst. App-naam altijd via `BRAND_NAME`-config, nooit hardcoded.

## Codebase-bevindingen (vastgelegd)
- App heet **Paced**, hardcoded op 3 niveaus: `PACED_*` globals, `paced.*`
  localStorage-keys (zitten in user-data → niet zomaar hernoemen), UI-copy + headers.
- Pure **JS/ESM**: `.js`/`.jsx` bron, `.mjs` scripts, vitest `.js`-tests, esbuild-build.
  Geen tsconfig. `engines: node >=20`.
- `supabase/functions/*` = Deno **TS** edge functions → runtime-proxy hoort hier (`.ts`).
- Content woont nu in `src/lib/insights.js` (date-seeded tip-pools per fase).

## Beslissingen (met user bevestigd)
1. **Taal: match repo** → `.mjs`/`.js` (geen TS-toolchain toevoegen). Edge-fn blijft Deno-TS.
2. **API-client: `@anthropic-ai/sdk` als devDependency** — alleen offline gen-scripts.
   Runtime-Haiku via config-baar proxy-endpoint (geen key in browser).
3. **Seed-content wordt gecommit** = offline-fallback + testfixture. Live-generatie
   (echte API-call) draai ik hier niet (geen key/kosten); scripts zijn wél runnable.

## Geraakte / nieuwe bestanden
**Config (SSOT)**
- [ ] `src/config/brand.js` — `BRAND_NAME` + key-prefix + model-ids + proxy-endpoint config.

**Guardrails (gedeeld: review-stap + runtime)**
- [ ] `src/lib/content/guardrails.js` — checklist: geen medisch advies/diagnose, geen
      calorie-/gewichtgetallen, geen vergelijkende lichaamstaal. `checkGuardrails(text)`.

**Gen-scripts (Opus/Fable, offline)**
- [ ] `scripts/lib/anthropic.mjs` — dunne SDK-wrapper + model-constants + retry.
- [ ] `scripts/lib/content-spec.mjs` — categorieën, JSON-schema, verboden frames.
- [ ] `scripts/generate-tov.mjs` → `content/tone-of-voice.md`.
- [ ] `scripts/generate-templates.mjs` → `content/templates/<cat>.json` + review-stap
      (2e Opus-call tegen tov + guardrails; afgekeurd regenereren, max 2 rondes).
- [ ] `scripts/regen.mjs` — dispatch `--category=<cat>` voor `content:regen`.

**Seed-content (gecommit, offline-fallback)**
- [ ] `content/tone-of-voice.md`.
- [ ] `content/templates/{daily-checkin,cycle-phase,sleep,movement,nutrition,mindfulness,notification}.json`
      — ≥8 varianten per categorie per locale (nl+en), schema-conform, guardrail-clean.

**Runtime personalisatie**
- [ ] `src/lib/content/templates.js` — laadt/valideert template-JSON, slot-interpolatie.
- [ ] `src/lib/content/personalize.js` — default = pure interpolatie (gratis/instant);
      vrije tekst → Haiku via proxy met tov+template als kader, lage max-tokens,
      guardrail op output, fallback naar neutrale template. **Nooit opus in dit pad.**
- [ ] `supabase/functions/personalize/index.ts` — Deno Haiku-proxy (key server-side).

**Regen-flow**
- [ ] package.json scripts: `content:tov`, `content:templates`, `content:regen`.

**Tests**
- [ ] `tests/content-templates.test.js` — snapshot op schema van elke categorie-JSON.
- [ ] `tests/content-personalize.test.js` — runtime roept **nooit** `claude-opus-4-8`;
      injecteerbare client → assert Haiku-model-id; default-pad doet geen call.
- [ ] `tests/content-guardrails.test.js` — 5 verboden-frame fixtures → allemaal fallback.

## Risico's
- Hernoemen `paced.*` localStorage-keys breekt bestaande installs → **niet doen** in deze
  taak; `BRAND_NAME` is display-naam, key-prefix blijft `paced` (gedocumenteerd in brand.js).
- Browser mag geen API-key zien → runtime-AI strikt via proxy; default-pad blijft offline.
- Health-domein: alle gegenereerde + seed-content moet door `checkGuardrails`.

## Niet-doelen
- Bestaande `insights.js` migreren/vervangen (kan later; pipeline staat los).
- Live API-generatie draaien / kosten maken.
- Auth/proxy-hosting deployen; edge-fn wordt geleverd, niet uitgerold.
- TS-toolchain introduceren.

## Werkverdeling Opus vs Sonnet
- **Opus (ik, dit gesprek)**: brand-config, guardrail-logica, personalize-architectuur,
  script-orchestratie + review-loop, tests. (= architectuur/security/gezondheidslogica)
- **Sonnet (subagent)**: bulk seed-copy in JSON volgens vast schema (= copy), daarna
  programmatisch door guardrails getoetst.

## Review (afgerond 2026-06-13)
**Status: alle todo's klaar, 43 nieuwe tests groen.**

Gebouwd:
- `src/config/brand.js` — SSOT: `BRAND_NAME` (window-override), gefrozen `STORAGE_PREFIX`
  (`paced.*`-keys niet hernoemd → geen install-breuk), `MODELS.{generate,personalize}`,
  `CONTENT_PROXY_URL`. Isomorf (Node + browser).
- `src/lib/content/guardrails.js` — 5 regels, NL+EN regex, gericht op de *schadelijke vorm*
  (getal+eenheid, vergelijking, diagnose-werkwoord) zodat ondersteunende copy niet false-positivet.
- `src/lib/content/spec.js` — taxonomie + JSON-schema + validators; React-vrij.
- `src/lib/content/templates.js` — offline registry + slot-interpolatie ({name}-strip,
  {brand} altijd uit config, deterministische dag-pick).
- `src/lib/content/personalize.js` — default = gratis interpolatie; vrije tekst → Haiku via
  injecteerbare client, guardrail + fallback. Refereert nooit `MODELS.generate`.
- `scripts/lib/anthropic.mjs`, `scripts/generate-tov.mjs`, `scripts/generate-templates.mjs`
  (2-gate review-loop, max 2 herstelrondes), `scripts/regen.mjs`.
- `supabase/functions/personalize/index.ts` — Deno Haiku-proxy (key server-side).
- Seed: `content/tone-of-voice.md` + 7× `content/templates/*.json` (18 entries elk,
  9 nl + 9 en), schema- én guardrail-clean.
- Tests: 43 nieuwe (schema-snapshots, runtime-roept-nooit-Opus, 5 verboden-frame-fallbacks).

Afwijkingen van plan:
- Taal `.mjs/.js` i.p.v. `.ts` (user-bevestigd; Node 20 + repo-conventie).
- Seed-content handmatig + Sonnet-subagent i.p.v. live API-generatie (geen key/kosten);
  scripts zijn wél runnable en getest op graceful-fail zonder key.

Edge cases afgedekt:
- Lege {name} → nette zin + herkapitalisatie. Lege userText → géén AI-call.
- Proxy-error/onveilige output → neutrale template-fallback.
- `BRAND_NAME` niet via caller-data te injecteren (alleen config).

Bekende, buiten-scope observatie:
- `npx vitest run` pakt ook tests in `.claude/worktrees/...` van een andere sessie mee
  (85 failures, allemaal dáár, niet van ons). Pre-existing globbing; niet aangeraakt.

## Livegang-wiring (afgerond 2026-06-15)
Keuzes met user bevestigd:
- **Journal-AI (Haiku-pad): NIET gewired.** Vrije-tekst dagboeknotities zouden het
  apparaat verlaten → botst met Paced's "alles lokaal"-belofte. Code blijft gebouwd
  maar uit (`CONTENT_PROXY_URL` leeg ⇒ fallback naar template). Toekomst: opt-in/consent
  zoals `paced.partner.consent.v1`. **Gevolg: proxy-deploy + CSP-aanpassing niet nodig
  voor launch.**
- **Dagelijks inzicht: bron vervangen** door de template-pipeline.

Wijzigingen:
- `src/app.jsx`: import `personalize`; `insightText` (Dashboard) komt nu uit
  `personalize('cycle-phase', {locale, phase, state:{name}, seed:isoDate})`, met
  fallback naar de legacy `getTips`-pool als de pipeline ooit niets teruggeeft.
- `src/lib/content/templates.js`: JSON-imports met `with { type: 'json' }`
  (ECMAScript-standaard, vereist door Node ESM; esbuild + vitest inlinen het).

Verificatie:
- `node build.mjs` ✓ (CSP gehardend, JSON gebundeld).
- Node-ESM directe executie: alle 8 fase×locale-combinaties geven geldige tekst (met/zonder naam).
- 43 content-tests groen na de import-attribuut-wijziging.
- Browser-rooktest (dist op :4173): app boot zonder console-errors, onboarding rendert.

Status livegang (gewired scope): **klaar.** Optioneel vóór/na launch:
- Seed-content vervangen door echte Opus-generatie (`npm run content:tov && content:templates`)
  zodra ANTHROPIC_API_KEY beschikbaar — huidige seed is handgeschreven maar guardrail-clean.
- vitest worktree-globbing fix (chip staat klaar) zodat `npm test` schoon is.
