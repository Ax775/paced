/**
 * guardrails.js — Hardcoded content safety checklist.
 * ---------------------------------------------------
 * Single rulebook used in TWO places:
 *   1. The offline generation review-step (scripts/generate-templates.mjs)
 *      rejects any template that trips a rule, before it is ever committed.
 *   2. The runtime path (lib/content/personalize.js) checks AI free-text
 *      output and falls back to a neutral template on any violation.
 *
 * Paced handles menstrual-health data. The rules below encode the product's
 * stance: supportive, never restrictive; informational, never diagnostic.
 *
 * Design rule: prefer FALSE NEGATIVES over FALSE POSITIVES on supportive copy.
 * "Je lichaam verbrandt nu meer calorieën" must PASS (no number, supportive
 * framing). "Eet maximaal 1500 calorieën" must FAIL (number + restriction).
 * Patterns therefore key on the *harmful shape* (number+unit, comparison,
 * diagnosis verb), not on bare topic words like "calorie" or "weight".
 */

/**
 * Each rule: { id, description (for the gen review prompt + reports), patterns }.
 * `patterns` are matched case-insensitively against the text; any match = violation.
 */
export const GUARDRAIL_RULES = Object.freeze([
  {
    id: 'no-calorie-numbers',
    description:
      'Geen concrete calorie-getallen / No specific calorie counts (a number next to a calorie unit).',
    patterns: [
      /\b\d[\d.,]*\s?(kcal|calorie|calorieën|calories|cals?)\b/i,
      /\b(eet|inname|maximaal|max|beperk|onder de|niet meer dan|limit|stay under)\b[^.?!]{0,25}\b\d[\d.,]*\s?(kcal|calorie|calorieën|calories)\b/i,
    ],
  },
  {
    id: 'no-weight-goals',
    description:
      'Geen gewichtsdoelen of afval-framing met getallen / No numeric weight-loss goals.',
    patterns: [
      /\b\d[\d.,]*\s?(kg|kilo'?s?|kilogram|pond|pounds?|lbs?)\b[^.?!]{0,25}\b(afval|kwijt|verlies|verloren|lose|drop|shed|minder)\b/i,
      /\b(afval|kwijtraken|verlies|lose|drop|shed)\b[^.?!]{0,25}\b\d[\d.,]*\s?(kg|kilo'?s?|kilogram|pond|pounds?|lbs?)\b/i,
      /\b(streef|doel|target|goal)gewicht\b/i,
      /\b(target|goal)\s+weight\b/i,
    ],
  },
  {
    id: 'no-comparative-body',
    description:
      'Geen vergelijkende of objectiverende lichaamstaal / No comparative or objectifying body language.',
    patterns: [
      /\b(slanker|dunner|dikker|platter|strakker)\s+(dan|worden|maken)\b/i,
      /\b(thinner|slimmer|skinnier|flatter|leaner)\s+(than|stomach|belly|tummy)\b/i,
      /\b(bikini\s?lichaam|bikinibody|beach\s?body|summer\s?body|droombody|dreambody)\b/i,
      /\b(bounce\s?back|terug in vorm|je oude lichaam terug)\b/i,
    ],
  },
  {
    id: 'no-medical-claims',
    description:
      'Geen medische diagnoses, claims of doseringen / No medical diagnoses, claims or dosages.',
    patterns: [
      /\b(je|u)\s+(hebt|lijdt aan|hebt waarschijnlijk|hebt last van een)\b[^.?!]{0,20}\b(aandoening|ziekte|stoornis|infectie|disorder|disease|condition|syndrome)\b/i,
      /\b(dit|dat)\s+(is|duidt op|wijst op|betekent)\b[^.?!]{0,15}\b(diagnose|symptoom van een|teken van een|sign of a|symptom of)\b/i,
      /\b(diagnose|gediagnosticeerd|diagnose stellen|self-diagnos)/i,
      /\b(neem|slik|gebruik|take)\b[^.?!]{0,15}\b\d[\d.,]*\s?(mg|ml|mcg|µg|gram|tabletten?|pills?|doses?)\b/i,
      /\b(geneest|cure[sd]?|behandelt|treats?)\b[^.?!]{0,15}\b(ziekte|aandoening|disease|condition|disorder)\b/i,
    ],
  },
  {
    id: 'no-shame-guilt',
    description:
      'Geen schuld-, schaamte- of dieetcultuur-taal / No shame, guilt or diet-culture framing.',
    patterns: [
      /\b(je eigen schuld|je moet je schamen|schaam je|moet je schamen)\b/i,
      /\b(should be ashamed|your own fault|feel guilty|guilt-free)\b/i,
      /\b(cheat\s?(meal|day)|zondig(en|de)?|guilty pleasure|sinful|verdiend|earned it|compenseer|compensate for|maak het goed)\b/i,
      /\b(verwen jezelf niet|niet verdiend|good\/bad food|goed\/slecht eten|verboden eten|forbidden food)\b/i,
    ],
  },
]);

/** Stable list of rule ids — handy for tests and reporting. */
export const GUARDRAIL_RULE_IDS = GUARDRAIL_RULES.map((r) => r.id);

/**
 * Human-readable forbidden-frame summary, injected into generation/review
 * prompts so the model knows the bar before it writes.
 */
export const FORBIDDEN_FRAMES = GUARDRAIL_RULES.map((r) => r.description);

/**
 * Check a piece of text against every guardrail.
 *
 * @param {string} text
 * @returns {{ ok: boolean, violations: Array<{ rule: string, match: string }> }}
 */
export function checkGuardrails(text) {
  const violations = [];
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: true, violations };
  }
  for (const rule of GUARDRAIL_RULES) {
    for (const pattern of rule.patterns) {
      const m = text.match(pattern);
      if (m) {
        violations.push({ rule: rule.id, match: m[0] });
        break; // one hit per rule is enough
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Convenience boolean: does this text clear every guardrail? */
export function passesGuardrails(text) {
  return checkGuardrails(text).ok;
}
