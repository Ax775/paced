/**
 * Aura — Daily Insights
 * ---------------------
 * Deterministic "tip of the day" generator. We pick from a curated pool
 * per phase using a date-seeded index so:
 *
 *   1. The tip is stable across re-renders on the same day.
 *   2. It rotates naturally as the user moves through her cycle.
 *   3. No network call required — fully offline / PWA-friendly.
 */

import { PHASES, toISODate } from './cycle.js';

export const TIPS = {
  [PHASES.MENSTRUAL]: [
    (name) => `${name ? `${name}, i` : 'I'}n de menstruatiefase heeft je lichaam extra ijzer nodig — probeer vandaag spinazie of linzen.`,
    () => 'Warmte helpt bij krampen — een kruik of warme thee kan echt verschil maken.',
    () => 'Geef jezelf toestemming om het rustiger aan te doen — je lichaam werkt hard.',
    () => 'Donkere bladgroenten met een scheutje citroen verbeteren ijzeropname flink.',
    () => 'Krampen? Magnesiumrijke cacao en pompoenpitten zijn een stille remedie.',
  ],
  [PHASES.FOLLICULAR]: [
    (name) => `In de folliculaire fase heb je ${name ? name : 'jij'} van nature meer energie — ideaal moment voor nieuwe gewoonten.`,
    () => 'Lichte salades en zuurkool passen goed bij de stijgende oestrogeenspiegel.',
    () => 'Je creatieve energie piek zit nu — plan iets nieuws of uitdagends.',
    () => 'Gefermenteerd voedsel ondersteunt je darm — een lepel zuurkool telt al mee.',
    () => 'Ontkiemde granen verteren zachter en passen bij de stijgende energie.',
  ],
  [PHASES.OVULATORY]: [
    (name) => `${name ? `${name}, j` : 'J'}e zit op je energiepiek — benut het!`,
    () => 'Broccoli en bloemkool ondersteunen je lever bij het verwerken van hoge oestrogeenspiegels.',
    () => 'Vezels helpen nu extra — denk aan lijnzaad of quinoa bij je lunch.',
    () => 'Piekenergie: plan de zwaardere training en herstel daarna met eiwitten.',
    () => 'Bessen bij het ontbijt — antioxidanten zijn dol op de ovulatiefase.',
  ],
  [PHASES.LUTEAL]: [
    (name) => `${name ? `${name}, j` : 'J'}e lichaam verbrandt nu meer calorieën — extra eten is oké en zelfs goed.`,
    () => 'Magnesium (pure chocolade, pompoenpitten) vermindert PMS-symptomen.',
    () => 'Complexe koolhydraten stabiliseren je bloedsuiker en humeur in deze fase.',
    () => 'Gefermenteerd voedsel nu is een cadeau voor je volgende menstruatie.',
    () => 'Extra zout vandaag is oké — progesteron zorgt dat je meer natrium verliest.',
  ],
};

/**
 * Turn an ISO date (YYYY-MM-DD) into a small integer hash.
 * Deterministic, no crypto needed — just enough spread to rotate tips.
 */
function seedFromDate(date) {
  const iso = toISODate(date);
  let h = 0;
  for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Get the tip of the day for the given phase + date.
 * Same inputs always produce the same tip.
 * @param {string} phase
 * @param {Date} [date]
 * @param {string} [name]
 */
export function getDailyInsight(phase, date = new Date(), name = '') {
  const pool = TIPS[phase] ?? TIPS[PHASES.FOLLICULAR];
  const idx  = seedFromDate(date) % pool.length;
  return {
    text:  pool[idx](name),
    phase,
    date:  toISODate(date),
  };
}

/* ------------------------------------------------------------------ */
/*  Self-care kaarten — uitgebreid voor de menstruatiefase             */
/* ------------------------------------------------------------------ */

/**
 * Vijf categorieën self-care suggesties die worden getoond als
 * uitklapbare kaarten in de menstruatiefase. Het zijn rituelen,
 * geen prestaties — bewust mild geschreven, geen "moet"-taal.
 *
 * Elke kaart heeft 2–3 concrete suggesties zodat de gebruiker
 * niet hoeft te kiezen uit een lange lijst maar wel iets nieuws
 * kan ontdekken.
 */
export const MENSTRUAL_SELFCARE = [
  {
    id:       'music',
    icon:     '🎵',
    title:    'Cosy vibes playlist',
    intro:    'Drie soorten muziek die rustig achter de oren tikken.',
    items: [
      { headline: 'Ambient & lo-fi', body: 'Zachte beats zonder tekst — perfect tijdens werk of een rustige avond.' },
      { headline: 'Akoestische ballades', body: 'Norah Jones, Lianne La Havas, Phoebe Bridgers. Warm en kalm.' },
      { headline: 'Klassieke piano', body: 'Ludovico Einaudi of Ólafur Arnalds — bijna meditatief.' },
    ],
  },
  {
    id:       'bath',
    icon:     '🛁',
    title:    'Magnesium voetenbadje',
    intro:    'Tien minuten warm water, voeten erin, en even niks.',
    items: [
      { headline: 'De basis', body: 'Een teiltje warm water (37–40 °C), 2 eetlepels magnesiumvlokken (Epsom).' },
      { headline: 'Geur erbij', body: 'Een paar druppels lavendel of rozemarijn voor extra ontspanning.' },
      { headline: 'Maak het ritueel', body: 'Combineer met thee en een boek — niet je telefoon.' },
    ],
  },
  {
    id:       'drinks',
    icon:     '☕',
    title:    'Warme dranken',
    intro:    'Drie recepten voor in een grote mok.',
    items: [
      { headline: 'Golden latte', body: 'Warme melk + kurkuma + snufje peper + honing. Ontstekingsremmend.' },
      { headline: 'Warme cacao', body: 'Pure cacao + havermelk + kaneel. Magnesium voor je krampen.' },
      { headline: 'Kruidenthee', body: 'Frambozenblad, gember of kamille — kalm en ondersteunend.' },
    ],
  },
  {
    id:       'nature',
    icon:     '🌿',
    title:    'Natuur wandeling',
    intro:    'Een kwartiertje naar buiten, in je eigen tempo.',
    items: [
      { headline: '15 minuten is genoeg', body: 'Geen rondje hardlopen — gewoon buiten zijn, langzaam tempo.' },
      { headline: 'Zonder telefoon', body: 'Kijk omhoog, hoor wat er is. Je lichaam doet de rest.' },
      { headline: 'Park of bos boven stoep', body: 'Groen verlaagt cortisol meetbaar — kies de route die dat geeft.' },
    ],
  },
  {
    id:       'books',
    icon:     '📚',
    title:    'Boeken voor zachte dagen',
    intro:    'Drie tips, bij voorkeur op een kussen onder een dekentje.',
    items: [
      { headline: 'In Praise of Slow — Carl Honoré', body: 'Een hartelijke ode aan vertragen. Geen schuldgevoel, alleen perspectief.' },
      { headline: 'Big Magic — Elizabeth Gilbert', body: 'Over creativiteit zonder druk — past goed bij naar binnen keren.' },
      { headline: 'The Comfort Book — Matt Haig', body: 'Korte hoofdstukken, lichtvoetig en troostend. Ideaal voor een uurtje.' },
    ],
  },
];
