/**
 * Aura — CSV export ("voor arts")
 * --------------------------------
 * Pure transform: dagelijkse logs → CSV-string die een gebruiker veilig
 * met een arts kan delen. Géén DOM, géén netwerk — de browser-laag
 * (button → Blob → download) leeft in app.jsx zodat dit bestand kan
 * draaien in tests en op de server zonder polyfills.
 *
 * Volgorde gekozen om "leesbaarheid eerst": identificerende velden,
 * dan fysiek (cyclus + vitals), dan voeding, dan welzijn, dan symptomen
 * en tot slot de vrije notitie.
 */

const COLUMNS = [
  'datum',
  'cyclusdag',
  'fase',
  'temperatuur',
  'bloedverlies_hoeveelheid',
  'bloedverlies_kleur',
  'bloedverlies_klonters',
  'bloedverlies_helderheid',
  'ovulatie',
  'calorieen',
  'eiwit_g',
  'water_glazen',
  'slaap_uur',
  'beweging_min',
  'sport_intensiteit',
  'energie',
  'stemming',
  'mood_1_5',
  'energy_1_5',
  'krampen_1_5',
  'opgeblazen_1_5',
  'symptomen',
  'notitie',
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
    const cyclusdag = entry?.cycleDay ?? '';
    const fase   = entry?.phase || '';
    const ovul   = (log.ovulation?.felt || log.ovulation?.fromTemp) ? 'ja' : '';
    const tempStr = log.temperature > 0 ? log.temperature.toFixed(1) : '';
    const symStr  = Array.isArray(log.symptomen) ? log.symptomen.join('; ') : '';
    const sym = log.symptoms || {};
    const note = typeof log.note === 'string'
      ? log.note.replace(/[\r\n]+/g, ' ').slice(0, 280)
      : '';

    rows.push([
      csvCell(datum),
      csvCell(cyclusdag),
      csvCell(fase),
      csvCell(tempStr),
      csvCell(log.bleeding?.heaviness || ''),
      csvCell(log.bleeding?.color     || ''),
      csvCell(log.bleeding?.clots     || ''),
      csvCell(log.bleeding?.clarity   || ''),
      csvCell(ovul),
      csvCell(log.calories  || ''),
      csvCell(log.protein   || ''),
      csvCell(log.hydration || ''),
      csvCell(log.sleep     || ''),
      csvCell(log.movement  || ''),
      csvCell(log.sportIntensity || ''),
      csvCell(log.energie  ?? ''),
      csvCell(log.stemming ?? ''),
      csvCell(sym.mood     || ''),
      csvCell(sym.energy   || ''),
      csvCell(sym.cramps   || ''),
      csvCell(sym.bloating || ''),
      csvCell(symStr),
      csvCell(note),
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
/*  Full JSON export — AVG art. 20 data-portabiliteit                  */
/* ------------------------------------------------------------------ */

/**
 * Pakt het volledige Aura-data-pakketje (profiel + alle gelogde dagen)
 * in één machine-leesbaar JSON-blob. Voor AVG art. 20 ("recht op
 * data-portabiliteit") is een gestructureerd, gangbaar en machine-
 * leesbaar formaat vereist — JSON met expliciete schema-versie voldoet.
 *
 * @param {object} profile     loadProfile() resultaat
 * @param {Array<{iso: string, log: object}>} logEntries  alle dagen
 * @param {{ today?: Date, schemaVersion?: number }} [opts]
 * @returns {string}  Pretty-printed JSON
 */
export function generateFullJsonExport(profile, logEntries, opts = {}) {
  const today = opts.today instanceof Date ? opts.today : new Date();
  const schemaVersion = opts.schemaVersion ?? 1;

  // Verzamel logs onder hun ISO-key zodat het bestand zelf-documenterend
  // is — een externe importer ziet meteen welke dag bij welke entry hoort.
  const logs = {};
  if (Array.isArray(logEntries)) {
    for (const entry of logEntries) {
      if (entry?.iso && entry?.log) {
        logs[entry.iso] = entry.log;
      }
    }
  }

  const payload = {
    aura: {
      schemaVersion,
      exportedAt: today.toISOString(),
      format: 'aura-full-export-v1',
      // Helder waar dit bestand voor is, voor een onbekende lezer of
      // toekomstige importeur — onderdeel van AVG art. 20 "begrijpelijk".
      readme: [
        'Dit is een volledige export van je Aura-data (AVG art. 20).',
        'Profile bevat je persoonlijke instellingen; logs bevat één entry per kalenderdag (yyyy-mm-dd).',
        'Alle data verliet je apparaat alleen op jouw initiatief.',
      ].join('\n'),
    },
    profile: profile ?? null,
    logs,
  };

  return JSON.stringify(payload, null, 2);
}

/** Suggest a filename like `aura-full-export-2026-05-12.json`. */
export function fullJsonExportFilename(today = new Date()) {
  const d = today instanceof Date ? today : new Date(today);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `aura-full-export-${y}-${m}-${dd}.json`;
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
// Voeg N dagen toe aan een ISO-datum-string (yyyy-mm-dd) zonder
// Date+timezone-round-trip. Eerdere implementatie deed
// `new Date(`${dateStr}T00:00:00`)` + `.toISOString()` — wat in
// elke positive-UTC zone (b.v. CET/CEST) de creationDate naar de
// VORIGE kalenderdag schoof en `nextStr === dateStr` veroorzaakte.
// String-math omzeilt het hele DST/UTC-zonefoutpad.
function addDaysToISODate(isoDateStr, n) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Format `HH:MM` van een geheel-getal-aantal minuten, geclampt op een
// geldige tijd binnen één dag (0..1439). Voorkomt b.v. `24:30` of `0.5:00`.
function minutesToHHMM(totalMinutes) {
  const clamped = Math.max(0, Math.min(1439, Math.round(Number(totalMinutes) || 0)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

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
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    // creationDate moet de actuele dag aanduiden — gebruik dezelfde
    // string-datum + middag-UTC. Apple Health gebruikt 'm enkel als
    // hint; we vermijden zone-drift door geen new Date() round-trip.
    const creationISO = `${dateStr}T12:00:00Z`;
    const nextDateStr = addDaysToISODate(dateStr, 1);

    if (log.calories > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryEnergyConsumed" sourceName="Aura" unit="kcal" creationDate="${xmlAttr(creationISO)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.calories)}"/>`);
    }
    if (log.protein > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryProtein" sourceName="Aura" unit="g" creationDate="${xmlAttr(creationISO)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.protein)}"/>`);
    }
    if (log.hydration > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryWater" sourceName="Aura" unit="mL" creationDate="${xmlAttr(creationISO)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.hydration * 250)}"/>`);
    }
    if (log.sleep > 0) {
      // Slaap-venster: start om 22:00 van `dateStr`, eindig na
      // log.sleep uur op de volgende kalenderdag. Eerdere code zette
      // de eind-tijd op `String(log.sleep)` (de waarde, niet een
      // tijdstip), waardoor 7u slaap een eind-tijd 07:00 kreeg =
      // toevallig juist, maar 8u kreeg eind 08:00 = 10u slaap
      // gemeten. Nu rekenen we de echte eind-tijd uit.
      const sleepMinutes = Math.max(60, Math.min(16 * 60, Math.round(Number(log.sleep) * 60)));
      const startMinutes = 22 * 60;
      const totalEnd = startMinutes + sleepMinutes;          // 22:00 + N min
      const endDay   = totalEnd >= 24 * 60 ? nextDateStr : dateStr;
      const endHHMM  = minutesToHHMM(totalEnd % (24 * 60));
      records.push(`    <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Aura" unit="count" creationDate="${xmlAttr(creationISO)}" startDate="${dateStr}T22:00:00" endDate="${endDay}T${endHHMM}:00" value="HKCategoryValueSleepAnalysisAsleep"/>`);
    }
    if (log.movement > 0) {
      // ActiveEnergyBurned: start 08:00, eind = start + N min.
      // Eerdere code zette eindtijd op `${movHH}:${movMM}` (de duur
      // zelf), dus voor 30 min beweging stond eind = 00:30 — vóór
      // de start, een ongeldig record dat Apple Health stilletjes
      // dropt. Nu een echte einde-na-start.
      const movMinutes = Math.max(1, Math.min(12 * 60, Math.round(Number(log.movement) || 0)));
      const startMinutes = 8 * 60;
      const totalEnd = startMinutes + movMinutes;            // 08:00 + N min
      const endDay   = totalEnd >= 24 * 60 ? nextDateStr : dateStr;
      const endHHMM  = minutesToHHMM(totalEnd % (24 * 60));
      const est = Math.round(movMinutes * 5);
      records.push(`    <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Aura" unit="kcal" creationDate="${xmlAttr(creationISO)}" startDate="${dateStr}T08:00:00" endDate="${endDay}T${endHHMM}:00" value="${xmlAttr(est)}"/>`);
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
