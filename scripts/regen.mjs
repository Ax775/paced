/**
 * regen.mjs — Targeted content regeneration dispatcher.
 * -----------------------------------------------------
 *   npm run content:regen -- --category=sleep            # one category
 *   npm run content:regen -- --category=tone-of-voice    # the voice guide
 *   npm run content:regen                                # all templates
 *
 * Thin wrapper over generate-tov.mjs / generate-templates.mjs so there is one
 * memorable command for content updates.
 */

import { generateToneOfVoice } from './generate-tov.mjs';
import { generateTemplates } from './generate-templates.mjs';

const arg = process.argv.find((a) => a.startsWith('--category='));
const category = arg ? arg.split('=')[1] : undefined;

async function main() {
  if (category === 'tone-of-voice' || category === 'tov') {
    await generateToneOfVoice();
    return;
  }
  await generateTemplates({ category });
}

main().catch((err) => {
  console.error('✗ regen failed:', err.message);
  process.exit(1);
});
