/**
 * Paced — i18n
 * -----------
 * Centrale Nederlands/Engels dictionary + helpers. Alle UI-strings van
 * Paced komen hier doorheen via de `useT()` hook of de pure `t(locale,
 * key)` helper. Lib-bestanden (cycle.js, nutrition.js, insights.js)
 * blijven hun eigen NL labels exporteren voor backwards-compat met de
 * tests; de UI gebruikt deze module om de juiste taal te kiezen.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Locale detection + persistence                                     */
/* ------------------------------------------------------------------ */

const LOCALE_KEY = 'paced.locale';

export const SUPPORTED_LOCALES = ['nl', 'en'];

export function detectLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  } catch { /* private mode */ }
  try {
    const nav = (navigator?.language || '').toLowerCase();
    if (nav.startsWith('en')) return 'en';
  } catch { /* SSR */ }
  return 'nl';
}

function persistLocale(locale) {
  try { localStorage.setItem(LOCALE_KEY, locale); }
  catch { /* private mode */ }
}

/* ------------------------------------------------------------------ */
/*  Dates                                                              */
/* ------------------------------------------------------------------ */

const DAY_NAMES = {
  nl: ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'],
  en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
};

const MONTH_NAMES_SHORT = {
  nl: ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
};

const INTL_LOCALE = { nl: 'nl-NL', en: 'en-GB' };

export function formatDate(date, locale, options = {}) {
  return date.toLocaleDateString(INTL_LOCALE[locale] || 'nl-NL', options);
}

export function shortMonth(iso, locale) {
  const d = new Date(`${iso}T00:00:00`);
  return MONTH_NAMES_SHORT[locale][d.getMonth()].toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Phase metadata (label/subtitle/blurb)                              */
/* ------------------------------------------------------------------ */

const PHASE_META_I18N = {
  nl: {
    menstrual:  { label: 'Menstruatie', subtitle: 'Rust & herstel',     blurb: 'Energie is van nature lager. Eer dat — warme, ijzerrijke maaltijden en zachte beweging.' },
    follicular: { label: 'Folliculair', subtitle: 'Opbouw & creatie',   blurb: 'Oestrogeen stijgt en daarmee je energie. Lichte, frisse voeding en nieuwe experimenten landen goed.' },
    ovulatory:  { label: 'Ovulatie',    subtitle: 'Piek & verbinding',  blurb: 'Piek oestrogeen, piek energie. Vezels en ontstekingsremmende voeding ondersteunen een soepele overgang.' },
    luteal:     { label: 'Luteaal',     subtitle: 'Voeden & gronden',   blurb: 'Je lichaam verbrandt nu meer energie. Extra calorieën, complexe koolhydraten en magnesium zijn je vrienden.' },
  },
  en: {
    menstrual:  { label: 'Menstrual',   subtitle: 'Rest & recover',     blurb: 'Energy is naturally lower. Honour that — warm, iron-rich meals and gentle movement.' },
    follicular: { label: 'Follicular',  subtitle: 'Build & create',     blurb: 'Oestrogen rises and so does your energy. Light, fresh food and new experiments land well.' },
    ovulatory:  { label: 'Ovulatory',   subtitle: 'Peak & connect',     blurb: 'Peak oestrogen, peak energy. Fibre and anti-inflammatory food support a smooth transition.' },
    luteal:     { label: 'Luteal',      subtitle: 'Nourish & ground',   blurb: 'Your body is burning more energy now. Extra calories, complex carbs and magnesium are your friends.' },
  },
};

/* ------------------------------------------------------------------ */
/*  Phase hormone explainers                                           */
/* ------------------------------------------------------------------ */

const PHASE_HORMONES_I18N = {
  nl: {
    menstrual: {
      title: 'Wat gebeurt er hormonaal?',
      summary: 'Oestrogeen en progesteron zijn op hun laagst.',
      body: 'Je baarmoederslijmvlies komt los — een maandelijkse herstart. Omdat beide hormonen laag staan, mis je de oppepper waar je in andere fases op leunt.',
      moodHeadline: 'Wat je kunt voelen',
      mood: 'Vermoeidheid, gevoeligheid, behoefte aan stilte. Dat is geen luiheid — dat is je lichaam dat hard werkt.',
      affirmation: 'Rust is productief. Eer wat je lichaam vraagt en de rest komt vanzelf.',
    },
    follicular: {
      title: 'Wat gebeurt er hormonaal?',
      summary: 'Oestrogeen stijgt zachtjes weer aan.',
      body: 'Een nieuwe eicel rijpt. Oestrogeen lift je energie, je focus en je creatieve sap mee omhoog — een natuurlijk groeimoment.',
      moodHeadline: 'Wat je kunt voelen',
      mood: 'Frisheid, optimisme, zin om dingen aan te pakken. Sociale contacten voelen lichter, leren gaat soepeler.',
      affirmation: 'Een goed moment om iets nieuws te beginnen — een gewoonte, een gesprek, een plan.',
    },
    ovulatory: {
      title: 'Wat gebeurt er hormonaal?',
      summary: 'Oestrogeen piekt, LH zorgt voor de eisprong.',
      body: 'Je lichaam laat een eicel los. Hormonen staan op hun stralendst — je communicatie, charisma en zelfvertrouwen profiteren mee.',
      moodHeadline: 'Wat je kunt voelen',
      mood: 'Stralend, verbonden, zelfverzekerd. Je woorden komen makkelijker, je lichaam voelt sterker.',
      affirmation: 'Benut deze piek voor wat échte aanwezigheid vraagt: gesprekken, presentaties, samen sporten.',
    },
    luteal: {
      title: 'Wat gebeurt er hormonaal?',
      summary: 'Progesteron neemt het over.',
      body: 'Na de eisprong vertraagt je systeem. Progesteron werkt rustgevend, maar maakt je ook gevoeliger voor prikkels en stemmingen.',
      moodHeadline: 'Wat je kunt voelen',
      mood: 'Voller, emotioneler, soms prikkelbaar. Behoefte aan grenzen, comfort en voorspelbaarheid.',
      affirmation: 'Dit is geen achteruitgang — het is je lichaam dat ruimte vraagt. Zelfzorg en grenzen zijn nu zorg, geen luxe.',
    },
  },
  en: {
    menstrual: {
      title: "What's happening hormonally?",
      summary: 'Oestrogen and progesterone are at their lowest.',
      body: 'Your uterine lining is shedding — a monthly restart. With both hormones low, you miss the lift you lean on in other phases.',
      moodHeadline: 'What you might feel',
      mood: 'Tiredness, sensitivity, a need for quiet. That isn\'t laziness — it\'s your body working hard.',
      affirmation: 'Rest is productive. Honour what your body asks and the rest follows.',
    },
    follicular: {
      title: "What's happening hormonally?",
      summary: 'Oestrogen is gently rising again.',
      body: 'A new egg is maturing. Oestrogen lifts your energy, focus and creative drive — a natural growth moment.',
      moodHeadline: 'What you might feel',
      mood: 'Freshness, optimism, drive to take things on. Social contact feels lighter, learning flows more easily.',
      affirmation: 'A good moment to start something new — a habit, a conversation, a plan.',
    },
    ovulatory: {
      title: "What's happening hormonally?",
      summary: 'Oestrogen peaks, LH triggers ovulation.',
      body: 'Your body releases an egg. Hormones are at their brightest — your communication, charisma and confidence benefit too.',
      moodHeadline: 'What you might feel',
      mood: 'Radiant, connected, confident. Your words come more easily, your body feels stronger.',
      affirmation: 'Use this peak for what real presence asks of you: conversations, presentations, group movement.',
    },
    luteal: {
      title: "What's happening hormonally?",
      summary: 'Progesterone takes over.',
      body: 'After ovulation your system slows down. Progesterone is calming but also makes you more sensitive to stimuli and moods.',
      moodHeadline: 'What you might feel',
      mood: 'Fuller, more emotional, sometimes irritable. A need for boundaries, comfort and predictability.',
      affirmation: 'This isn\'t a step back — it\'s your body asking for space. Self-care and boundaries are care now, not luxury.',
    },
  },
};

/* ------------------------------------------------------------------ */
/*  Phase sports advice                                                */
/* ------------------------------------------------------------------ */

const PHASE_SPORTS_I18N = {
  nl: {
    menstrual:  { headline: 'Lichte beweging',     why: 'Je energie is laag — zachte beweging ondersteunt herstel zonder uit te putten.', examples: ['Yoga (yin / restorative)', 'Wandelen in de natuur', 'Stretching of mobility'] },
    follicular: { headline: 'Opbouwend',           why: 'Stijgend oestrogeen verhoogt je energie en spierherstel — bouw kalm op.',         examples: ['Pilates of barre', 'Lichte cardio of fietsen', 'Krachttraining (lager volume)'] },
    ovulatory:  { headline: 'Krachtig',            why: 'Piek oestrogeen, piek kracht — een goed moment voor je zwaardere training.',     examples: ['HIIT of intervaltraining', 'Hardlopen', 'Sportles of teamactiviteit'] },
    luteal:     { headline: 'Matig & rustgevend', why: 'Progesteron vraagt om kalmere intensiteit — voel goed van bewegen, niet uitgeput.', examples: ['Yoga (vinyasa rustig)', 'Zwemmen', 'Rustige fietssessie'] },
  },
  en: {
    menstrual:  { headline: 'Light movement',     why: 'Your energy is low — gentle movement supports recovery without draining you.',     examples: ['Yoga (yin / restorative)', 'Walking in nature', 'Stretching or mobility'] },
    follicular: { headline: 'Building up',        why: 'Rising oestrogen increases energy and muscle recovery — build up calmly.',         examples: ['Pilates or barre', 'Light cardio or cycling', 'Strength training (lower volume)'] },
    ovulatory:  { headline: 'Powerful',           why: 'Peak oestrogen, peak strength — a great moment for your heavier training.',        examples: ['HIIT or interval training', 'Running', 'Group class or team activity'] },
    luteal:     { headline: 'Moderate & soothing', why: 'Progesterone asks for calmer intensity — feel good from moving, not exhausted.',  examples: ['Yoga (gentle vinyasa)', 'Swimming', 'Easy cycling session'] },
  },
};

/* ------------------------------------------------------------------ */
/*  Phase work / stress / agenda advice                                */
/* ------------------------------------------------------------------ */

const PHASE_WORK_I18N = {
  nl: {
    menstrual: {
      headline:   'Bescherm je energie',
      workTip:    'Vermijd grote presentaties en moeilijke gesprekken. Focus op routinetaken en afmaken wat al loopt.',
      sportTip:   'Rust of lichte beweging: wandelen, yin yoga, stretching. Geen intensieve training.',
      agendaTips: ['Houd je agenda licht en ongeblokkeerd', 'Plan rustmomenten in je dag', 'Stel niet-urgente deadlines gerust uit'],
    },
    follicular: {
      headline:   'Ga voor nieuwe uitdagingen',
      workTip:    'Ideaal voor nieuwe projecten, creatieve taken, leertrajecten en brainstormsessies. Je brein is scherp.',
      sportTip:   'Bouw rustig op: cardio, pilates of krachttraining op lager volume. Je herstelt snel.',
      agendaTips: ['Plan nieuwe projecten en kickoffs in', 'Maak afspraken voor moeilijke gesprekken', 'Leer iets nieuws — absorptievermogen is hoog'],
    },
    ovulatory: {
      headline:   'Jouw piekweek',
      workTip:    'Dé week voor presentaties, netwerken, moeilijke gesprekken en samenwerking. Sociale energie is op z\'n hoogst.',
      sportTip:   'Maximale prestatie: HIIT, zware krachttraining of teamsport. Je lichaam kan meer aan.',
      agendaTips: ['Plan je belangrijkste afspraken en deadlines', 'Zeg ja tegen sociale en professionele kansen', 'Gebruik deze focus voor complexe beslissingen'],
    },
    luteal: {
      headline:   'Afronden, geen nieuwe start',
      workTip:    'Focus op afmaken, details en diepgaand werk. Vermijd het aangaan van grote nieuwe verplichtingen.',
      sportTip:   'Matige intensiteit: yoga, zwemmen of rustig fietsen. Luister goed naar je lichaam.',
      agendaTips: ['Bescherm je agenda — beperk nieuwe social events', 'Reserveer tijd voor herstel en stilte', 'Delegeer waar mogelijk; perfectionisme kost nu veel energie'],
    },
  },
  en: {
    menstrual: {
      headline:   'Protect your energy',
      workTip:    'Avoid big presentations and difficult conversations. Focus on routine tasks and finishing what\'s already in progress.',
      sportTip:   'Rest or light movement: walking, yin yoga, stretching. Skip intense training.',
      agendaTips: ['Keep your calendar light and unblocked', 'Schedule rest moments into your day', 'Postpone non-urgent deadlines without guilt'],
    },
    follicular: {
      headline:   'Go for new challenges',
      workTip:    'Ideal for new projects, creative tasks, learning, and brainstorming. Your mind is sharp.',
      sportTip:   'Build up gradually: cardio, pilates or strength training at lower volume. Recovery is fast.',
      agendaTips: ['Schedule new project kickoffs', 'Book difficult conversations now', 'Learn something new — absorption capacity is high'],
    },
    ovulatory: {
      headline:   'Your peak week',
      workTip:    'The week for presentations, networking, difficult talks, and collaboration. Social energy is at its highest.',
      sportTip:   'Peak performance: HIIT, heavy strength or team sport. Your body can handle more.',
      agendaTips: ['Schedule your most important meetings and deadlines', 'Say yes to social and professional opportunities', 'Tackle complex decisions while focus is high'],
    },
    luteal: {
      headline:   'Finish up, not start fresh',
      workTip:    'Focus on finishing, details, and deep work. Avoid taking on major new commitments.',
      sportTip:   'Moderate intensity: yoga, swimming or easy cycling. Listen closely to your body.',
      agendaTips: ['Protect your calendar — limit new social events', 'Reserve time for rest and quiet', 'Delegate where possible; perfectionism costs extra energy now'],
    },
  },
};

/* ------------------------------------------------------------------ */
/*  Sport intensities                                                  */
/* ------------------------------------------------------------------ */

const SPORT_INTENSITIES_I18N = {
  nl: [
    { id: 'rest',     label: 'Rust',      hint: 'Vandaag rusten, ook beweging' },
    { id: 'light',    label: 'Licht',     hint: 'Wandelen, yoga, stretchen' },
    { id: 'moderate', label: 'Matig',     hint: 'Cardio, pilates, krachtoefeningen' },
    { id: 'intense',  label: 'Intensief', hint: 'HIIT, hardlopen, zware kracht' },
  ],
  en: [
    { id: 'rest',     label: 'Rest',     hint: 'Resting today, also movement' },
    { id: 'light',    label: 'Light',    hint: 'Walking, yoga, stretching' },
    { id: 'moderate', label: 'Moderate', hint: 'Cardio, pilates, strength work' },
    { id: 'intense',  label: 'Intense',  hint: 'HIIT, running, heavy strength' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Activity levels                                                    */
/* ------------------------------------------------------------------ */

const ACTIVITY_LEVELS_I18N = {
  nl: {
    sedentary:   { label: 'Sedentair',    hint: 'Voornamelijk zittend werk' },
    light:       { label: 'Licht actief', hint: '1–3 lichte sessies / week' },
    moderate:    { label: 'Matig actief', hint: '3–5 sessies / week' },
    active:      { label: 'Actief',       hint: '6–7 sessies / week' },
    very_active: { label: 'Zeer actief',  hint: 'Atletenniveau' },
  },
  en: {
    sedentary:   { label: 'Sedentary',     hint: 'Mostly desk-based work' },
    light:       { label: 'Lightly active', hint: '1–3 light sessions / week' },
    moderate:    { label: 'Moderately active', hint: '3–5 sessions / week' },
    active:      { label: 'Active',        hint: '6–7 sessions / week' },
    very_active: { label: 'Very active',   hint: 'Athlete-level' },
  },
};

/* ------------------------------------------------------------------ */
/*  Nutrient focus per phase                                           */
/* ------------------------------------------------------------------ */

const NUTRIENT_FOCUS_I18N = {
  nl: {
    menstrual:  { headline: 'IJzer & warmte',                foods: ['Rode linzen', 'Donkere bladgroenten', 'Rode bieten', 'Grasgevoerd vlees', 'Pompoenpitten'],   why: 'Het aanvullen van ijzer verloren tijdens de menstruatie ondersteunt stabiele energie en stemming.' },
    follicular: { headline: 'Fris & gefermenteerd',          foods: ['Zuurkool', 'Kefir', 'Gekiemd graan', 'Citrus', 'Bladgroentesalades'],                       why: 'Stijgend oestrogeen past prachtig bij lichte, probiotica-rijke voeding die zachtjes ontgiftingspaden ondersteunt.' },
    ovulatory:  { headline: 'Vezels & antioxidanten',        foods: ['Bessen', 'Koolsoorten', 'Lijnzaad', 'Quinoa', 'Groene thee'],                                why: 'Vezels en koolsoorten helpen je lever om piek-oestrogeen soepel te metaboliseren.' },
    luteal:     { headline: 'Darmgezondheid & magnesium',    foods: ['Gefermenteerde voeding', 'Zoete aardappel', 'Pure chocolade (70%+)', 'Pompoenpitten', 'Haver'], why: 'Progesteron vertraagt de spijsvertering — vezels, gefermenteerde voeding en magnesium houden je darm kalm en trek in balans.' },
  },
  en: {
    menstrual:  { headline: 'Iron & warmth',                  foods: ['Red lentils', 'Dark leafy greens', 'Beetroot', 'Grass-fed meat', 'Pumpkin seeds'],            why: 'Replenishing iron lost during menstruation supports steady energy and mood.' },
    follicular: { headline: 'Fresh & fermented',              foods: ['Sauerkraut', 'Kefir', 'Sprouted grains', 'Citrus', 'Leafy salads'],                           why: 'Rising oestrogen pairs beautifully with light, probiotic-rich food that gently supports detox pathways.' },
    ovulatory:  { headline: 'Fibre & antioxidants',           foods: ['Berries', 'Cruciferous greens', 'Flaxseed', 'Quinoa', 'Green tea'],                            why: 'Fibre and cruciferous veg help your liver metabolise peak oestrogen smoothly.' },
    luteal:     { headline: 'Gut health & magnesium',         foods: ['Fermented foods', 'Sweet potato', 'Dark chocolate (70%+)', 'Pumpkin seeds', 'Oats'],          why: 'Progesterone slows digestion — fibre, fermented foods and magnesium keep your gut calm and cravings balanced.' },
  },
};

/* ------------------------------------------------------------------ */
/*  Daily tips per phase                                               */
/* ------------------------------------------------------------------ */

const TIPS_I18N = {
  nl: {
    menstrual: [
      (name) => `${name ? `${name}, i` : 'I'}n de menstruatiefase heeft je lichaam extra ijzer nodig — probeer vandaag spinazie of linzen.`,
      () => 'Warmte helpt bij krampen — een kruik of warme thee kan echt verschil maken.',
      () => 'Geef jezelf toestemming om het rustiger aan te doen — je lichaam werkt hard.',
      () => 'Donkere bladgroenten met een scheutje citroen verbeteren ijzeropname flink.',
      () => 'Krampen? Magnesiumrijke cacao en pompoenpitten zijn een stille remedie.',
    ],
    follicular: [
      (name) => `In de folliculaire fase heb je ${name ? name : 'jij'} van nature meer energie — ideaal moment voor nieuwe gewoonten.`,
      () => 'Lichte salades en zuurkool passen goed bij de stijgende oestrogeenspiegel.',
      () => 'Je creatieve energie piek zit nu — plan iets nieuws of uitdagends.',
      () => 'Gefermenteerd voedsel ondersteunt je darm — een lepel zuurkool telt al mee.',
      () => 'Ontkiemde granen verteren zachter en passen bij de stijgende energie.',
    ],
    ovulatory: [
      (name) => `${name ? `${name}, j` : 'J'}e zit op je energiepiek — benut het!`,
      () => 'Broccoli en bloemkool ondersteunen je lever bij het verwerken van hoge oestrogeenspiegels.',
      () => 'Vezels helpen nu extra — denk aan lijnzaad of quinoa bij je lunch.',
      () => 'Piekenergie: plan de zwaardere training en herstel daarna met eiwitten.',
      () => 'Bessen bij het ontbijt — antioxidanten zijn dol op de ovulatiefase.',
    ],
    luteal: [
      (name) => `${name ? `${name}, j` : 'J'}e lichaam verbrandt nu meer calorieën — extra eten is oké en zelfs goed.`,
      () => 'Magnesium (pure chocolade, pompoenpitten) vermindert PMS-symptomen.',
      () => 'Complexe koolhydraten stabiliseren je bloedsuiker en humeur in deze fase.',
      () => 'Gefermenteerd voedsel nu is een cadeau voor je volgende menstruatie.',
      () => 'Extra zout vandaag is oké — progesteron zorgt dat je meer natrium verliest.',
    ],
  },
  en: {
    menstrual: [
      (name) => `${name ? `${name}, i` : 'I'}n the menstrual phase your body needs extra iron — try spinach or lentils today.`,
      () => 'Warmth helps with cramps — a hot water bottle or warm tea can really make a difference.',
      () => 'Give yourself permission to take it easier — your body is working hard.',
      () => 'Dark leafy greens with a squeeze of lemon improve iron absorption considerably.',
      () => 'Cramps? Magnesium-rich cacao and pumpkin seeds are a quiet remedy.',
    ],
    follicular: [
      (name) => `In the follicular phase ${name ? name : 'you'} naturally have more energy — an ideal moment for new habits.`,
      () => 'Light salads and sauerkraut pair well with rising oestrogen.',
      () => 'Your creative peak is now — plan something new or challenging.',
      () => 'Fermented food supports your gut — a spoonful of sauerkraut already counts.',
      () => 'Sprouted grains digest more gently and suit the rising energy.',
    ],
    ovulatory: [
      (name) => `${name ? `${name}, y` : 'Y'}ou\'re at your energy peak — make the most of it!`,
      () => 'Broccoli and cauliflower support your liver in processing high oestrogen levels.',
      () => 'Fibre helps especially now — think flaxseed or quinoa with your lunch.',
      () => 'Peak energy: plan the heavier training and recover afterwards with protein.',
      () => 'Berries at breakfast — antioxidants love the ovulatory phase.',
    ],
    luteal: [
      (name) => `${name ? `${name}, y` : 'Y'}our body burns more calories now — eating extra is fine and even helpful.`,
      () => 'Magnesium (dark chocolate, pumpkin seeds) reduces PMS symptoms.',
      () => 'Complex carbs stabilise your blood sugar and mood in this phase.',
      () => 'Fermented food now is a gift for your next period.',
      () => 'Extra salt today is fine — progesterone makes you lose more sodium.',
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Menstrual self-care cards                                          */
/* ------------------------------------------------------------------ */

const MENSTRUAL_SELFCARE_I18N = {
  nl: [
    { id: 'music', icon: '🎵', title: 'Cosy vibes playlist', intro: 'Geluid dat de schouders laat zakken.',
      items: [
        { headline: 'Ambient & lo-fi',         body: 'Zachte beats zonder tekst — perfect tijdens werk of een rustige avond.' },
        { headline: 'Akoestische ballades',    body: 'Norah Jones, Lianne La Havas, Phoebe Bridgers. Warm en kalm.' },
        { headline: 'Klassieke piano',         body: 'Ludovico Einaudi of Ólafur Arnalds — bijna meditatief.' },
      ] },
    { id: 'bath', icon: '🛁', title: 'Warm voetenbadje', intro: 'Tien minuten warm water werken meer dan je denkt.',
      items: [
        { headline: 'De basis',         body: 'Een teiltje warm water (37–40 °C). Eventueel een snufje grof zeezout.' },
        { headline: 'Geur erbij',       body: 'Een paar druppels lavendel of rozemarijn voor extra ontspanning.' },
        { headline: 'Maak het ritueel', body: 'Combineer met thee en een boek — niet je telefoon.' },
      ] },
    { id: 'drinks', icon: '☕', title: 'Warme dranken', intro: 'Iets warms in je handen kalmeert het zenuwstelsel.',
      items: [
        { headline: 'Golden latte',  body: 'Warme melk + kurkuma + snufje peper + honing. Ontstekingsremmend.' },
        { headline: 'Warme cacao',   body: 'Pure cacao + havermelk + kaneel. Magnesium voor je krampen.' },
        { headline: 'Kruidenthee',   body: 'Frambozenblad, gember of kamille — kalm en ondersteunend.' },
      ] },
    { id: 'nature', icon: '🌿', title: 'Natuur wandeling', intro: 'Een korte wandeling reset je hoofd zonder uit te putten.',
      items: [
        { headline: '15 minuten is genoeg',      body: 'Geen rondje hardlopen — gewoon buiten zijn, langzaam tempo.' },
        { headline: 'Zonder telefoon',           body: 'Kijk omhoog, hoor wat er is. Je lichaam doet de rest.' },
        { headline: 'Park of bos boven stoep',   body: 'Groen verlaagt cortisol meetbaar — kies de route die dat geeft.' },
      ] },
    { id: 'books', icon: '📚', title: 'Boeken voor zachte dagen', intro: 'Drie titels die troosten zonder eisen te stellen.',
      items: [
        { headline: 'In Praise of Slow — Carl Honoré',   body: 'Een hartelijke ode aan vertragen. Geen schuldgevoel, alleen perspectief.' },
        { headline: 'Big Magic — Elizabeth Gilbert',      body: 'Over creativiteit zonder druk — past goed bij naar binnen keren.' },
        { headline: 'The Comfort Book — Matt Haig',       body: 'Korte hoofdstukken, lichtvoetig en troostend. Ideaal voor een uurtje.' },
      ] },
  ],
  en: [
    { id: 'music', icon: '🎵', title: 'Cosy vibes playlist', intro: 'Sound that lets the shoulders drop.',
      items: [
        { headline: 'Ambient & lo-fi',     body: 'Soft beats without lyrics — perfect during work or a quiet evening.' },
        { headline: 'Acoustic ballads',    body: 'Norah Jones, Lianne La Havas, Phoebe Bridgers. Warm and calm.' },
        { headline: 'Classical piano',     body: 'Ludovico Einaudi or Ólafur Arnalds — almost meditative.' },
      ] },
    { id: 'bath', icon: '🛁', title: 'Warm foot soak', intro: 'Ten minutes of warm water do more than you\'d think.',
      items: [
        { headline: 'The basics',          body: 'A basin of warm water (37–40 °C). Optionally a pinch of coarse sea salt.' },
        { headline: 'Add scent',           body: 'A few drops of lavender or rosemary for extra relaxation.' },
        { headline: 'Make it a ritual',    body: 'Combine with tea and a book — not your phone.' },
      ] },
    { id: 'drinks', icon: '☕', title: 'Warm drinks', intro: 'Something warm in your hands calms the nervous system.',
      items: [
        { headline: 'Golden latte',  body: 'Warm milk + turmeric + pinch of pepper + honey. Anti-inflammatory.' },
        { headline: 'Warm cacao',    body: 'Dark cacao + oat milk + cinnamon. Magnesium for your cramps.' },
        { headline: 'Herbal tea',    body: 'Raspberry leaf, ginger or chamomile — calm and supportive.' },
      ] },
    { id: 'nature', icon: '🌿', title: 'Nature walk', intro: 'A short walk resets your head without draining you.',
      items: [
        { headline: '15 minutes is enough',  body: 'Not a running loop — just being outside, slow pace.' },
        { headline: 'No phone',              body: 'Look up, hear what\'s there. Your body does the rest.' },
        { headline: 'Park or forest > pavement', body: 'Green lowers cortisol measurably — choose the route that gives that.' },
      ] },
    { id: 'books', icon: '📚', title: 'Books for tender days', intro: 'Three titles that comfort without demanding.',
      items: [
        { headline: 'In Praise of Slow — Carl Honoré', body: 'A warm ode to slowing down. No guilt, just perspective.' },
        { headline: 'Big Magic — Elizabeth Gilbert',    body: 'On creativity without pressure — fits well with turning inward.' },
        { headline: 'The Comfort Book — Matt Haig',     body: 'Short chapters, light-hearted and comforting. Ideal for an hour.' },
      ] },
  ],
};

/* ------------------------------------------------------------------ */
/*  Phase recipes                                                      */
/* ------------------------------------------------------------------ */

const PHASE_RECIPES_I18N = {
  nl: {
    menstrual: [
      { emoji: '🍲', name: 'Linzensoep',           desc: 'Verwarmend en ijzerrijk',          time: '30 min',
        ingredients: ['Rode linzen', 'Wortel', 'Ui', 'Knoflook', 'Kurkuma', 'Groentebouillon'],
        steps: ['Ui en knoflook fruiten, wortel en linzen toevoegen met bouillon.', 'Zacht koken 20 min, blenderen en op smaak brengen met kurkuma en zout.'] },
      { emoji: '🥣', name: 'Rode bietenstoofpot',  desc: 'Aardend en vol antioxidanten',     time: '45 min',
        ingredients: ['Rode bieten', 'Kikkererwten', 'Tomaten', 'Ui', 'Kaneel', 'Olijfolie'],
        steps: ['Bieten en ui 10 min bakken in olie, dan tomaten en kikkererwten erbij.', 'Sudderen tot bieten zacht zijn, afsluiten met kaneel en verse kruiden.'] },
      { emoji: '🍵', name: 'Gemberrijst met tofu',  desc: 'Milde kruiden, verterend',          time: '25 min',
        ingredients: ['Zilvervliesrijst', 'Tofu', 'Verse gember', 'Sojasaus', 'Sesam', 'Lente-ui'],
        steps: ['Tofu goudbruin bakken met gember en sojasaus.', 'Serveren over rijst met sesam en lente-ui.'] },
    ],
    follicular: [
      { emoji: '🥗', name: 'Spinaziesalade',       desc: 'Licht, fris en vol ijzer',         time: '10 min',
        ingredients: ['Spinazie', 'Avocado', 'Granaatappelzaad', 'Pompoenpitten', 'Citroendressing', 'Fetakaas'],
        steps: ['Spinazie en avocado mengen, granaatappelzaad en pompoenpitten toevoegen.', 'Besprenkelen met citroendressing en feta.'] },
      { emoji: '🥤', name: 'Groene smoothiebowl',  desc: 'Energiek en voedingsrijk',         time: '10 min',
        ingredients: ['Bevroren banaan', 'Spinazie', 'Mango', 'Kokosmelk', 'Chiazaad', 'Granola'],
        steps: ['Banaan, spinazie, mango en kokosmelk blenden tot glad.', 'Gieten in kom, bestrooien met chiazaad en granola.'] },
      { emoji: '🌮', name: 'Kip-avocadowrap',      desc: 'Eiwitrijk en verzadigend',         time: '15 min',
        ingredients: ['Kipstoofvlees', 'Avocado', 'Volkoren tortilla', 'Rucola', 'Limoen', 'Koriander'],
        steps: ['Kip met limoen en koriander op smaak brengen.', 'Serveren in tortilla met avocado en rucola.'] },
    ],
    ovulatory: [
      { emoji: '🥦', name: 'Broccolisalade met zalm', desc: 'Antiontsteking en eiwitrijk',  time: '20 min',
        ingredients: ['Broccoli', 'Zalm', 'Walnoten', 'Citroen', 'Olijfolie', 'Knoflook'],
        steps: ['Broccoli 5 min stomen, zalm 10 min in de oven op 200°C.', 'Mengen met walnoten, citroen en olijfolie.'] },
      { emoji: '🫙', name: 'Hummus met rauwkost',     desc: 'Rauwe groenten, vol vezels',     time: '5 min',
        ingredients: ['Kikkererwten hummus', 'Wortel', 'Komkommer', 'Paprika', 'Selderij', 'Olijven'],
        steps: ['Groenten in sticks snijden.', 'Serveren met hummus en olijven.'] },
      { emoji: '🍳', name: 'Eiwitrijke omelet',       desc: 'Sterk, simpel en snel',          time: '10 min',
        ingredients: ['3 eieren', 'Paprika', 'Champignons', 'Spinazie', 'Feta', 'Kruiden'],
        steps: ['Groenten kort aanfruiten, dan eieren erover gieten.', 'Bedekken met feta en kruiden, vouwen en serveren.'] },
    ],
    luteal: [
      { emoji: '🍠', name: 'Zoete aardappelcurry',    desc: 'Complexe koolhydraten, troostend', time: '35 min',
        ingredients: ['Zoete aardappel', 'Kikkererwten', 'Kokosmelk', 'Currypasta', 'Spinazie', 'Rijst'],
        steps: ['Zoete aardappel en kikkererwten 5 min bakken met currypasta.', 'Kokosmelk toevoegen, 20 min sudderen, spinazie erbij en serveren met rijst.'] },
      { emoji: '🍫', name: 'Haver-choco-bites',       desc: 'Magnesiumrijke snack',           time: '15 min',
        ingredients: ['Havervlokken', 'Pindakaas', 'Pure chocolade 85%', 'Honing', 'Pompoenpitten', 'Zeezout'],
        steps: ['Alles mengen, kleine balletjes rollen en 10 min in de koelkast leggen.', 'Optioneel bedekken met gesmolten chocolade.'] },
      { emoji: '🌰', name: 'Pompoenrisotto',          desc: 'Verwarmend en voedzaam',         time: '40 min',
        ingredients: ['Risottorijst', 'Pompoen', 'Parmezaan', 'Ui', 'Witte wijn', 'Bouillon'],
        steps: ['Ui glazig fruiten, rijst toevoegen, dan wijn en bouillon schep voor schep.', 'Pompoen roerbakken en erdoor mengen met parmezaan.'] },
    ],
  },
  en: {
    menstrual: [
      { emoji: '🍲', name: 'Lentil soup',          desc: 'Warming and iron-rich',           time: '30 min',
        ingredients: ['Red lentils', 'Carrot', 'Onion', 'Garlic', 'Turmeric', 'Vegetable stock'],
        steps: ['Sauté onion and garlic, add carrot and lentils with stock.', 'Simmer 20 min, blend and season with turmeric and salt.'] },
      { emoji: '🥣', name: 'Beetroot stew',        desc: 'Grounding and full of antioxidants', time: '45 min',
        ingredients: ['Beetroot', 'Chickpeas', 'Tomatoes', 'Onion', 'Cinnamon', 'Olive oil'],
        steps: ['Sauté beetroot and onion 10 min in oil, then add tomatoes and chickpeas.', 'Simmer until beetroot is tender, finish with cinnamon and fresh herbs.'] },
      { emoji: '🍵', name: 'Ginger rice with tofu', desc: 'Mild spices, easy to digest',     time: '25 min',
        ingredients: ['Brown rice', 'Tofu', 'Fresh ginger', 'Soy sauce', 'Sesame', 'Spring onion'],
        steps: ['Pan-fry tofu golden brown with ginger and soy sauce.', 'Serve over rice with sesame and spring onion.'] },
    ],
    follicular: [
      { emoji: '🥗', name: 'Spinach salad',        desc: 'Light, fresh and full of iron',   time: '10 min',
        ingredients: ['Spinach', 'Avocado', 'Pomegranate seeds', 'Pumpkin seeds', 'Lemon dressing', 'Feta'],
        steps: ['Mix spinach and avocado, add pomegranate seeds and pumpkin seeds.', 'Drizzle with lemon dressing and feta.'] },
      { emoji: '🥤', name: 'Green smoothie bowl',  desc: 'Energising and nutrient-rich',    time: '10 min',
        ingredients: ['Frozen banana', 'Spinach', 'Mango', 'Coconut milk', 'Chia seeds', 'Granola'],
        steps: ['Blend banana, spinach, mango and coconut milk until smooth.', 'Pour into a bowl, top with chia seeds and granola.'] },
      { emoji: '🌮', name: 'Chicken-avocado wrap', desc: 'Protein-rich and satisfying',     time: '15 min',
        ingredients: ['Pulled chicken', 'Avocado', 'Whole-wheat tortilla', 'Rocket', 'Lime', 'Coriander'],
        steps: ['Season chicken with lime and coriander.', 'Serve in tortilla with avocado and rocket.'] },
    ],
    ovulatory: [
      { emoji: '🥦', name: 'Broccoli salad with salmon', desc: 'Anti-inflammatory and protein-rich', time: '20 min',
        ingredients: ['Broccoli', 'Salmon', 'Walnuts', 'Lemon', 'Olive oil', 'Garlic'],
        steps: ['Steam broccoli for 5 min, bake salmon 10 min at 200°C.', 'Mix with walnuts, lemon and olive oil.'] },
      { emoji: '🫙', name: 'Hummus with crudités',     desc: 'Raw vegetables, full of fibre',  time: '5 min',
        ingredients: ['Chickpea hummus', 'Carrot', 'Cucumber', 'Bell pepper', 'Celery', 'Olives'],
        steps: ['Cut vegetables into sticks.', 'Serve with hummus and olives.'] },
      { emoji: '🍳', name: 'Protein-rich omelette',    desc: 'Strong, simple and quick',       time: '10 min',
        ingredients: ['3 eggs', 'Bell pepper', 'Mushrooms', 'Spinach', 'Feta', 'Herbs'],
        steps: ['Briefly sauté vegetables, then pour eggs over them.', 'Top with feta and herbs, fold and serve.'] },
    ],
    luteal: [
      { emoji: '🍠', name: 'Sweet potato curry',       desc: 'Complex carbs, comforting',      time: '35 min',
        ingredients: ['Sweet potato', 'Chickpeas', 'Coconut milk', 'Curry paste', 'Spinach', 'Rice'],
        steps: ['Sauté sweet potato and chickpeas for 5 min with curry paste.', 'Add coconut milk, simmer 20 min, fold in spinach and serve with rice.'] },
      { emoji: '🍫', name: 'Oat-choco bites',          desc: 'Magnesium-rich snack',           time: '15 min',
        ingredients: ['Rolled oats', 'Peanut butter', 'Dark chocolate 85%', 'Honey', 'Pumpkin seeds', 'Sea salt'],
        steps: ['Mix everything, roll small balls and chill 10 min in the fridge.', 'Optionally coat with melted chocolate.'] },
      { emoji: '🌰', name: 'Pumpkin risotto',          desc: 'Warming and nourishing',         time: '40 min',
        ingredients: ['Risotto rice', 'Pumpkin', 'Parmesan', 'Onion', 'White wine', 'Stock'],
        steps: ['Sauté onion until soft, add rice, then wine and stock ladle by ladle.', 'Sauté pumpkin and stir through with parmesan.'] },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Quick breakfast ideas per phase                                    */
/* ------------------------------------------------------------------ */

const PHASE_BREAKFASTS_I18N = {
  nl: {
    menstrual: [
      { emoji: '🥣', name: 'Warme havermout',          hint: 'Gember, kaneel, banaan' },
      { emoji: '🍵', name: 'IJzerthee + roggebrood',   hint: 'Brandnetel, frambozenblad' },
      { emoji: '🍳', name: 'Roerei met spinazie',       hint: 'Snel, ijzer- en eiwitrijk' },
      { emoji: '🫘', name: 'Linzensoep + brood',        hint: 'Verwarmend, rijk aan ijzer' },
      { emoji: '🥞', name: 'Boekweitpannenkoekjes',    hint: 'Glutenvrij, met bosvruchten' },
      { emoji: '🧆', name: 'Volkoren wrap met falafel', hint: 'IJzer, vezels, tahini' },
    ],
    follicular: [
      { emoji: '🥤', name: 'Groene smoothie',           hint: 'Spinazie, banaan, kefir' },
      { emoji: '🥑', name: 'Avocadotoast met ei',       hint: 'Volkoren, citroen, peper' },
      { emoji: '🥗', name: 'Yoghurtbowl',               hint: 'Granaatappel, granola, hennepzaad' },
      { emoji: '🍓', name: 'Kwarkbowl met aardbeien',   hint: 'Eiwitrijk, collageen boost' },
      { emoji: '🌾', name: 'Quinoaporridge',             hint: 'Amandel, honing, mango' },
      { emoji: '🫙', name: 'Overnight oats',             hint: 'Chiazaad, kefir, kiwi' },
    ],
    ovulatory: [
      { emoji: '🥚', name: 'Omelet met groenten',       hint: 'Paprika, spinazie, feta' },
      { emoji: '🫐', name: 'Acaibowl',                   hint: 'Bessen, walnoten, kokos' },
      { emoji: '🥯', name: 'Volkoren bagel',             hint: 'Hummus, komkommer, dille' },
      { emoji: '🐟', name: 'Zalmwrap',                   hint: 'Gerookte zalm, roomkaas, rucola' },
      { emoji: '🥭', name: 'Tropische smoothiebowl',    hint: 'Mango, ananas, chiazaad' },
      { emoji: '🍞', name: 'Brood met tartaar + ei',    hint: 'Eiwitrijk, omega-3' },
    ],
    luteal: [
      { emoji: '🍠', name: 'Zoete-aardappel pannenkoek', hint: 'Kaneel, ahornsiroop, walnoten' },
      { emoji: '🥜', name: 'Havermout met pindakaas',   hint: 'Banaan, pure cacao, zeezout' },
      { emoji: '🍫', name: 'Chia pudding',               hint: 'Chocolade, frambozen, kokos' },
      { emoji: '🌰', name: 'Notenbrood met tahini',      hint: 'Magnesium, gezonde vetten' },
      { emoji: '🎃', name: 'Pompoenporridge',            hint: 'Kaneel, nootmuskaat, pecannoten' },
      { emoji: '🍌', name: 'Bananenpannenkoekjes',       hint: 'Ei, haver, donkere chocolade' },
    ],
  },
  en: {
    menstrual: [
      { emoji: '🥣', name: 'Warm porridge',              hint: 'Ginger, cinnamon, banana' },
      { emoji: '🍵', name: 'Iron tea + rye bread',       hint: 'Nettle, raspberry leaf' },
      { emoji: '🍳', name: 'Scrambled eggs + spinach',   hint: 'Fast, iron and protein' },
      { emoji: '🫘', name: 'Lentil soup + bread',        hint: 'Warming, iron-rich' },
      { emoji: '🥞', name: 'Buckwheat pancakes',         hint: 'Gluten-free, with berries' },
      { emoji: '🧆', name: 'Whole-grain wrap + falafel', hint: 'Iron, fibre, tahini' },
    ],
    follicular: [
      { emoji: '🥤', name: 'Green smoothie',             hint: 'Spinach, banana, kefir' },
      { emoji: '🥑', name: 'Avocado toast with egg',     hint: 'Whole-grain, lemon, pepper' },
      { emoji: '🥗', name: 'Yoghurt bowl',               hint: 'Pomegranate, granola, hemp' },
      { emoji: '🍓', name: 'Quark bowl with strawberries', hint: 'High-protein, collagen boost' },
      { emoji: '🌾', name: 'Quinoa porridge',            hint: 'Almond, honey, mango' },
      { emoji: '🫙', name: 'Overnight oats',             hint: 'Chia seeds, kefir, kiwi' },
    ],
    ovulatory: [
      { emoji: '🥚', name: 'Veggie omelette',            hint: 'Pepper, spinach, feta' },
      { emoji: '🫐', name: 'Acai bowl',                  hint: 'Berries, walnuts, coconut' },
      { emoji: '🥯', name: 'Whole-grain bagel',          hint: 'Hummus, cucumber, dill' },
      { emoji: '🐟', name: 'Salmon wrap',                hint: 'Smoked salmon, cream cheese, rocket' },
      { emoji: '🥭', name: 'Tropical smoothie bowl',     hint: 'Mango, pineapple, chia seeds' },
      { emoji: '🍞', name: 'Bread + egg + tartare',      hint: 'High-protein, omega-3' },
    ],
    luteal: [
      { emoji: '🍠', name: 'Sweet potato pancake',       hint: 'Cinnamon, maple, walnuts' },
      { emoji: '🥜', name: 'Oats with peanut butter',   hint: 'Banana, dark cacao, sea salt' },
      { emoji: '🍫', name: 'Chia pudding',               hint: 'Chocolate, raspberry, coconut' },
      { emoji: '🌰', name: 'Nut bread with tahini',      hint: 'Magnesium, healthy fats' },
      { emoji: '🎃', name: 'Pumpkin porridge',           hint: 'Cinnamon, nutmeg, pecans' },
      { emoji: '🍌', name: 'Banana pancakes',            hint: 'Egg, oat, dark chocolate' },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Symptom tracker                                                    */
/* ------------------------------------------------------------------ */

const SYMPTOM_META_I18N = {
  nl: [
    { id: 'energy',   label: 'Energie',    icons: ['😴','🥱','😐','🙂','⚡'], hint: '1 = uitgeput, 5 = energiek' },
    { id: 'mood',     label: 'Stemming',   icons: ['😢','😔','😐','🙂','😄'], hint: '1 = slecht, 5 = geweldig' },
    { id: 'cramps',   label: 'Krampen',    icons: ['🔥','😣','😐','🙂','✨'], hint: '1 = intens, 5 = geen' },
    { id: 'bloating', label: 'Opgeblazen', icons: ['🎈','😮','😐','🙂','✨'], hint: '1 = ernstig, 5 = geen' },
  ],
  en: [
    { id: 'energy',   label: 'Energy',     icons: ['😴','🥱','😐','🙂','⚡'], hint: '1 = drained, 5 = energetic' },
    { id: 'mood',     label: 'Mood',       icons: ['😢','😔','😐','🙂','😄'], hint: '1 = bad, 5 = great' },
    { id: 'cramps',   label: 'Cramps',     icons: ['🔥','😣','😐','🙂','✨'], hint: '1 = intense, 5 = none' },
    { id: 'bloating', label: 'Bloating',   icons: ['🎈','😮','😐','🙂','✨'], hint: '1 = severe, 5 = none' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Bleeding details                                                   */
/* ------------------------------------------------------------------ */

const BLEEDING_GROUPS_I18N = {
  nl: [
    { key: 'heaviness', label: 'Hevigheid', options: [
      { id: 'light',      label: 'Licht'      },
      { id: 'normal',     label: 'Normaal'    },
      { id: 'heavy',      label: 'Hevig'      },
      { id: 'very-heavy', label: 'Zeer hevig' },
    ]},
    { key: 'color', label: 'Kleur', options: [
      { id: 'light-pink', label: 'Lichtroze',  swatch: '#F4C9CB' },
      { id: 'red',        label: 'Rood',       swatch: '#C44848' },
      { id: 'dark-red',   label: 'Donkerrood', swatch: '#8A2A2A' },
      { id: 'brown',      label: 'Bruin',      swatch: '#6B4226' },
    ]},
    { key: 'clots', label: 'Klonters', options: [
      { id: 'none',  label: 'Geen'  },
      { id: 'light', label: 'Licht' },
      { id: 'heavy', label: 'Veel'  },
    ]},
    { key: 'clarity', label: 'Helderheid', options: [
      { id: 'clear',  label: 'Helder'  },
      { id: 'normal', label: 'Normaal' },
      { id: 'dark',   label: 'Donker'  },
    ]},
  ],
  en: [
    { key: 'heaviness', label: 'Heaviness', options: [
      { id: 'light',      label: 'Light'      },
      { id: 'normal',     label: 'Normal'     },
      { id: 'heavy',      label: 'Heavy'      },
      { id: 'very-heavy', label: 'Very heavy' },
    ]},
    { key: 'color', label: 'Colour', options: [
      { id: 'light-pink', label: 'Light pink', swatch: '#F4C9CB' },
      { id: 'red',        label: 'Red',        swatch: '#C44848' },
      { id: 'dark-red',   label: 'Dark red',   swatch: '#8A2A2A' },
      { id: 'brown',      label: 'Brown',      swatch: '#6B4226' },
    ]},
    { key: 'clots', label: 'Clots', options: [
      { id: 'none',  label: 'None'  },
      { id: 'light', label: 'Light' },
      { id: 'heavy', label: 'Heavy' },
    ]},
    { key: 'clarity', label: 'Clarity', options: [
      { id: 'clear',  label: 'Clear'  },
      { id: 'normal', label: 'Normal' },
      { id: 'dark',   label: 'Dark'   },
    ]},
  ],
};

const BLEEDING_LABELS_I18N = {
  nl: {
    light: 'Licht', normal: 'Normaal', heavy: 'Hevig', 'very-heavy': 'Zeer hevig',
    'light-pink': 'Lichtroze', red: 'Rood', 'dark-red': 'Donkerrood', brown: 'Bruin',
    none: 'Geen klonters', clear: 'Helder', dark: 'Donker',
  },
  en: {
    light: 'Light', normal: 'Normal', heavy: 'Heavy', 'very-heavy': 'Very heavy',
    'light-pink': 'Light pink', red: 'Red', 'dark-red': 'Dark red', brown: 'Brown',
    none: 'No clots', clear: 'Clear', dark: 'Dark',
  },
};

/* ------------------------------------------------------------------ */
/*  Big string dictionary                                              */
/* ------------------------------------------------------------------ */

const STRINGS = {
  nl: {
    /* generic / shared */
    'common.today': 'Vandaag',
    'common.yesterday': 'Gisteren',
    'common.tomorrow': 'Morgen',
    'common.soon': 'Binnenkort',
    'common.cancel': 'Annuleren',
    'common.back': 'Terug',
    'common.save': 'Opslaan',
    'common.saved': 'Opgeslagen!',
    'common.understood': 'Begrepen',
    'common.tryAgain': 'Probeer opnieuw',
    'common.installed': 'Installeer',
    'common.expand': 'uitklappen',
    'common.collapse': 'inklappen',
    'common.day_one': 'dag',
    'common.day_other': 'dagen',
    'common.cycle_one': 'cyclus',
    'common.cycle_other': 'cycli',
    'common.minutes': 'min',
    'common.hours': 'uur',
    'common.kcal': 'kcal',
    'common.glasses': 'glazen',
    'common.glassesShort': 'gl',
    'common.gramsShort': 'g',
    'common.daysShort': 'd',
    'common.minutesShort': 'm',
    'common.of': 'van',

    /* nav tabs */
    'nav.home':     'Vandaag',
    'nav.voeding':  'Voeding',
    'nav.logboek':  'Logboek',
    'nav.stats':    'Inzichten',
    'nav.settings': 'Profiel',
    'nav.aria':     'Hoofdnavigatie',

    /* dashboard header */
    'dash.greeting': 'Hoi {name} 👋',
    'dash.streak.aria': 'Reeks',
    'dash.openSettings': 'Instellingen openen',
    'dash.summary.aria': 'Voortgang vandaag',
    'dash.summary.goodDay': '🌿 Goede dag!',

    /* day labels */
    'days.cycleDay': 'Dag',

    /* cycle / period */
    'cycle.next.label': 'Volgende periode',
    'cycle.recent.title': 'Recente cycli',
    'cycle.recent.avg': 'gem. {n} dagen',
    'cycle.recent.foot': 'Cycluslengte varieert van nature — Paced gebruikt jouw ritme, niet een standaard van 28.',
    'cycle.recent.barAria': '{len} dagen cyclus gestart op {date}',
    'cycle.next.daysFmt': '{month} {day} · over {n} dagen',

    /* period log button */
    'period.logged.label': 'Menstruatie gelogd vandaag',
    'period.logged.undo': 'ongedaan maken',
    'period.logged.undoAria': 'Menstruatie-log ongedaan maken',
    'period.log.button': 'Mijn menstruatie begon vandaag',
    'period.log.aria': 'Log dat mijn menstruatie vandaag begon',
    'period.tracked': '{n} {label} bijgehouden',
    'period.day':       'Dag {n} van menstruatie',
    'period.startedAgo':'Begonnen {n} dagen geleden',
    'period.active':    'Menstruatie actief',
    'period.awaiting.title':        'Is je menstruatie begonnen?',
    'period.awaiting.due':          'Je menstruatie werd vandaag verwacht. Geef aan wanneer hij echt begint — dat houden we aan, ook als het afwijkt.',
    'period.awaiting.late':         'Je menstruatie werd {n} {label} geleden verwacht. Geen zorgen — cycli wisselen. Geef aan wanneer hij echt begint.',
    'period.awaiting.confirmToday': 'Ja, vandaag begonnen',
    'period.awaiting.confirmTodayAria': 'Bevestig dat mijn menstruatie vandaag is begonnen',
    'period.awaiting.otherDay':     'Hij begon op een andere dag',
    'period.awaiting.datePickLabel':'Kies de startdatum van je menstruatie',
    'period.awaiting.confirmDate':  'Bevestig deze datum',

    /* cycle ring */
    'cycleRing.outOf': 'van {n}',
    'cycleRing.ovulation.aria': 'Eisprong-indicator',

    /* day summary mini-rings */
    'mini.kcal':  'Kcal',
    'mini.eiwit': 'Eiwit',
    'mini.water': 'Water',
    'mini.move':  'Beweging',

    /* goal rings */
    'goals.title': 'Dagelijkse doelen',

    /* nutrition card */
    'nutrition.today':   'Voeding vandaag',
    'nutrition.deltaFor': '+{n} kcal voor {phase}',
    'nutrition.info':    'Log hier je dagelijkse calorieën en eiwitten. Eiwitten zijn extra belangrijk in de luteale fase om energie stabiel te houden. Ga naar het Voeding-tabblad voor een uitgebreid voedingslogboek.',

    /* trackers */
    'tracker.cal':         'Calorieën',
    'tracker.protein':     'Eiwitten',
    'tracker.water':       'Water',
    'tracker.water.glass': '{n} / {target} glazen',
    'tracker.water.hint':  'Elk glas ≈ 250 ml · tik om te vullen, tik het laatste gevulde glas om te wissen.',
    'tracker.sleep':       'Slaap gisteravond',
    'tracker.sleep.hint':  'Goede slaap ondersteunt hormonale balans en herstel.',
    'tracker.move':        'Beweging vandaag',
    'tracker.add.aria':    'Voeg {inc} {unit} toe',
    'tracker.clear':       'wis',
    'tracker.clear.aria':  'Wis {label}',
    'tracker.input.aria':  '{label} in {unit}',
    'tracker.input.unitOnly': '{unit} ingevoerd',
    'tracker.water.aria':  'Stel water in op {n} glazen',
    'tracker.sleep.aria':  '{n} uur slaap',
    'tracker.move.aria':   '{n} minuten bewegen',
    'tracker.move.clearAria': 'Wis bewegingstijd',
    'tracker.move.hint.menstrual':  'Een rustige wandeling of stretching is genoeg.',
    'tracker.move.hint.follicular': 'Goed moment om de intensiteit op te bouwen.',
    'tracker.move.hint.ovulatory':  'Piekenergie — ga ervoor!',
    'tracker.move.hint.luteal':     'Luister naar je lichaam; matig is ideaal.',

    /* journal */
    'journal.title':       'Notitie van vandaag',
    'journal.placeholder': 'Iets wat je wilt onthouden over vandaag…',

    /* symptom tracker */
    'symptoms.title':  'Hoe voel je je?',
    'symptoms.logged': 'Gelogd',
    'symptoms.aria':   '{label}: {n} van 5',
    'symptoms.sliderAria': '{label}: sleep van 1 tot 5',
    'symptoms.unset':  'nog niet ingevuld',
    'symptoms.clearAria': 'Wis {label}',

    /* basal temperature */
    'temp.title':       'Basaaltemperatuur',
    'temp.input.aria':  'Basaaltemperatuur in graden Celsius',
    'temp.clear.aria':  'Wis basaaltemperatuur',
    'temp.hint':        "Meet 's ochtends, vóór opstaan. Een aanhoudende stijging van ~0.2°C wijst op een eisprong.",
    'temp.empty':       "Nog geen metingen — log dagelijks 's ochtends voor een trend.",
    'temp.range':       '{shown} van {total} dagen',
    'temp.trend.aria':  'Basaaltemperatuur trend over {n} dagen',
    'temp.detected':    'Mogelijke eisprong rond {date}',
    'temp.detected.suffix': ' · op basis van temperatuurstijging',

    /* ovulation tracker */
    'ovulation.title':         'Eisprong vandaag',
    'ovulation.marked':        'Gemarkeerd',
    'ovulation.felt.label':    'Gevoeld',
    'ovulation.felt.hint':     'Krampje, glijmige afscheiding, libido-piek',
    'ovulation.fromTemp.label': 'Afgelezen van temperatuur',
    'ovulation.fromTemp.hint': 'Aanhoudende stijging van ~0.2°C',
    'ovulation.autoNote':      '🌿 Paced herkent een temperatuurstijging rond {date}.',

    /* bleeding details */
    'bleeding.title':    'Bloedingdetails',
    'bleeding.intro':    'Hoe kleiner de details die je opvolgt, hoe scherper het patroon dat Paced over de maanden ziet.',

    /* sport tracker */
    'sport.title':     'Sport vandaag',
    'sport.logged':    'Gelogd',
    'sport.adviceFor': 'Advies voor {phase}',
    'sport.ideas':     'Ideeën',
    'sport.feltHow':   'Hoe voelde jouw beweging?',

    /* self-care */
    'selfcare.title': 'Zachte rituelen',
    'selfcare.intro': 'Vijf categorieën om uit te kiezen — geen verplichting, alleen ideeën.',

    /* phase info modal */
    'phaseInfo.aria.button': 'Hormonale uitleg over {phase}',
    'phaseInfo.aria.close':  'Uitleg sluiten',

    /* gut */
    'gut.title': 'Darmgezondheid',
    'gut.info':  'Darmgezondheid heeft directe invloed op hormoonniveaus. Probiotica (levende bacteriën in yoghurt en kefir) ondersteunen je darmmicrobioom. Vezels (groenten, peulvruchten) houden de darmbeweging op gang. Gefermenteerde voeding voegt extra melkzuurbacteriën toe.',
    'gut.count': '{n} of 3',
    'gut.probiotics.label':  'Probiotica',
    'gut.probiotics.hint':   'Yoghurt, kefir, miso…',
    'gut.fiber.label':       'Vezelrijke maaltijd',
    'gut.fiber.hint':        'Groenten, peulvruchten, volkoren',
    'gut.fermented.label':   'Gefermenteerd',
    'gut.fermented.hint':    'Zuurkool, kimchi, miso, kombucha',
    'gut.done':              'Klaar',

    /* welzijn */
    'wellbeing.title': 'Welzijn',
    'wellbeing.info':  'Slaap en beweging beïnvloeden je hormoonbalans direct. Streef naar 7–9 uur slaap per nacht. In de luteale fase kan 20–30 minuten lichte beweging (wandelen, yoga) PMS-klachten verlichten. Intensief sporten tijdens de menstruatie kan soms meer vermoeidheid geven — luister naar je lichaam.',

    /* tip + insight */
    'tip.title':     'Tip van de dag',
    'tip.proteinLow': 'Je haalde gisteren minder eiwit{namePart} — probeer vandaag {target}g te bereiken.',
    'tip.hydrationLow': 'Je dronk gisteren gemiddeld {actual}L — probeer vandaag {target}L te halen.',
    'tip.sleepLow':   'Je sliep gisteren {h} uur{namePart}. Leg vanavond je telefoon eerder weg en dim het scherm een uur voor bedtijd.',
    'tip.moodLow':    'Je gemoedstoestand was gisteren laag{namePart}. Een korte wandeling buiten — ook 10 minuten — kan je stemming merkbaar verbeteren.',
    'tip.cramps':     'Je had gisteren krampen{namePart}. Breng je knieën naar je buik en houd ze 30 seconden vast — dat stimuleert de darmen en verlicht spanning in de onderbuik.',
    'tip.movementLow':'Je bewoog gisteren minder dan je doel{namePart}. Zelfs {min} minuten lichte beweging helpt je energie en hormoonbalans.',
    'tip.dismiss.aria':'Tip wegklikken',
    'insight.title': 'Dagelijks inzicht',

    /* week strip */
    'week.title':    'Voeding deze week',
    'week.last7':    'Afgelopen 7 dagen',
    'week.foot':     'Doelen verschuiven met je cyclus — de balken meten per fase.',
    'week.bar.aria': '{label} dag {n}: {pct}% van doel',
    'week.phaseStrip.aria': 'Cyclusfase per dag',

    /* workload card */
    'workload.title':   'Week planning',
    'workload.work':    'Werk',
    'workload.sport':   'Sport',
    'workload.agenda':  'Agenda tips',

    /* personalized nutrition targets */
    'nutrition.targets.title':    'Jouw dagdoelen',
    'nutrition.targets.based':    'Op basis van {kg}kg, {cm}cm en {phase} fase',
    'nutrition.targets.kcal':     'kcal',
    'nutrition.targets.protein':  'eiwit',
    'nutrition.targets.water':    'water',
    'nutrition.targets.perMeal':  '~{g}g eiwit per maaltijd (bij 4 eetmomenten)',

    /* nutrient focus */
    'focus.title':       'Nutriëntenfocus',
    'focus.openVoeding': 'Bekijk recepten in Voeding',

    /* phase recipes */
    'recipes.titleFor':    'Recepten voor jouw fase · {phase}',
    'recipes.ingredients': 'Ingrediënten',
    'recipes.steps':       'Bereiding',
    'breakfast.title':     'Snelle ontbijtideeën',
    'breakfast.refresh':   'Andere opties',

    /* PWA install */
    'pwa.title':     'Paced aan beginscherm toevoegen',
    'pwa.subtitle':  'Werkt offline, voelt als een app.',
    'pwa.install':   'Installeer',
    'pwa.dismiss':   'Installatie-prompt sluiten',

    /* reminder banner */
    'reminder.title':    'Vergeet niet te loggen!',
    'reminder.subtitle': 'Je hebt vandaag nog niets bijgehouden.',
    'reminder.dismiss':  'Herinnering sluiten',

    /* onboarding */
    'onb.intro.title':       'Hoi, ik ben Paced.',
    'onb.intro.subtitle':    'Jouw rustige gids voor cyclus-bewuste voeding, energie en welzijn.',
    'onb.intro.nameLabel':   'Hoe heet je?',
    'onb.intro.namePh':      'Jouw naam (optioneel)',
    'onb.intro.cta.named':   'Fijn je te ontmoeten, {name} ✓',
    'onb.intro.cta.empty':   'Laten we beginnen',
    'onb.intro.privacy':     'Paced bewaart alles uitsluitend lokaal op je apparaat — geen accounts, geen tracking.',
    'onb.intro.privacyMore': 'Volledige privacyverklaring & medische disclaimer vind je in Instellingen.',

    'onb.cycle.title.named':  '{name}, vertel over je cyclus.',
    'onb.cycle.title.empty':  'Vertel over je cyclus.',
    'onb.cycle.subtitle':     'Hier begint de personalisatie — alles komt hieruit voort.',
    'onb.cycle.lastPeriod':   'Eerste dag laatste menstruatie',
    'onb.cycle.length':       'Typische cycluslengte',
    'onb.cycle.lengthHint':   '28 dagen is gemiddeld — pas aan naar jouw ritme (21–45)',
    'onb.cycle.duration':     'Hoe lang duurt je menstruatie?',
    'onb.cycle.length.dec':   'Cycluslengte verlagen',
    'onb.cycle.length.inc':   'Cycluslengte verhogen',
    'onb.cycle.dur.dec':      'Menstruatieduur verlagen',
    'onb.cycle.dur.inc':      'Menstruatieduur verhogen',
    'onb.cycle.next':         'Volgende',

    'onb.body.title':       'Jouw lichaam.',
    'onb.body.subtitle':    'Dit bepaalt je calorie- en voedingsdoelen. Laat leeg om de standaardwaarden te gebruiken.',
    'onb.body.age':         'Leeftijd',
    'onb.body.weight':      'Gewicht kg',
    'onb.body.height':      'Lengte cm',
    'onb.body.activity':    'Activiteitsniveau',

    'onb.welcome.title.named': 'Welkom, {name}!',
    'onb.welcome.title.empty': 'Welkom bij Paced!',
    'onb.welcome.intro':       'Dit vind je in de app:',
    'onb.welcome.nav.home':    'Volg voeding, slaap en symptomen',
    'onb.welcome.nav.voeding': 'Recepten afgestemd op je fase',
    'onb.welcome.nav.logboek': 'Jouw dagelijkse geschiedenis',
    'onb.welcome.nav.stats':   'Patronen in je cyclus en data',
    'onb.welcome.nav.settings':'Doelen, herinneringen en meer',
    'onb.welcome.start':       'Begin',

    /* settings */
    'settings.title':            'Instellingen',
    'settings.profile':          'Profiel',
    'settings.name':             'Naam',
    'settings.namePh':           'Jouw naam (optioneel)',
    'settings.age':              'Leeftijd',
    'settings.weight':           'Gewicht kg',
    'settings.height':           'Lengte cm',
    'settings.cycleLength':      'Cycluslengte',
    'settings.activity':         'Activiteitsniveau',
    'settings.goals':            'Dagelijkse doelen',
    'settings.goal.calories':    'Calorieën',
    'settings.goal.protein':     'Eiwitdoel',
    'settings.goal.water':       'Waterdoel',
    'settings.goal.move':        'Bewegingsdoel',
    'settings.goal.sleep':       'Slaapdoel',
    'settings.goal.note':        'Laat leeg om automatische doelen te gebruiken.',
    'settings.reminders':        'Herinneringen',
    'settings.reminder.title':   'Dagelijkse herinnering',
    'settings.reminder.sub':     'Push-notificatie om te loggen',
    'settings.reminder.aria':    'Dagelijkse herinnering inschakelen',
    'settings.reminder.time':    'Tijdstip',
    'settings.display':          'Weergave',
    'settings.theme.auto':       'Automatisch',
    'settings.theme.light':      'Licht',
    'settings.theme.dark':       'Donker',
    'settings.language':         'Taal',
    'settings.language.nl':      'Nederlands',
    'settings.language.en':      'English',
    'settings.save':             'Wijzigingen opslaan',
    'settings.cards.title':     'Dashboard-secties',
    'settings.export':           'Exporteren',
    'settings.export.csv':       'CSV exporteren (90 dagen)',
    'settings.export.health':    'Exporteren naar Apple Health (XML)',
    'settings.danger':           'Gevarenzone',
    'settings.danger.note':      'Profiel resetten en opnieuw beginnen. Dagelijkse logs blijven bewaard.',
    'settings.danger.button':    'Profiel resetten',
    'settings.legal':            'Privacy & disclaimer',
    'settings.notif.unsupported':'Notificaties worden niet ondersteund in deze browser',
    'settings.notif.granted':    'Notificaties ingeschakeld ✓',
    'settings.notif.denied':     'Notificaties geblokkeerd',
    'settings.export.empty':     'Geen data om te exporteren',
    'settings.validate.age':     'Leeftijd moet tussen 12 en 80 jaar liggen',
    'settings.validate.weight':  'Gewicht moet tussen 30 en 250 kg liggen',
    'settings.validate.height':  'Lengte moet tussen 120 en 220 cm liggen',
    'settings.version':          'Paced · v1.3',

    /* reset confirm */
    'reset.title':   'Alle gegevens wissen?',
    'reset.body':    'Dit wist je profiel, alle dagelijkse logs én je voorkeuren. Niet terug te halen. Bevestig door hieronder WIS te typen.',
    'reset.input.placeholder': 'Typ WIS om te bevestigen',
    'reset.input.aria': 'Typ WIS om verwijdering te bevestigen',
    'reset.confirm': 'Ja, wis alles',
    'reset.cancel':  'Annuleren',

    /* consent gate */
    'consent.title':       'Toestemming voor je gezondheidsgegevens',
    'consent.intro':       'Paced verwerkt cyclus-, voedings- en welzijnsgegevens — onder de AVG (art. 9) een bijzondere categorie waarvoor we expliciet je toestemming nodig hebben.',
    'consent.li1':         '✓ Alle data blijft uitsluitend op jouw apparaat — geen account, geen server, geen tracking',
    'consent.li2':         '✓ Paced is geen medisch hulpmiddel — voor diagnose of behandeling raadpleeg je een arts',
    'consent.li3':         '✓ Je kunt je toestemming op elk moment intrekken door je gegevens te wissen via Instellingen',
    'consent.checkbox':    'Ik ben 16 jaar of ouder en geef toestemming voor het verwerken van mijn gezondheidsgegevens op dit apparaat door Paced.',
    'consent.legal.link':  'Lees de volledige privacy- en disclaimer-tekst',
    'consent.continue':    'Doorgaan naar Paced',
    'consent.continue.disabled': 'Vink eerst toestemming aan',
    'consent.withdraw.banner': 'Je toestemming voor health-data verwerking is op {date} gegeven (versie {version}).',

    /* json export */
    'settings.export.json':       'Volledige export (JSON, alle data)',
    'settings.export.json.aria':  'Exporteer alle data als JSON-bestand',

    /* notif explainer */
    'settings.notif.explainer':  'Paced herinnert je in de avond als je nog niets gelogd hebt. Notificaties draaien volledig lokaal — er wordt geen push-server gebruikt, niets verlaat je apparaat.',

    /* legal */
    'legal.title':         'Privacy & disclaimer',

    'legal.controller.title': 'Verwerkingsverantwoordelijke',
    'legal.controller.body':  'Paced wordt aangeboden door Xaven BV (KvK 42060488), gevestigd in Nederland. Voor privacy-vragen of een verzoek over je rechten: info@xaven.io. Op grond van AVG art. 37 is geen Functionaris Gegevensbescherming (DPO) aangewezen — de verwerking is geen kernactiviteit op grote schaal van bijzondere gegevens (alle data blijft lokaal op jouw apparaat en wordt niet door ons centraal samengevoegd).',
    'legal.controller.complaint': 'Niet tevreden over hoe wij omgaan met je privacy? Je hebt het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens via autoriteitpersoonsgegevens.nl.',

    'legal.basis.title':   'Rechtsgrondslag (AVG art. 6 + 9)',
    'legal.basis.body':    'Paced verwerkt cyclus-, voedings- en welzijnsgegevens. Onder AVG art. 9 zijn gezondheidsgegevens een bijzondere categorie waarvoor uitdrukkelijke toestemming nodig is (art. 9 lid 2 sub a). Die toestemming geef je bewust bij de eerste start van de app. Je kunt deze toestemming op elk moment intrekken door je gegevens te wissen via Instellingen → Alle gegevens wissen — dan stopt elke verdere verwerking.',

    'legal.med.title':     'Medische disclaimer',
    'legal.med.p1':        'Paced is een hulpmiddel voor zelfreflectie en bewustwording — geen medisch hulpmiddel in de zin van de EU Medical Device Regulation (2017/745). De app stelt geen diagnose, geeft geen behandeling, en vervangt geen consult bij een (huis)arts, gynaecoloog, voedingsdeskundige of andere zorgverlener.',
    'legal.med.p2':        'Berekeningen voor cyclus, vruchtbaar venster, calorieën en eiwitten zijn schattingen op basis van algemene formules. Ze kunnen afwijken van jouw persoonlijke situatie en zijn niet bedoeld als diagnose of behandeling. De kalendermethode is statistisch ~75–80% effectief; gebruik betrouwbare anticonceptie als zwangerschap een gezondheidsrisico zou vormen.',
    'legal.med.p3':        'Maak je je zorgen over je gezondheid, je menstruatiecyclus, je voeding of je welzijn? Neem dan altijd contact op met een gekwalificeerde zorgverlener.',

    'legal.store.title':   'Wat slaan we op',
    'legal.store.intro':   'Alle gegevens die je in Paced invoert blijven uitsluitend op dit apparaat, opgeslagen in de lokale opslag van je browser. Per veld het doel:',
    'legal.store.li1':     'Profiel (naam, leeftijd, gewicht, lengte, activiteitsniveau) — om je dashboard en je dagelijkse doelen te personaliseren',
    'legal.store.li2':     'Cyclus (lengte, duur menstruatie, datums) — om je huidige fase en voorspellingen te tonen',
    'legal.store.li3':     'Dagelijks logboek (voeding, water, slaap, beweging, symptomen, notities) — om patroon-inzichten over tijd te tonen',
    'legal.store.li4':     'Voorkeuren (thema, taal, herinneringstijd, dashboard-volgorde) — om de app-ervaring te onthouden',
    'legal.store.foot':    'Er wordt geen data naar servers gestuurd. Wij zien je gegevens niet, niemand anders ook.',

    'legal.retention.title': 'Bewaartermijn',
    'legal.retention.body':  'Je gegevens blijven bewaard zolang jij Paced gebruikt en je profiel niet wist. Er is geen automatische verwijdering — jij beslist. We adviseren om minimaal eens per jaar te kijken of je nog alle gelogde data nodig hebt en wat ouder is te exporteren of te wissen. Volledig wissen kan op elk moment via Instellingen → Alle gegevens wissen.',

    'legal.dont.title':    'Wat we niet doen',
    'legal.dont.li1':      '✗ Geen accounts, geen inlog, geen wachtwoorden',
    'legal.dont.li2':      '✗ Geen tracking-cookies of -pixels',
    'legal.dont.li3':      '✗ Geen analytics-diensten (geen Google Analytics, geen Plausible, geen Mixpanel)',
    'legal.dont.li4':      '✗ Geen advertenties',
    'legal.dont.li5':      '✗ Geen verkoop, verhuur of delen van data met derden voor marketing',
    'legal.dont.li6':      '✗ Geen synchronisatie tussen apparaten (data blijft op dit apparaat)',

    'legal.hosting.title': 'Hosting & infrastructuur',
    'legal.hosting.body':  'Paced wordt gehost op Cloudflare Pages (Cloudflare Inc., met EU-vestiging Cloudflare Germany GmbH). Cloudflare verwerkt voor ons als verwerker beperkte technische verbindingsgegevens (IP-adres, User-Agent, request-tijdstip) om de website te kunnen serveren en beschermen tegen aanvallen. Deze verwerking is gebaseerd op een verwerkersovereenkomst (Cloudflare DPA) en, waar van toepassing, op het EU-US Data Privacy Framework. Cloudflare-edges kunnen wereldwijd staan; de routering kiest doorgaans een EU-locatie. Paced zelf bewaart geen serverlogs en heeft geen toegang tot je IP-adres.',

    'legal.ext.title':     'Externe diensten in de app',
    'legal.ext.body':      "De productieversie van Paced laadt geen externe scripts, lettertypes of CDN's tijdens gebruik. Alle code, stijlen en lettertypes worden samen met de app meegestuurd en vanuit dezelfde host geserveerd. Tijdens het bezoeken van Paced wordt dus alleen verbinding gemaakt met de Paced-host zelf — niet met Google, Facebook of andere derde partijen.",

    'legal.cookies.title': 'Cookies & opslag',
    'legal.cookies.body':  'Paced plaatst geen cookies. We gebruiken uitsluitend de lokale opslag van je browser (localStorage) en alleen voor strikt-functionele doeleinden die nodig zijn om de app te laten werken (je profiel, je logs, je voorkeuren). Op grond van art. 11.7a lid 3(b) Telecommunicatiewet is hiervoor geen aparte toestemming vereist. Voor de verwerking van je gezondheidsgegevens binnen die opslag vragen we wel afzonderlijk toestemming (AVG art. 9) bij de eerste start.',

    'legal.export.title':  'Wat gebeurt er bij export',
    'legal.export.body':   'Je kunt je gegevens exporteren via Instellingen — CSV (laatste 90 dagen, voor je arts), Apple Health (XML, importeerbaar in iOS), of volledige JSON. Een export verlaat je apparaat alleen op jouw initiatief. Zodra je een export deelt, beheert de ontvangende app of persoon de gegevens; Paced kan na export niet meer terugzien of beïnvloeden wat ermee gebeurt.',

    'legal.rights.title':  'Jouw rechten (AVG / GDPR)',
    'legal.rights.intro':  'Onder de Europese privacywet heb je recht op inzage, correctie, verwijdering en data-portabiliteit. Omdat alle data alleen op dit apparaat staat, heb je dit volledig zelf in handen:',
    'legal.rights.li1':    'Inzage en correctie: open Instellingen om alles te zien en aan te passen',
    'legal.rights.li2':    'Data-portabiliteit: Instellingen → Exporteren (CSV, Apple Health XML, volledige JSON)',
    'legal.rights.li3':    'Verwijdering: Instellingen → Alle gegevens wissen — verwijdert profiel, logs en voorkeuren in één keer',
    'legal.rights.li4':    'Intrekking toestemming: dezelfde wis-actie trekt automatisch je toestemming voor health-data verwerking in',

    'legal.foot':          'Paced · v1.4 · laatst bijgewerkt 12 mei 2026',

    /* logboek */
    'log.subtitle':       'Jouw dagboek',
    'log.title':          'Logboek',
    'log.export':         'Exporteer',
    'log.export.aria':    'Exporteer CSV',
    'log.export.foot':    'Export omvat 90 dagen',
    'log.empty.curr':     'Nog geen logs bijgehouden.',
    'log.empty.past':     'Geen logs in {month}.',
    'log.empty.hint':     'Log je eerste dag om je voortgang te zien.',
    'log.empty.cta':      'Begin met loggen',
    'log.row.cal':        'Cal.',
    'log.row.prot':       'Eiwit',
    'log.row.water':      'Water',
    'log.row.ovulation':  'Eisprong',
    'log.row.empty':      'Nog niets gelogd vandaag.',
    'log.row.startCta':   'Begin met loggen',
    'log.row.empty.past': 'Niets gelogd',
    'log.month.prev':     'Ga naar {month}',
    'log.month.next':     'Ga naar {month}',
    'log.month.disabled': 'Geen toekomstige maanden',

    /* insights / stats */
    'stats.subtitle':     'Jouw patronen',
    'stats.title':        'Inzichten',
    'stats.streak':       'Log-reeks',
    'stats.streak.curr':  'Huidig (dagen)',
    'stats.streak.best':  'Record',
    'stats.streak.empty': 'Log vandaag iets om je reeks te starten — zelfs een stemmingscheck telt mee.',
    'stats.badges':       'Mijlpalen',
    'stats.badges.count': '{n} van {total}',
    'stats.badges.earned':'behaald',
    'badge.first_log.title':  'Eerste stap',
    'badge.first_log.desc':   'Je hebt je eerste dag gelogd.',
    'badge.streak_3.title':   '3 dagen',
    'badge.streak_3.desc':    '3 dagen op rij gelogd.',
    'badge.streak_7.title':   'Een week',
    'badge.streak_7.desc':    '7 dagen op rij gelogd.',
    'badge.streak_14.title':  'Twee weken',
    'badge.streak_14.desc':   '14 dagen op rij gelogd.',
    'badge.streak_30.title':  'Een maand',
    'badge.streak_30.desc':   '30 dagen op rij gelogd.',
    'badge.streak_100.title': '100 dagen',
    'badge.streak_100.desc':  '100 dagen op rij — wat een toewijding.',
    'badge.total_50.title':   '50 dagen',
    'badge.total_50.desc':    '50 dagen in totaal gelogd.',
    'badge.total_150.title':  '150 dagen',
    'badge.total_150.desc':   '150 dagen in totaal gelogd.',
    'badge.cycles_3.title':   '3 cycli',
    'badge.cycles_3.desc':    '3 cycli bijgehouden.',
    'badge.cycles_12.title':  'Een jaar',
    'badge.cycles_12.desc':   '12 cycli bijgehouden.',
    'stats.cycle.title':  'Cyclusoverzicht',
    'stats.cycle.avg':    'Gem. cyclus (dagen)',
    'stats.cycle.count':  'Cycli bijgehouden',
    'stats.cycle.empty':  'Log je menstruatiestart op het tabblad Vandaag om cyclusstatistieken te ontgrendelen.',
    'stats.sym.title':    'Meest gelogd symptoom per fase',
    'stats.sym.tooLittle':'te weinig data',
    'stats.sym.empty':    'Log dagelijks je symptomen om patronen te ontdekken in je cyclusfasen.',
    'stats.allCharts':    'Alle grafieken',
    'stats.basis':        'Gebaseerd op de laatste 90 dagen.',

    /* charts */
    'charts.title':       'Alle grafieken',
    'charts.back.aria':   'Terug naar inzichten',
    'charts.daysFmt':     '{n} dagen',
    'charts.lutealMore':  '🧠 Je eet meer in de Luteaal fase — normaal!',
    'charts.kcal':        'Calorieën',
    'charts.protein':     'Eiwit (g)',
    'charts.sleep':       'Slaap (uur)',
    'charts.mood':        'Stemmingsfrequentie',

    /* voeding tab */
    'food.subtitle': 'Jouw fase',
    'food.title':    'Voeding',
    'food.focus':    'Nutriëntenfocus',

    /* food log */
    'food.log.title':    'Voedingslogboek vandaag',
    'food.log.addMeal':  'Maaltijd toevoegen',
    'food.log.add':      'Toevoegen',
    'food.log.remove':   'Verwijder maaltijd',
    'food.log.item':     'Maaltijd',
    'food.log.namePh':   'Naam (bijv. havermout)',
    'food.log.ofTarget': 'van {n} {unit}',

    /* crash */
    'crash.title':       'Paced is even uit balans',
    'crash.body':        'Er ging iets mis bij het tekenen van het scherm. Je gegevens zijn veilig — alles staat nog steeds lokaal op je apparaat. Probeer Paced opnieuw te laden.',
    'crash.show':        'Toon foutgegevens',
    'crash.hide':        'Verberg foutgegevens',
    'crash.copy':        'Kopieer foutgegevens',
    'crash.copied':      'Gekopieerd ✓',
    'crash.privacyNote': 'Paced stuurt nooit automatisch foutgegevens. Alleen als jij ze zelf kopieert en deelt.',

    /* undo */
    'undo.label': 'Ongedaan maken',
    'undo.aria':  'Laatste wijziging ongedaan maken',
  },

  en: {
    'common.today': 'Today',
    'common.yesterday': 'Yesterday',
    'common.tomorrow': 'Tomorrow',
    'common.soon': 'Soon',
    'common.cancel': 'Cancel',
    'common.back': 'Back',
    'common.save': 'Save',
    'common.saved': 'Saved!',
    'common.understood': 'Got it',
    'common.tryAgain': 'Try again',
    'common.installed': 'Install',
    'common.expand': 'expand',
    'common.collapse': 'collapse',
    'common.day_one': 'day',
    'common.day_other': 'days',
    'common.cycle_one': 'cycle',
    'common.cycle_other': 'cycles',
    'common.minutes': 'min',
    'common.hours': 'h',
    'common.kcal': 'kcal',
    'common.glasses': 'glasses',
    'common.glassesShort': 'gl',
    'common.gramsShort': 'g',
    'common.daysShort': 'd',
    'common.minutesShort': 'm',
    'common.of': 'of',

    'nav.home':     'Today',
    'nav.voeding':  'Food',
    'nav.logboek':  'Journal',
    'nav.stats':    'Insights',
    'nav.settings': 'Profile',
    'nav.aria':     'Main navigation',

    'dash.greeting': 'Hi {name} 👋',
    'dash.streak.aria': 'Streak',
    'dash.openSettings': 'Open settings',
    'dash.summary.aria': 'Progress today',
    'dash.summary.goodDay': '🌿 Good day!',

    'days.cycleDay': 'Day',

    'cycle.next.label': 'Next period',
    'cycle.recent.title': 'Recent cycles',
    'cycle.recent.avg': 'avg. {n} days',
    'cycle.recent.foot': 'Cycle length naturally varies — Paced uses your rhythm, not a default of 28.',
    'cycle.recent.barAria': '{len}-day cycle starting on {date}',
    'cycle.next.daysFmt': '{month} {day} · in {n} days',

    'period.logged.label': 'Period logged today',
    'period.logged.undo': 'undo',
    'period.logged.undoAria': 'Undo period log',
    'period.log.button': 'My period started today',
    'period.log.aria': 'Log that my period started today',
    'period.tracked': '{n} {label} tracked',
    'period.day':       'Day {n} of period',
    'period.startedAgo':'Started {n} days ago',
    'period.active':    'Period active',
    'period.awaiting.title':        'Has your period started?',
    'period.awaiting.due':          'Your period was expected today. Tell us when it actually starts — we follow that, even if it differs from the prediction.',
    'period.awaiting.late':         'Your period was expected {n} {label} ago. No worries — cycles vary. Tell us when it actually starts.',
    'period.awaiting.confirmToday': 'Yes, it started today',
    'period.awaiting.confirmTodayAria': 'Confirm that my period started today',
    'period.awaiting.otherDay':     'It started on another day',
    'period.awaiting.datePickLabel':'Pick your period start date',
    'period.awaiting.confirmDate':  'Confirm this date',

    'cycleRing.outOf': 'of {n}',
    'cycleRing.ovulation.aria': 'Ovulation indicator',

    'mini.kcal':  'Kcal',
    'mini.eiwit': 'Protein',
    'mini.water': 'Water',
    'mini.move':  'Move',

    'goals.title': 'Daily goals',

    'nutrition.today':   'Food today',
    'nutrition.deltaFor': '+{n} kcal for {phase}',
    'nutrition.info':    'Log your daily calories and protein here. Protein is especially important in the luteal phase to keep energy stable. Go to the Food tab for a full food log.',

    'tracker.cal':         'Calories',
    'tracker.protein':     'Protein',
    'tracker.water':       'Water',
    'tracker.water.glass': '{n} / {target} glasses',
    'tracker.water.hint':  'Each glass ≈ 250 ml · tap to fill, tap the last filled glass to clear.',
    'tracker.sleep':       'Sleep last night',
    'tracker.sleep.hint':  'Good sleep supports hormonal balance and recovery.',
    'tracker.move':        'Movement today',
    'tracker.add.aria':    'Add {inc} {unit}',
    'tracker.clear':       'clear',
    'tracker.clear.aria':  'Clear {label}',
    'tracker.input.aria':  '{label} in {unit}',
    'tracker.input.unitOnly': '{unit} entered',
    'tracker.water.aria':  'Set water to {n} glasses',
    'tracker.sleep.aria':  '{n} hours of sleep',
    'tracker.move.aria':   '{n} minutes of movement',
    'tracker.move.clearAria': 'Clear movement time',
    'tracker.move.hint.menstrual':  'A gentle walk or stretching is enough.',
    'tracker.move.hint.follicular': 'A good moment to build up intensity.',
    'tracker.move.hint.ovulatory':  'Peak energy — go for it!',
    'tracker.move.hint.luteal':     'Listen to your body; moderate is ideal.',

    'journal.title':       "Today's note",
    'journal.placeholder': 'Something you want to remember about today…',

    'symptoms.title':  'How are you feeling?',
    'symptoms.logged': 'Logged',
    'symptoms.aria':   '{label}: {n} of 5',
    'symptoms.sliderAria': '{label}: drag from 1 to 5',
    'symptoms.unset':  'not set yet',
    'symptoms.clearAria': 'Clear {label}',

    'temp.title':       'Basal temperature',
    'temp.input.aria':  'Basal temperature in degrees Celsius',
    'temp.clear.aria':  'Clear basal temperature',
    'temp.hint':        'Measure in the morning, before getting up. A sustained rise of ~0.2°C suggests ovulation.',
    'temp.empty':       'No measurements yet — log daily in the morning for a trend.',
    'temp.range':       '{shown} of {total} days',
    'temp.trend.aria':  'Basal temperature trend over {n} days',
    'temp.detected':    'Possible ovulation around {date}',
    'temp.detected.suffix': ' · based on temperature rise',

    'ovulation.title':         'Ovulation today',
    'ovulation.marked':        'Marked',
    'ovulation.felt.label':    'Felt',
    'ovulation.felt.hint':     'Twinge, slippery discharge, libido peak',
    'ovulation.fromTemp.label': 'Read from temperature',
    'ovulation.fromTemp.hint': 'Sustained rise of ~0.2°C',
    'ovulation.autoNote':      '🌿 Paced detects a temperature rise around {date}.',

    'bleeding.title':    'Bleeding details',
    'bleeding.intro':    'The smaller the details you track, the sharper the pattern Paced sees over the months.',

    'sport.title':     'Sport today',
    'sport.logged':    'Logged',
    'sport.adviceFor': 'Advice for {phase}',
    'sport.ideas':     'Ideas',
    'sport.feltHow':   'How did your movement feel?',

    'selfcare.title': 'Gentle rituals',
    'selfcare.intro': 'Five categories to choose from — no obligation, just ideas.',

    'phaseInfo.aria.button': 'Hormonal explainer for {phase}',
    'phaseInfo.aria.close':  'Close explainer',

    'gut.title': 'Gut health',
    'gut.info':  'Gut health directly influences hormone levels. Probiotics (live bacteria in yoghurt and kefir) support your gut microbiome. Fibre (vegetables, legumes) keeps digestion moving. Fermented foods add extra lactic acid bacteria.',
    'gut.count': '{n} of 3',
    'gut.probiotics.label':  'Probiotics',
    'gut.probiotics.hint':   'Yoghurt, kefir, miso…',
    'gut.fiber.label':       'Fibre-rich meal',
    'gut.fiber.hint':        'Vegetables, legumes, whole grains',
    'gut.fermented.label':   'Fermented',
    'gut.fermented.hint':    'Sauerkraut, kimchi, miso, kombucha',
    'gut.done':              'Done',

    'wellbeing.title': 'Wellbeing',
    'wellbeing.info':  'Sleep and movement directly affect your hormone balance. Aim for 7–9 hours of sleep per night. In the luteal phase, 20–30 minutes of light exercise (walking, yoga) can ease PMS symptoms. Intense exercise during menstruation can sometimes increase fatigue — listen to your body.',

    'tip.title':       'Tip of the day',
    'tip.proteinLow':  'You hit less protein yesterday{namePart} — try {target}g today.',
    'tip.hydrationLow':'You drank an average of {actual}L yesterday — try {target}L today.',
    'tip.sleepLow':    'You slept {h} hours yesterday{namePart}. Put your phone away earlier tonight and dim the screen an hour before bed.',
    'tip.moodLow':     'Your mood was low yesterday{namePart}. A short walk outside — even 10 minutes — can noticeably lift your spirits.',
    'tip.cramps':      'You had cramps yesterday{namePart}. Pull your knees to your chest and hold for 30 seconds — it stimulates the bowels and eases lower-abdominal tension.',
    'tip.movementLow': 'You moved less than your goal yesterday{namePart}. Even {min} minutes of light movement helps your energy and hormone balance.',
    'tip.dismiss.aria':'Dismiss tip',
    'insight.title':   'Daily insight',

    'week.title':    'Food this week',
    'week.last7':    'Last 7 days',
    'week.foot':     'Goals shift with your cycle — the bars measure per phase.',
    'week.bar.aria': '{label} day {n}: {pct}% of goal',
    'week.phaseStrip.aria': 'Cycle phase per day',

    /* workload card */
    'workload.title':   'Week planning',
    'workload.work':    'Work',
    'workload.sport':   'Sport',
    'workload.agenda':  'Agenda tips',

    /* personalized nutrition targets */
    'nutrition.targets.title':    'Your daily goals',
    'nutrition.targets.based':    'Based on {kg}kg, {cm}cm and {phase} phase',
    'nutrition.targets.kcal':     'kcal',
    'nutrition.targets.protein':  'protein',
    'nutrition.targets.water':    'water',
    'nutrition.targets.perMeal':  '~{g}g protein per meal (with 4 eating moments)',

    'focus.title':       'Nutrient focus',
    'focus.openVoeding': 'View recipes in Food',

    'recipes.titleFor':    'Recipes for your phase · {phase}',
    'recipes.ingredients': 'Ingredients',
    'recipes.steps':       'Method',
    'breakfast.title':     'Quick breakfast ideas',
    'breakfast.refresh':   'Other options',

    'pwa.title':     'Add Paced to home screen',
    'pwa.subtitle':  'Works offline, feels like an app.',
    'pwa.install':   'Install',
    'pwa.dismiss':   'Close install prompt',

    'reminder.title':    "Don't forget to log!",
    'reminder.subtitle': "You haven't tracked anything today yet.",
    'reminder.dismiss':  'Close reminder',

    'onb.intro.title':       "Hi, I'm Paced.",
    'onb.intro.subtitle':    'Your calm guide for cycle-aware nutrition, energy and wellbeing.',
    'onb.intro.nameLabel':   "What's your name?",
    'onb.intro.namePh':      'Your name (optional)',
    'onb.intro.cta.named':   'Nice to meet you, {name} ✓',
    'onb.intro.cta.empty':   "Let's begin",
    'onb.intro.privacy':     'Paced keeps everything strictly on your device — no accounts, no tracking.',
    'onb.intro.privacyMore': 'The full privacy statement & medical disclaimer are in Settings.',

    'onb.cycle.title.named':  '{name}, tell me about your cycle.',
    'onb.cycle.title.empty':  'Tell me about your cycle.',
    'onb.cycle.subtitle':     'This is where personalisation begins — everything flows from here.',
    'onb.cycle.lastPeriod':   'First day of last period',
    'onb.cycle.length':       'Typical cycle length',
    'onb.cycle.lengthHint':   '28 days is average — adjust to your rhythm (21–45)',
    'onb.cycle.duration':     'How long does your period last?',
    'onb.cycle.length.dec':   'Decrease cycle length',
    'onb.cycle.length.inc':   'Increase cycle length',
    'onb.cycle.dur.dec':      'Decrease period duration',
    'onb.cycle.dur.inc':      'Increase period duration',
    'onb.cycle.next':         'Next',

    'onb.body.title':       'Your body.',
    'onb.body.subtitle':    'This determines your calorie and nutrition goals. Leave blank to use the defaults.',
    'onb.body.age':         'Age',
    'onb.body.weight':      'Weight kg',
    'onb.body.height':      'Height cm',
    'onb.body.activity':    'Activity level',

    'onb.welcome.title.named': 'Welcome, {name}!',
    'onb.welcome.title.empty': 'Welcome to Paced!',
    'onb.welcome.intro':       "Here's what you'll find in the app:",
    'onb.welcome.nav.home':    'Track food, sleep and symptoms',
    'onb.welcome.nav.voeding': 'Recipes tuned to your phase',
    'onb.welcome.nav.logboek': 'Your daily history',
    'onb.welcome.nav.stats':   'Patterns in your cycle and data',
    'onb.welcome.nav.settings':'Goals, reminders and more',
    'onb.welcome.start':       'Start',

    'settings.title':            'Settings',
    'settings.profile':          'Profile',
    'settings.name':             'Name',
    'settings.namePh':           'Your name (optional)',
    'settings.age':              'Age',
    'settings.weight':           'Weight kg',
    'settings.height':           'Height cm',
    'settings.cycleLength':      'Cycle length',
    'settings.activity':         'Activity level',
    'settings.goals':            'Daily goals',
    'settings.goal.calories':    'Calories',
    'settings.goal.protein':     'Protein goal',
    'settings.goal.water':       'Water goal',
    'settings.goal.move':        'Movement goal',
    'settings.goal.sleep':       'Sleep goal',
    'settings.goal.note':        'Leave blank to use automatic goals.',
    'settings.reminders':        'Reminders',
    'settings.reminder.title':   'Daily reminder',
    'settings.reminder.sub':     'Push notification to log',
    'settings.reminder.aria':    'Enable daily reminder',
    'settings.reminder.time':    'Time',
    'settings.display':          'Display',
    'settings.theme.auto':       'Automatic',
    'settings.theme.light':      'Light',
    'settings.theme.dark':       'Dark',
    'settings.language':         'Language',
    'settings.language.nl':      'Nederlands',
    'settings.language.en':      'English',
    'settings.save':             'Save changes',
    'settings.cards.title':     'Dashboard sections',
    'settings.export':           'Export',
    'settings.export.csv':       'Export CSV (90 days)',
    'settings.export.health':    'Export to Apple Health (XML)',
    'settings.danger':           'Danger zone',
    'settings.danger.note':      'Reset profile and start over. Daily logs are kept.',
    'settings.danger.button':    'Reset profile',
    'settings.legal':            'Privacy & disclaimer',
    'settings.notif.unsupported':'Notifications are not supported in this browser',
    'settings.notif.granted':    'Notifications enabled ✓',
    'settings.notif.denied':     'Notifications blocked',
    'settings.export.empty':     'No data to export',
    'settings.validate.age':     'Age must be between 12 and 80',
    'settings.validate.weight':  'Weight must be between 30 and 250 kg',
    'settings.validate.height':  'Height must be between 120 and 220 cm',
    'settings.version':          'Paced · v1.3',

    'reset.title':   'Reset profile?',
    'reset.body':    'Are you sure? All profile data will be erased. Daily logs will be kept.',
    'reset.title':   'Erase all data?',
    'reset.body':    'This erases your profile, all daily logs and your preferences. Cannot be undone. Confirm by typing ERASE below.',
    'reset.input.placeholder': 'Type ERASE to confirm',
    'reset.input.aria': 'Type ERASE to confirm erasure',
    'reset.confirm': 'Yes, erase everything',
    'reset.cancel':  'Cancel',

    /* consent gate */
    'consent.title':       'Consent for your health data',
    'consent.intro':       'Paced processes cycle, nutrition and wellbeing data — under GDPR (art. 9) a special category that requires your explicit consent.',
    'consent.li1':         '✓ All data stays strictly on your device — no account, no server, no tracking',
    'consent.li2':         '✓ Paced is not a medical device — for diagnosis or treatment, see a doctor',
    'consent.li3':         '✓ You can withdraw consent any time by erasing your data via Settings',
    'consent.checkbox':    'I am 16 years or older and consent to the processing of my health data on this device by Paced.',
    'consent.legal.link':  'Read the full privacy & disclaimer',
    'consent.continue':    'Continue to Paced',
    'consent.continue.disabled': 'Please tick consent first',
    'consent.withdraw.banner': 'Consent for health-data processing given on {date} (version {version}).',

    /* json export */
    'settings.export.json':       'Full export (JSON, all data)',
    'settings.export.json.aria':  'Export all data as JSON file',

    /* notif explainer */
    'settings.notif.explainer':  'Paced reminds you in the evening if you haven\'t logged yet. Notifications run fully locally — no push server is used, nothing leaves your device.',

    'legal.title':         'Privacy & disclaimer',

    'legal.controller.title': 'Data controller',
    'legal.controller.body':  'Paced is published by Xaven BV (Dutch Chamber of Commerce reg. no. 42060488), established in the Netherlands. For privacy questions or a request about your rights: info@xaven.io. No Data Protection Officer (DPO) has been appointed under GDPR art. 37 — the processing is not a core activity at large scale of special-category data (all data stays on your device and is not centrally aggregated by us).',
    'legal.controller.complaint': 'Unhappy with how we handle your privacy? You have the right to lodge a complaint with the Dutch Data Protection Authority (Autoriteit Persoonsgegevens) via autoriteitpersoonsgegevens.nl, or your national equivalent.',

    'legal.basis.title':   'Legal basis (GDPR art. 6 + 9)',
    'legal.basis.body':    'Paced processes cycle, nutrition and wellbeing data. Under GDPR art. 9, health data is a special category requiring explicit consent (art. 9(2)(a)). You give that consent deliberately on first launch. You can withdraw consent at any time by erasing your data via Settings → Erase all data — all further processing then stops.',

    'legal.med.title':     'Medical disclaimer',
    'legal.med.p1':        'Paced is a tool for self-reflection and awareness — not a medical device under the EU Medical Device Regulation (2017/745). The app does not diagnose, treat, or replace a consultation with a GP, gynaecologist, dietitian or other healthcare provider.',
    'legal.med.p2':        'Calculations for cycle, fertile window, calories and protein are estimates based on general formulas. They may differ from your personal situation and are not intended as diagnosis or treatment. The calendar method is statistically ~75–80% effective; use reliable contraception if pregnancy would pose a health risk.',
    'legal.med.p3':        "If you're worried about your health, your menstrual cycle, your nutrition or your wellbeing, please contact a qualified healthcare provider.",

    'legal.store.title':   'What we store',
    'legal.store.intro':   "All data you enter into Paced stays strictly on this device, stored in your browser's local storage. Purpose per field:",
    'legal.store.li1':     'Profile (name, age, weight, height, activity level) — to personalize your dashboard and daily goals',
    'legal.store.li2':     'Cycle (length, period duration, dates) — to show your current phase and predictions',
    'legal.store.li3':     'Daily journal (food, water, sleep, movement, symptoms, notes) — to show pattern insights over time',
    'legal.store.li4':     'Preferences (theme, language, reminder time, dashboard order) — to remember the app experience',
    'legal.store.foot':    'No data is sent to any server. We do not see your data, and neither does anyone else.',

    'legal.retention.title': 'Retention period',
    'legal.retention.body':  'Your data is kept as long as you use Paced and do not erase your profile. There is no automatic deletion — you decide. We recommend reviewing at least once a year whether you still need all logged data, and exporting or erasing older entries. Full erasure is always available via Settings → Erase all data.',

    'legal.dont.title':    "What we don't do",
    'legal.dont.li1':      '✗ No accounts, no logins, no passwords',
    'legal.dont.li2':      '✗ No tracking cookies or pixels',
    'legal.dont.li3':      '✗ No analytics services (no Google Analytics, no Plausible, no Mixpanel)',
    'legal.dont.li4':      '✗ No advertising',
    'legal.dont.li5':      '✗ No selling, renting or sharing data with third parties for marketing',
    'legal.dont.li6':      '✗ No syncing across devices (data stays on this device)',

    'legal.hosting.title': 'Hosting & infrastructure',
    'legal.hosting.body':  'Paced is hosted on Cloudflare Pages (Cloudflare Inc., with EU entity Cloudflare Germany GmbH). Cloudflare processes — as our processor — limited technical connection data (IP address, User-Agent, request timestamp) needed to serve the website and protect against attacks. This is based on the Cloudflare DPA and, where applicable, the EU-US Data Privacy Framework. Cloudflare edges are global; routing usually picks an EU location. Paced itself keeps no server logs and has no access to your IP address.',

    'legal.ext.title':     'External services in the app',
    'legal.ext.body':      'The production version of Paced loads no external scripts, fonts or CDNs while you use it. All code, styles and fonts are bundled with the app and served from the same host. While visiting Paced, only Paced\'s own host is contacted — not Google, Facebook or any third party.',

    'legal.cookies.title': 'Cookies & storage',
    'legal.cookies.body':  'Paced places no cookies. We only use your browser\'s local storage and only for strictly-functional purposes needed to make the app work (your profile, your logs, your preferences). Under art. 11.7a(3)(b) of the Dutch Telecommunications Act (and EU ePrivacy Directive equivalents) this requires no separate consent banner. For the processing of your health data within that storage we do ask explicit consent (GDPR art. 9) on first launch.',

    'legal.export.title':  'What happens on export',
    'legal.export.body':   'You can export your data via Settings — CSV (last 90 days, for your doctor), Apple Health (XML, importable in iOS), or full JSON. An export leaves your device only on your initiative. Once you share an export, the receiving app or person controls the data; Paced cannot see or influence what happens to it afterwards.',

    'legal.rights.title':  'Your rights (GDPR)',
    'legal.rights.intro':  'Under EU privacy law you have the right to access, correct, erase and port your data. Because all data lives only on this device, you have full control:',
    'legal.rights.li1':    'Access and correction: open Settings to view and adjust everything',
    'legal.rights.li2':    'Data portability: Settings → Export (CSV, Apple Health XML, full JSON)',
    'legal.rights.li3':    'Erasure: Settings → Erase all data — removes profile, logs and preferences in one action',
    'legal.rights.li4':    'Withdrawal of consent: the same erasure action automatically withdraws your consent for health-data processing',

    'legal.foot':          'Paced · v1.4 · last updated 12 May 2026',

    'log.subtitle':       'Your journal',
    'log.title':          'Journal',
    'log.export':         'Export',
    'log.export.aria':    'Export CSV',
    'log.export.foot':    'Export covers 90 days',
    'log.empty.curr':     'No logs kept yet.',
    'log.empty.past':     'No logs in {month}.',
    'log.empty.hint':     'Log your first day to see your progress.',
    'log.empty.cta':      'Start logging',
    'log.row.cal':        'Cal.',
    'log.row.prot':       'Protein',
    'log.row.water':      'Water',
    'log.row.ovulation':  'Ovulation',
    'log.row.empty':      'Nothing logged today yet.',
    'log.row.startCta':   'Start logging',
    'log.row.empty.past': 'Nothing logged',
    'log.month.prev':     'Go to {month}',
    'log.month.next':     'Go to {month}',
    'log.month.disabled': 'No future months',

    'stats.subtitle':     'Your patterns',
    'stats.title':        'Insights',
    'stats.badges':       'Milestones',
    'stats.badges.count': '{n} of {total}',
    'stats.badges.earned':'earned',
    'badge.first_log.title':  'First step',
    'badge.first_log.desc':   'You logged your first day.',
    'badge.streak_3.title':   '3 days',
    'badge.streak_3.desc':    'Logged 3 days in a row.',
    'badge.streak_7.title':   'One week',
    'badge.streak_7.desc':    'Logged 7 days in a row.',
    'badge.streak_14.title':  'Two weeks',
    'badge.streak_14.desc':   'Logged 14 days in a row.',
    'badge.streak_30.title':  'One month',
    'badge.streak_30.desc':   'Logged 30 days in a row.',
    'badge.streak_100.title': '100 days',
    'badge.streak_100.desc':  '100 days in a row — real dedication.',
    'badge.total_50.title':   '50 days',
    'badge.total_50.desc':    'Logged 50 days in total.',
    'badge.total_150.title':  '150 days',
    'badge.total_150.desc':   'Logged 150 days in total.',
    'badge.cycles_3.title':   '3 cycles',
    'badge.cycles_3.desc':    'Tracked 3 cycles.',
    'badge.cycles_12.title':  'A year',
    'badge.cycles_12.desc':   'Tracked 12 cycles.',
    'stats.streak':       'Log streak',
    'stats.streak.curr':  'Current (days)',
    'stats.streak.best':  'Best',
    'stats.streak.empty': 'Log something today to start your streak — even a mood check counts.',
    'stats.cycle.title':  'Cycle overview',
    'stats.cycle.avg':    'Avg. cycle (days)',
    'stats.cycle.count':  'Cycles tracked',
    'stats.cycle.empty':  'Log your period start on the Today tab to unlock cycle stats.',
    'stats.sym.title':    'Most logged symptom per phase',
    'stats.sym.tooLittle':'too little data',
    'stats.sym.empty':    'Log your symptoms daily to discover patterns across cycle phases.',
    'stats.allCharts':    'All charts',
    'stats.basis':        'Based on the last 90 days.',

    'charts.title':       'All charts',
    'charts.back.aria':   'Back to insights',
    'charts.daysFmt':     '{n} days',
    'charts.lutealMore':  '🧠 You eat more in the luteal phase — totally normal!',
    'charts.kcal':        'Calories',
    'charts.protein':     'Protein (g)',
    'charts.sleep':       'Sleep (hours)',
    'charts.mood':        'Mood frequency',

    'food.subtitle': 'Your phase',
    'food.title':    'Food',
    'food.focus':    'Nutrient focus',

    /* food log */
    'food.log.title':    "Today's food log",
    'food.log.addMeal':  'Add meal',
    'food.log.add':      'Add',
    'food.log.remove':   'Remove meal',
    'food.log.item':     'Meal',
    'food.log.namePh':   'Name (e.g. oatmeal)',
    'food.log.ofTarget': 'of {n} {unit}',

    'crash.title':       "Paced is a bit off balance",
    'crash.body':        "Something went wrong while drawing the screen. Your data is safe — everything is still on your device. Try reloading Paced.",
    'crash.show':        'Show error details',
    'crash.hide':        'Hide error details',
    'crash.copy':        'Copy error details',
    'crash.copied':      'Copied ✓',
    'crash.privacyNote': 'Paced never automatically sends error data. Only if you copy and share it yourself.',

    'undo.label': 'Undo',
    'undo.aria':  'Undo last change',
  },
};

/* ------------------------------------------------------------------ */
/*  Pluralization helper                                               */
/* ------------------------------------------------------------------ */

function plural(locale, n, base) {
  return STRINGS[locale][`${base}_${n === 1 ? 'one' : 'other'}`] ?? STRINGS[locale][base];
}

/* ------------------------------------------------------------------ */
/*  String interpolation                                               */
/* ------------------------------------------------------------------ */

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

export function t(locale, key, vars) {
  const dict = STRINGS[locale] || STRINGS.nl;
  const raw = dict[key] ?? STRINGS.nl[key] ?? key;
  return interpolate(raw, vars);
}

/* ------------------------------------------------------------------ */
/*  React Context                                                      */
/* ------------------------------------------------------------------ */

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => detectLocale());

  // Sync <html lang>
  useEffect(() => {
    try { document.documentElement.lang = locale; } catch { /* SSR */ }
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    persistLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t:        (key, vars) => t(locale, key, vars),
    plural:   (n, base) => plural(locale, n, base),
    formatDate: (date, options) => formatDate(date, locale, options),
    shortMonth: (iso) => shortMonth(iso, locale),
    dayName:    (idx) => DAY_NAMES[locale][idx],
    monthShort: (idx) => MONTH_NAMES_SHORT[locale][idx],
    phaseMeta:  (phase) => PHASE_META_I18N[locale][phase],
    phaseHormones: (phase) => PHASE_HORMONES_I18N[locale][phase],
    phaseSports:    (phase) => PHASE_SPORTS_I18N[locale][phase],
    phaseRecipes:   (phase) => PHASE_RECIPES_I18N[locale][phase],
    phaseBreakfasts:(phase) => PHASE_BREAKFASTS_I18N[locale][phase],
    phaseWork:      (phase) => PHASE_WORK_I18N[locale][phase],
    nutrientFocus: (phase) => NUTRIENT_FOCUS_I18N[locale][phase],
    sportIntensities: () => SPORT_INTENSITIES_I18N[locale],
    activityLevels:   () => ACTIVITY_LEVELS_I18N[locale],
    activityMeta:     (id) => ACTIVITY_LEVELS_I18N[locale][id],
    symptomMeta:      () => SYMPTOM_META_I18N[locale],
    bleedingGroups:   () => BLEEDING_GROUPS_I18N[locale],
    bleedingLabel:    (id) => BLEEDING_LABELS_I18N[locale][id],
    selfcare:         () => MENSTRUAL_SELFCARE_I18N[locale],
    tips:             (phase) => TIPS_I18N[locale][phase],
  }), [locale, setLocale]);

  return React.createElement(LocaleContext.Provider, { value }, children);
}

export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useT must be used inside <LocaleProvider>');
  return ctx;
}
