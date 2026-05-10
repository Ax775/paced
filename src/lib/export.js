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
