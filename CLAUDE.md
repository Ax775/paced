## Model-strategie

| Fase | Model | Wanneer |
|------|-------|---------|
<!-- fallback: fable-5 niet beschikbaar op dit account, dd 2026-06-10 -->
| Plan | `claude-opus-4-8` | Vóór elke taak: scope, bestanden, risico's, niet-doelen, subagent-verdeling → `tasks/todo.md` |
| Uitvoer | `claude-sonnet-4-6` | Alle standaard subagent-taken |
| Review | `claude-opus-4-8` | Na elk todo-blok: afwijking van plan? Edge cases? → `tasks/lessons.md` |

**Escalatie:** Sonnet-subagent 2× vast op zelfde fout → escaleer naar Fable met faallog. Noteer wissel in `tasks/todo.md`.

**Fable verplicht voor:** architectuurkeuzes `[complex]`, security-review, datamodelontwerp, allergenen-/gezondheidslogica, prompt-engineering voor externe API-calls.

**Nooit Fable voor:** boilerplate, styling, copy, dependency bumps, testfixtures.
