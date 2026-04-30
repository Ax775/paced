#!/usr/bin/env node
/**
 * Generate manifest screenshots for the PWA install UX. Captures the
 * dashboard state (after auto-unlock) at narrow + wide viewports and
 * writes them to public/assets/screenshots/.
 *
 * Run against the running dev server:
 *   npm run dev          # in another terminal
 *   node scripts/generate-screenshots.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'public/assets/screenshots');
mkdirSync(outDir, { recursive: true });

const URL = process.env.AURA_URL || 'http://localhost:5175';
const PASS = 'demo1234abcd';

const targets = [
  { name: 'mobile-1', width: 1080, height: 1920, formFactor: 'narrow', label: 'Vandaag op je telefoon' },
  { name: 'wide-1',   width: 1920, height: 1080, formFactor: 'wide',   label: 'Aura op tablet of desktop' },
];

const profile = {
  name: 'Demo',
  cycleLength: 28,
  mensDuration: 5,
  lastPeriodStart: '2026-04-15',
  age: 30,
  weightKg: 65,
  heightCm: 170,
  activityLevel: 'moderate',
  onboardingDone: true,
  legalAcceptedAt: new Date().toISOString(),
  legalVersion: '1.0',
};

const log = {
  calories: 1800, protein: 92, hydration: 6, sleep: 7.5, movement: 30,
  note: 'Goede dag — fris en helder.',
  gut: { probiotics: true, fiber: true, fermented: false },
  symptoms: { energy: 5, mood: 4, cramps: 5, bloating: 5 },
};

async function shoot(target) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(URL, { waitUntil: 'networkidle' });

  // Set up state via the in-page modules (no clicking through onboarding).
  await page.evaluate(async ({ pass, profile, log }) => {
    localStorage.clear();
    const secure = await import('/src/lib/secureStorage.js');
    await secure.setupNew(pass);
    const storage = await import('/src/lib/storage.js');
    storage.saveProfile(profile);
    storage.saveLog(new Date(), log);
  }, { pass: PASS, profile, log });

  await page.reload({ waitUntil: 'networkidle' });

  // Unlock via the lock screen so the screenshot captures the real app.
  await page.fill('#aura-pw-unlock', PASS);
  await page.getByRole('button', { name: /Ontgrendelen/ }).click();
  await page.waitForSelector('text=Hoi Demo', { timeout: 5_000 });

  await page.waitForTimeout(500);
  const file = resolve(outDir, `${target.name}.png`);
  await page.screenshot({ path: file, fullPage: false, type: 'png' });
  process.stdout.write(`  wrote ${file}\n`);

  await browser.close();
}

for (const t of targets) {
  await shoot(t);
}

process.stdout.write('done\n');
