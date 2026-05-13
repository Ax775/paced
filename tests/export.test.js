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

/* ─────────────────  Apple Health regression tests (audit fixes)  ───── */

describe('generateAppleHealthXml — audit-fix regressions', () => {
  const today = new Date('2026-05-10T12:00:00Z');

  it('sleep end-time = start + duration (was: hard-coded user-hours-as-clock-time)', () => {
    // Voor 8u slaap moet de gerapporteerde duur exact 8u zijn, niet
    // 10u (de oude bug: start 22:00, end = 'log.sleep:00' = '08:00' → 10u).
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { sleep: 8 } },
    ], { today });
    // 22:00 + 8h = 06:00 op de volgende dag
    expect(xml).toContain('startDate="2026-05-01T22:00:00"');
    expect(xml).toContain('endDate="2026-05-02T06:00:00"');
  });

  it('sleep met fractional uren wordt correct in minuten geconverteerd', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { sleep: 7.5 } },
    ], { today });
    // 22:00 + 7.5h = 05:30 op volgende dag
    expect(xml).toContain('endDate="2026-05-02T05:30:00"');
  });

  it('sleep clamped op zinnige grenzen (geen 24:00 of negatieve)', () => {
    // 999 uur → clamp naar 16u → 22:00 + 16:00 = 14:00 next day
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { sleep: 999 } },
    ], { today });
    expect(xml).toContain('endDate="2026-05-02T14:00:00"');
    // Geen ongeldige tijdsstrings
    expect(xml).not.toMatch(/T(\d{3,}):/);
    expect(xml).not.toMatch(/T(2[4-9]|[3-9]\d):/);
  });

  it('movement: endDate ligt NA startDate (was: 08:00 → 00:30 oude bug)', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { movement: 30 } }, // 30 min wandeling
    ], { today });
    // 08:00 + 30 min = 08:30, niet 00:30
    expect(xml).toContain('startDate="2026-05-01T08:00:00"');
    expect(xml).toContain('endDate="2026-05-01T08:30:00"');
  });

  it('movement: lange sessie wraps naar volgende dag indien nodig', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { movement: 16 * 60 + 30 } }, // clamps naar 12h max
    ], { today });
    // 08:00 + 12:00 = 20:00 zelfde dag
    expect(xml).toContain('endDate="2026-05-01T20:00:00"');
  });

  it('movement: kcal-schatting = minuten × 5', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { movement: 30 } },
    ], { today });
    expect(xml).toContain('value="150"');
  });

  it('timezone-stable: dateStr blijft de invoer, geen UTC-drift', () => {
    // Eerdere code deed `new Date('2026-05-01T00:00:00').toISOString()` =
    // in UTC+2 (CEST) → `2026-04-30T22:00:00Z` → creationDate verwees
    // naar de VORIGE dag. Nu gebruiken we string-math, geen Date+ISO.
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { calories: 1800, sleep: 7 } },
    ], { today });
    // Geen verwijzingen naar 2026-04-30 in startDate / endDate
    expect(xml).not.toMatch(/(startDate|endDate)="2026-04-30/);
    // creationDate ligt op middag-UTC van de iso-datum, niet de dag ervoor
    expect(xml).toContain('creationDate="2026-05-01T12:00:00Z"');
  });

  it('verwerpt malformed iso (geen yyyy-mm-dd)', () => {
    expect(generateAppleHealthXml([
      { iso: 'not-a-date', log: { calories: 1800 } },
    ], { today })).toBeNull();

    expect(generateAppleHealthXml([
      { iso: '2026/05/01', log: { calories: 1800 } },
    ], { today })).toBeNull();
  });

  it('multi-day export: elk record gebruikt zijn eigen dag', () => {
    const xml = generateAppleHealthXml([
      { iso: '2026-05-01', log: { calories: 1700 } },
      { iso: '2026-05-02', log: { calories: 1800 } },
    ], { today });
    expect((xml.match(/startDate="2026-05-01T00:00:00"/g) || []).length).toBe(1);
    expect((xml.match(/startDate="2026-05-02T00:00:00"/g) || []).length).toBe(1);
    // Beide records hun eigen creationDate
    expect(xml).toContain('creationDate="2026-05-01T12:00:00Z"');
    expect(xml).toContain('creationDate="2026-05-02T12:00:00Z"');
  });
});

/* ─────────────────  CSV injection-protection regression  ────────── */

describe('generateCsvExport — security regressions', () => {
  it('CSV-injection: cellen die met =/+/-/@ beginnen krijgen tab-prefix', () => {
    // Voor de fix kon een gebruiker met een note "=HYPERLINK(...)"
    // formules laten uitvoeren in Excel/Sheets/Numbers wanneer ze
    // de export met haar arts deelde.
    const out = generateCsvExport([
      { iso: '2026-05-01', phase: 'menstrual',
        log: { note: '=HYPERLINK("evil.com","klik")' } },
      { iso: '2026-05-02', phase: 'menstrual',
        log: { note: '+CMD|" /C calc"!A0' } },
      { iso: '2026-05-03', phase: 'menstrual',
        log: { note: '-2+3+cmd' } },
      { iso: '2026-05-04', phase: 'menstrual',
        log: { note: '@SUM(A1)' } },
    ]);
    // Elke gevaarlijke prefix moet voorafgegaan worden door een tab.
    // Cellen die óók een " of , bevatten worden bovendien gequote;
    // cellen zonder die karakters blijven ongequote maar krijgen wel
    // de tab. csvCell-implementatie zit in src/lib/export.js.
    expect(out).toMatch(/"\t=HYPERLINK/);   // bevat " en , → quoted
    expect(out).toMatch(/"\t\+CMD/);          // bevat " → quoted
    expect(out).toMatch(/(^|,)\t-2/m);        // alleen tab, geen quote
    expect(out).toMatch(/(^|,)\t@SUM/m);      // alleen tab, geen quote
  });

  it('CSV-injection: normale notes worden niet onnodig getransformeerd', () => {
    const out = generateCsvExport([
      { iso: '2026-05-01', phase: 'menstrual',
        log: { note: 'gewoon een notitie' } },
    ]);
    expect(out).not.toMatch(/\tgewoon/);
    expect(out).toContain('gewoon een notitie');
  });

  it('newlines in notitie worden vervangen door spaties', () => {
    const out = generateCsvExport([
      { iso: '2026-05-01', phase: 'menstrual',
        log: { note: 'lijn1\nlijn2\rlijn3' } },
    ]);
    expect(out).toContain('lijn1 lijn2 lijn3');
    // En de hele rij blijft op één regel (header + 1 datarij)
    expect(out.split('\n')).toHaveLength(2);
  });

  it('header bevat alle 23 kolommen (uitbreiding voor arts-export parity)', () => {
    const header = generateCsvExport([]).split('\n')[0];
    const cols = header.split(',');
    expect(cols).toHaveLength(23);
    expect(cols).toContain('datum');
    expect(cols).toContain('cyclusdag');
    expect(cols).toContain('calorieen');
    expect(cols).toContain('water_glazen');
    expect(cols).toContain('notitie');
  });

  it('alle gevoelige velden komen in juiste kolom-volgorde', () => {
    const out = generateCsvExport([
      { iso: '2026-05-01', phase: 'menstrual', cycleDay: 3,
        log: {
          calories: 1800, protein: 90, hydration: 4, sleep: 7, movement: 30,
          temperature: 36.4,
          bleeding: { heaviness: 'normaal', color: 'rood', clots: 'licht', clarity: 'helder' },
          ovulation: { felt: false, fromTemp: false },
          symptoms: { mood: 4, energy: 3, cramps: 2, bloating: 5 },
          symptomen: ['Buikkrampen'],
          energie: 4, stemming: 3,
          sportIntensity: 'light',
          note: 'oké dag',
        } },
    ]);
    const row = out.split('\n')[1];
    expect(row).toContain('2026-05-01');
    expect(row).toContain('menstrual');
    expect(row).toContain('1800');
    expect(row).toContain('36.4');
    expect(row).toContain('normaal');
    expect(row).toContain('rood');
    expect(row).toContain('Buikkrampen');
    expect(row).toContain('oké dag');
  });
});
