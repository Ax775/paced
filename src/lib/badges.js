/**
 * badges.js — Pure gamification engine for Paced.
 *
 * Badges reward consistency: logging streaks, total days logged, and
 * cycles tracked. This module is intentionally free of i18n and React —
 * it only knows ids, metrics, thresholds, and whether a badge is earned.
 * The UI maps `id` → localized title/description via the `badge.<id>.*`
 * i18n keys.
 *
 * Metrics (all monotonic, so a badge is never *lost* once earned):
 *   - streak  : the user's best consecutive-day logging run
 *   - total   : total number of days ever logged (within the scan window)
 *   - cycles  : number of period-cycles tracked (logged period starts)
 */

/**
 * Ordered badge catalogue. `icon` is a presentational emoji; the real
 * title/description live under i18n keys `badge.<id>.title` /
 * `badge.<id>.desc`. Keep this list ordered by metric then threshold so
 * the UI renders a sensible progression.
 */
export const BADGES = [
  // First steps
  { id: 'first_log',  icon: '🌷', metric: 'total',  threshold: 1   },
  // Streak ladder
  { id: 'streak_3',   icon: '🌱', metric: 'streak', threshold: 3   },
  { id: 'streak_7',   icon: '🌿', metric: 'streak', threshold: 7   },
  { id: 'streak_14',  icon: '🍀', metric: 'streak', threshold: 14  },
  { id: 'streak_30',  icon: '🌳', metric: 'streak', threshold: 30  },
  { id: 'streak_100', icon: '🏵️', metric: 'streak', threshold: 100 },
  // Total-days ladder
  { id: 'total_50',   icon: '📖', metric: 'total',  threshold: 50  },
  { id: 'total_150',  icon: '💎', metric: 'total',  threshold: 150 },
  // Cycle tracking
  { id: 'cycles_3',   icon: '🌙', metric: 'cycles', threshold: 3   },
  { id: 'cycles_12',  icon: '🌕', metric: 'cycles', threshold: 12  },
];

/**
 * Compute earned/locked state + progress for every badge.
 *
 * @param {object} stats
 * @param {number} [stats.streak] — best consecutive-day run
 * @param {number} [stats.total]  — total days logged
 * @param {number} [stats.cycles] — cycles tracked
 * @returns {Array<{id,icon,metric,threshold,current,earned,progress}>}
 *          progress is clamped 0..1.
 */
export function computeBadges(stats = {}) {
  const value = (metric) => {
    const v = Number(stats[metric]);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  return BADGES.map((b) => {
    const current = value(b.metric);
    const earned = current >= b.threshold;
    const progress = b.threshold > 0
      ? Math.min(1, current / b.threshold)
      : 0;
    return { ...b, current, earned, progress };
  });
}

/** Convenience: how many badges are earned for the given stats. */
export function countEarnedBadges(stats = {}) {
  return computeBadges(stats).filter((b) => b.earned).length;
}

/**
 * The next not-yet-earned badge (the one closest to completion by
 * progress), or null if everything is unlocked. Handy for a "next goal"
 * nudge in the UI.
 */
export function nextBadge(stats = {}) {
  const locked = computeBadges(stats).filter((b) => !b.earned);
  if (!locked.length) return null;
  locked.sort((a, b) => b.progress - a.progress);
  return locked[0];
}
