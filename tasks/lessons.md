# Lessons

## Content Pipeline (2026-06-13)

- **Spec zegt `.ts`, repo is JS.** Niet blind de spec volgen: de repo is pure JS/ESM,
  Node 20 kan `.ts`-scripts niet zonder loader draaien, en de edge functions zijn al
  Deno-TS. Keuze met user bevestigd (match repo) → minder toolchain-risico. Les: bij
  taal/tooling-mismatch tussen opdracht en codebase eerst de codebase laten winnen en
  de keuze expliciet voorleggen.

- **Guardrails op de *vorm*, niet het *onderwerp*.** Eerste instinct was woorden als
  "calorie"/"gewicht" blokkeren — dat sloopt juist de ondersteunende copy
  ("je verbrandt nu meer calorieën — extra eten is oké"). Oplossing: match getal+eenheid,
  vergelijking, diagnose-werkwoord. Bewust false-negatives boven false-positives.

- **Runtime-invariant ook op source-niveau testen.** "Runtime roept nooit Opus aan" is
  niet alleen gedrag (assert `req.model === haiku`) maar ook een grep-test op
  `personalize.js` (geen `claude-opus` / `MODELS.generate`). Dubbel slot tegen regressie.

- **Seed-content = offline-fallback = testfixture.** Door de gegenereerde content te
  committen werkt de PWA offline én draaien tests zonder API-key/kosten. De gen-scripts
  overschrijven later. Eén artefact, drie doelen.

- **Subagent (Sonnet) voor bulk-copy, ik (Opus) voor logica.** Conform model-strategie:
  112 template-strings = copy → Sonnet; guardrail-/schema-/personalize-logica = Opus.
  Subagent-output daarna programmatisch door schema+guardrails getoetst (1 fout gevangen:
  niet-ASCII id `oké`).

- **`STORAGE_PREFIX` bevriezen.** `BRAND_NAME` is display-only; `paced.*` localStorage-keys
  zitten in bestaande user-data → hernoemen = data-verlies. Gescheiden gehouden in config.

- **`npx vitest run` globt `.claude/worktrees/`.** Andere sessies' worktrees worden
  meegepakt en kunnen rood zijn zonder dat het jouw code is. Filter op pad bij triage.