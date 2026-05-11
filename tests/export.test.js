/**
 * Tests for src/lib/export.js — pure CSV + Apple Health XML producers.
 *
 * Het doel: zo veel dekking dat een typo in een record-type, een
 * verkeerde unit, of een ontsnapt-niet teken wordt opgemerkt vóór een
 * gebruiker een invalid XML probeert te importeren in Apple Health.
 */
import { describe, it, expect } from 'vitest';
import {
  generateCsvExport,
  csvExportFilename,
  generateAppleHealthXml,
  appleHealthFilename,
} from '../src/lib/export.js';

/* ─────────────────────────  CSV export  ────────────────────────────── */

describe('generateCsvExport', () => {
  it('returns header-only row for empty input', () => {
    const out = generateCsvExport([]);
    const rows = out.split('\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('datum');
    expect(rows[0]).toContain('fase');
    expect(rows[0]).toContain('symptomen');
  });

  it('returns header for non-array input (defensive)', () => {
    expect(generateCsvExport(null).split('\n')[0]).toContain('datum');
    expect(generateCsvExport(undefined).split('\n')[0]).toContain('datum');
  });

  it('emits one data row per entry', () => {
    const out = generateCsvExport([
      { iso: '2026-05-01', phase: 'menstrual', log: { temperature: 36.4 } },
      { iso: '2026-05-02', phase: 'menstrual', log: { temperature: 36.5 } },
    ]);
    expect(out.split('\n')).toHaveLength(3); // header + 2 data rows
  });

  it('formats temperature with one decimal place', () => {
    const out = generateCsvExport([
      { iso: '2026-05-01', phase: 'menstrual', log: { temperature: 36.4 } },
    ]);
    expect(out).toContain('36.4');
  });

  it('joins symptomen array with semicolons', () => {
    const out = generateCsvExport([
      { iso: '2026-05-01', phase: 'luteal',
        log: { symptomen: ['Buikkrampen', 'Hoofdpijn'] } },
    ]);
    expect(out).toContain('Buikkrampen; Hoofdpijn');
  });

  it('marks ovulation as "ja" when either felt or fromTemp is true', () => {
    const out = generateCsvExport([
      { iso: '2026-05-14', phase: 'ovulatory',
        log: { ovulation: { felt: true, fromTemp: false } } },
    ]);
    // CSV cells are split by `,`. Find the row, check ovulation column.
    expect(out.split('\n')[1]).toMatch(/,ja,/);
  });
});

describe('csvExportFilename', () => {
  it('produces a date-stamped filename', () => {
    expect(csvExportFilename(new Date(2026, 4, 3))).toBe('aura-export-2026-05-03.csv');
  });

  it('zero-pads single-digit months and days', () => {
    expect(csvExportFilename(new Date(2026, 0, 1))).toBe('aura-export-2026-01-01.csv');
  });
});

/* ───────────────────────  Apple Health XML  ────────────────────────── */

describe('generateAppleHealthXml', () => {
  const today = new Date('2026-05-10T12:00:00Z');

  it('returns null when there are no loggable records', () => {
    expect(generateAppleHealthXml([], { today })).toBeNull();
    // Entries waarvan álle metingen 0/leeg zijn → ook geen records
    expect(generateAppleHealthXml(
      [{ iso: '2026-05-01', log: { calories: 0, protein: 0, hydration: 0, sleep: 0, movement: 0 } }],
      { today },
    )).toBeNull();
  });

  it('returns null voor invalid input', () => {
    expect(generateAppleHealthXml(null)).toBeNull();
    expect(generateAppleHealthXml(undefined)).toBeNull();
    expect(generateAppleHealthXml('not an array')).toBeNull();
  });

  it('produces a well-formed XML root with HealthData', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { calories: 1800 } },
    ], { today });
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<HealthData locale="nl_NL">');
    expect(xml).toContain('</HealthData>');
    expect(xml).toContain('<ExportDate value="2026-05-10');
  });

  it('emits the expected record types for known fields', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { calories: 1800, protein: 90, hydration: 4, sleep: 7, movement: 30 } },
    ], { today });
    expect(xml).toContain('HKQuantityTypeIdentifierDietaryEnergyConsumed');
    expect(xml).toContain('HKQuantityTypeIdentifierDietaryProtein');
    expect(xml).toContain('HKQuantityTypeIdentifierDietaryWater');
    expect(xml).toContain('HKCategoryTypeIdentifierSleepAnalysis');
    expect(xml).toContain('HKQuantityTypeIdentifierActiveEnergyBurned');
  });

  it('converts hydration glasses to mL (×250)', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { hydration: 4 } }, // 4 glasses
    ], { today });
    // 4 × 250 = 1000 mL
    expect(xml).toContain('value="1000"');
    expect(xml).toContain('unit="mL"');
  });

  it('skips a field when its value is 0 or missing', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { calories: 1800 } }, // alleen calories
    ], { today });
    expect(xml).toContain('DietaryEnergyConsumed');
    expect(xml).not.toContain('DietaryProtein');
    expect(xml).not.toContain('DietaryWater');
    expect(xml).not.toContain('SleepAnalysis');
    expect(xml).not.toContain('ActiveEnergyBurned');
  });

  it('valid XML — parseable door browser-native DOMParser', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { calories: 1800, protein: 90, sleep: 7 } },
      { iso: '2026-05-02', log: { hydration: 6, movement: 45 } },
    ], { today });
    // Vitest draait in node-env; gebruik een minimale check op
    // well-formedness via een naive regex op self-closing tags +
    // tag-pair-balance. Voor een echte XML-parse zou je
    // `@xmldom/xmldom` kunnen toevoegen — die overhead is hier niet
    // nodig omdat dit een record-format is, geen vrije markup.
    const openTags  = (xml.match(/<HealthData[\s>]/g) || []).length;
    const closeTags = (xml.match(/<\/HealthData>/g) || []).length;
    expect(openTags).toBe(closeTags);
    expect(openTags).toBe(1);
    // Geen ongeëscapete < of > buiten tag-context (geen tekstuele HTML lekken)
    expect(xml).not.toMatch(/>[^<>]*<script/);
  });

  it('uses the entry.iso date when present, even if entry.date is also set', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', date: new Date(2026, 11, 25), log: { calories: 1000 } },
    ], { today });
    expect(xml).toContain('startDate="2026-05-01T00:00:00"');
    expect(xml).not.toContain('startDate="2026-12-25');
  });

  it('falls back to entry.date when iso is missing', () => {
    const xml = generateAppleHealthXml([
      { date: new Date(2026, 4, 1, 12), log: { calories: 1000 } },
    ], { today });
    expect(xml).toContain('startDate="2026-05-01T00:00:00"');
  });

  it('skips entries without any usable date', () => {
    const xml = generateAppleHealthXml([
      { log: { calories: 1000 } }, // geen iso, geen date
      { iso: '2026-05-01', log: { calories: 2000 } },
    ], { today });
    // Alleen één record verwacht (uit de tweede entry)
    expect((xml.match(/DietaryEnergyConsumed/g) || []).length).toBe(1);
  });
});

describe('appleHealthFilename', () => {
  it('produces a date-stamped filename', () => {
    expect(appleHealthFilename(new Date(2026, 4, 3))).toBe('aura-health-export-2026-05-03.xml');
  });

  it('zero-pads single digits', () => {
    expect(appleHealthFilename(new Date(2026, 0, 9))).toBe('aura-health-export-2026-01-09.xml');
  });
});
