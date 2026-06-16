/**
 * Tests for the runtime personalization path. The load-bearing invariant:
 * the runtime NEVER calls the generation model (Opus/Fable) — only Haiku, and
 * only when there is free text.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

import { BRAND_NAME, MODELS } from '../src/config/brand.js';
import { personalize, personalizeFreeText } from '../src/lib/content/personalize.js';
import { interpolate, selectTemplate } from '../src/lib/content/templates.js';

describe('default path — pure template interpolation, no AI', () => {
  it('personalize() returns a rendered template without any client call', () => {
    const res = personalize('daily-checkin', { locale: 'nl', state: { name: 'Sara' }, seed: 'x' });
    expect(res).not.toBeNull();
    expect(typeof res.text).toBe('string');
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('strips an empty {name} cleanly and re-capitalises', () => {
    expect(interpolate('{name}, rust nu even.', { name: '' }, 'nl')).toBe('Rust nu even.');
    expect(interpolate('{name}, rust nu even.', { name: 'Sara' }, 'nl')).toBe('Sara, rust nu even.');
  });

  it('fills {brand} from config and ignores caller-supplied brand', () => {
    expect(interpolate('Welkom bij {brand}.', { brand: 'ignored' }, 'nl')).toBe(`Welkom bij ${BRAND_NAME}.`);
  });

  it('selectTemplate is deterministic for the same seed', () => {
    const a = selectTemplate('mindfulness', { locale: 'en', seed: '2026-06-13' });
    const b = selectTemplate('mindfulness', { locale: 'en', seed: '2026-06-13' });
    expect(a.id).toBe(b.id);
  });
});

describe('free-text path — Haiku only', () => {
  it('uses MODELS.personalize and never MODELS.generate', async () => {
    const client = vi.fn(async () => ({ text: 'Wat fijn dat je dit deelt.' }));
    await personalizeFreeText({
      category: 'daily-checkin',
      locale: 'nl',
      userText: 'ik schreef vandaag iets in mijn dagboek',
      client,
    });
    expect(client).toHaveBeenCalledOnce();
    const req = client.mock.calls[0][0];
    expect(req.model).toBe(MODELS.personalize);
    expect(req.model).not.toBe(MODELS.generate);
    expect(req.model).toContain('haiku');
  });

  it('caps the forwarded user text and output tokens', async () => {
    const client = vi.fn(async () => ({ text: 'ok' }));
    await personalizeFreeText({
      category: 'daily-checkin',
      userText: 'x'.repeat(5000),
      client,
    });
    const req = client.mock.calls[0][0];
    expect(req.userText.length).toBeLessThanOrEqual(600);
    expect(req.maxTokens).toBeLessThanOrEqual(160);
  });

  it('does NOT call the client when there is no free text', async () => {
    const client = vi.fn(async () => ({ text: 'nope' }));
    const res = await personalizeFreeText({ category: 'daily-checkin', userText: '   ', client });
    expect(client).not.toHaveBeenCalled();
    expect(res.source).toBe('template');
  });

  it('falls back to a template when the client errors', async () => {
    const client = vi.fn(async () => {
      throw new Error('proxy down');
    });
    const res = await personalizeFreeText({ category: 'daily-checkin', userText: 'iets', client });
    expect(res.source).toBe('template');
  });

  it('returns the AI reply when it is safe', async () => {
    const client = vi.fn(async () => ({ text: 'Wat fijn dat je even stilstaat bij hoe je je voelt.' }));
    const res = await personalizeFreeText({ category: 'daily-checkin', userText: 'iets', client });
    expect(res.source).toBe('ai');
    expect(res.text).toContain('fijn');
  });
});

describe('source-level invariant', () => {
  it('personalize.js never references the generation model', () => {
    const src = readFileSync(new URL('../src/lib/content/personalize.js', import.meta.url), 'utf8');
    expect(src).not.toContain('claude-opus');
    expect(src).not.toContain('MODELS.generate');
    expect(src).not.toContain('.generate');
  });
});
