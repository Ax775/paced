/**
 * Aura — CSV export ("voor arts")
 * --------------------------------
 * Pure transform: dagelijkse logs → CSV-string die een gebruiker veilig
 * met een arts kan delen. Géén DOM, géén netwerk — de browser-laag
 * (button → Blob → download) leeft in app.jsx zodat dit bestand kan
 * draaien in tests en op de server zonder polyfills.
 *
 * Kolommen, in deze volgorde:
 *   datum, fase, temperatuur, bloedverlies_hoeveelheid,
 *   bloedverlies_kleur, ovulatie, sport_intensiteit,
 *   energie, stemming, symptomen
 */

const COLUMNS = [
  'datum',
  'fase',
  'temperatuur',
  'bloedverlies_hoeveelheid',
  'bloedverlies_kleur',
  'ovulatie',
  'sport_intensiteit',
  'energie',
  'stemming',
  'symptomen',
];

/**
 * Serialiseer één cel veilig naar CSV.
 *
 * Doet twee dingen:
 *  1. CSV-injection mitigatie — een cel die met `=`, `+`, `-` of `@`
 *     begint wordt door Excel, Google Sheets en Numbers als formule
 *     uitgevoerd. Een TAB-prefix maakt er een normale tekstcel van in
 *     alle bekende viewers, zonder de leesbaarheid op papier te raken.
 *  2. Quote als de waarde komma, quote, puntkomma of newline bevat.
 */
function csvCell(value) {
  if (value == null) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = '\t' + s;
  if (/[",;\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Bouw een CSV-string van een reeks dagelijkse logs.
 *
 * @param {Array<{date?: string|Date, iso?: string, log: object, phase?: string}>} entries
 *   Elk item moet minstens een `log` hebben; `date`/`iso` en `phase` zijn
 *   optioneel maar aanbevolen — anders blijven die cellen leeg.
 * @returns {string}  CSV met header-rij en één rij per log.
 */
export function generateCsvExport(entries) {
  const rows = [COLUMNS.join(',')];
  if (!Array.isArray(entries)) return rows.join('\n');

  for (const entry of entries) {
    const log = entry?.log || {};
    const datum = entry?.iso
      || (entry?.date instanceof Date
            ? entry.date.toISOString().slice(0, 10)
            : (entry?.date || ''));
    const fase   = entry?.phase || '';
    const ovul   = (log.ovulation?.felt || log.ovulation?.fromTemp) ? 'ja' : '';
    const tempStr = log.temperature > 0 ? log.temperature.toFixed(1) : '';
    const symStr  = Array.isArray(log.symptomen) ? log.symptomen.join('; ') : '';

    rows.push([
      csvCell(datum),
      csvCell(fase),
      csvCell(tempStr),
      csvCell(log.bleeding?.heaviness || ''),
      csvCell(log.bleeding?.color     || ''),
      csvCell(ovul),
      csvCell(log.sportIntensity      || ''),
      csvCell(log.energie  ?? ''),
      csvCell(log.stemming ?? ''),
      csvCell(symStr),
    ].join(','));
  }

  return rows.join('\n');
}

/** Suggest a filename like `aura-export-2026-05-03.csv`. */
export function csvExportFilename(today = new Date()) {
  const d = today instanceof Date ? today : new Date(today);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `aura-export-${y}-${m}-${dd}.csv`;
}

/* ------------------------------------------------------------------ */
/*  Apple Health XML export                                            */
/* ------------------------------------------------------------------ */

/**
 * Escape a value for safe use inside an XML attribute. Covers both
 * single- and double-quoted contexts zodat de helper correct blijft
 * als een caller ooit van quote-style switcht.
 */
function xmlAttr(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build the Apple Health XML payload from raw daily-log entries.
 *
 * Bewust pure — geen Blob, geen DOM, geen download. De app.jsx-laag
 * regelt het downloaden; deze module produceert valid XML zodat een
 * import in Apple Health niet stilletjes mislukt op een typo.
 *
 * @param {Array<{date: Date|string, iso?: string, log: object}>} entries
 * @param {{ today?: Date }} [opts]
 * @returns {string|null} XML-string of `null` als er niks logbaar is
 */
export function generateAppleHealthXml(entries, opts = {}) {
  if (!Array.isArray(entries)) return null;
  const today = opts.today instanceof Date ? opts.today : new Date();
  const records = [];

  for (const entry of entries) {
    const log = entry?.log || {};
    const dateStr = entry?.iso
      || (entry?.date instanceof Date
            ? entry.date.toISOString().slice(0, 10)
            : (typeof entry?.date === 'string' ? entry.date : ''));
    if (!dateStr) continue;

    const d = new Date(`${dateStr}T00:00:00`);
    const iso = d.toISOString();
    const nextD = new Date(d);
    nextD.setDate(d.getDate() + 1);
    const nextStr = nextD.toISOString().slice(0, 10);

    if (log.calories > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryEnergyConsumed" sourceName="Aura" unit="kcal" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.calories)}"/>`);
    }
    if (log.protein > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryProtein" sourceName="Aura" unit="g" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.protein)}"/>`);
    }
    if (log.hydration > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryWater" sourceName="Aura" unit="mL" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.hydration * 250)}"/>`);
    }
    if (log.sleep > 0) {
      const sleepHH = String(log.sleep).padStart(2, '0');
      records.push(`    <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Aura" unit="count" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T22:00:00" endDate="${nextStr}T${sleepHH}:00:00" value="HKCategoryValueSleepAnalysisAsleep"/>`);
    }
    if (log.movement > 0) {
      const est = Math.round(log.movement * 5);
      const movMM = String(log.movement % 60).padStart(2, '0');
      const movHH = String(Math.floor(log.movement / 60)).padStart(2, '0');
      records.push(`    <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Aura" unit="kcal" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T08:00:00" endDate="${dateStr}T${movHH}:${movMM}:00" value="${xmlAttr(est)}"/>`);
    }
  }

  if (records.length === 0) return null;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
  <!ATTLIST Record type CDATA #IMPLIED>
]>
<HealthData locale="nl_NL">
  <ExportDate value="${today.toISOString()}"/>
  <Me HKCharacteristicTypeIdentifierDateOfBirth="" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexFemale"/>
${records.join('\n')}
</HealthData>`;
}

/** Suggest a filename like `aura-health-export-2026-05-03.xml`. */
export function appleHealthFilename(today = new Date()) {
  const d = today instanceof Date ? today : new Date(today);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `aura-health-export-${y}-${m}-${dd}.xml`;
}
