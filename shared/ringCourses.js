/** Named courses — ring routes or collect goals + medal thresholds (ms). */

export const COURSE_DEFS = {
  figure_eight: {
    id: 'figure_eight',
    name: 'Figure-eight',
    kind: 'rings',
    blurb: 'Cross the basin twice through opposite rings.',
    medalTimes: { gold: 45000, silver: 70000, bronze: 110000 },
  },
  island_hop: {
    id: 'island_hop',
    name: 'Island hop',
    kind: 'rings',
    blurb: 'Outer → mid → near the center fountain.',
    medalTimes: { gold: 40000, silver: 65000, bronze: 100000 },
  },
  rim_run: {
    id: 'rim_run',
    name: 'Rim run',
    kind: 'rings',
    blurb: 'Three rings along one arc of the fountain.',
    medalTimes: { gold: 35000, silver: 55000, bronze: 90000 },
  },
  get_the_ducks: {
    id: 'get_the_ducks',
    name: 'Get the Ducks!',
    kind: 'ducks',
    blurb: 'Sail over every duck on the lake — any order.',
    medalTimes: { gold: 70000, silver: 110000, bronze: 170000 },
  },
};

export function listCourses() {
  return Object.values(COURSE_DEFS);
}

export function isDuckCourse(courseId) {
  return COURSE_DEFS[courseId]?.kind === 'ducks';
}

export function medalForTime(courseId, timeMs) {
  const def = COURSE_DEFS[courseId];
  if (!def || !Number.isFinite(timeMs)) return null;
  const { gold, silver, bronze } = def.medalTimes;
  if (timeMs <= gold) return 'gold';
  if (timeMs <= silver) return 'silver';
  if (timeMs <= bronze) return 'bronze';
  return null;
}

/**
 * Build an ordered list of ring obstacle ids for a course from live obstacles.
 * Returns null if not enough rings.
 */
export function buildCourseOrder(obstacles, courseId) {
  const rings = (obstacles || []).filter((o) => o.type === 'ring');
  if (rings.length < 3) return null;

  if (courseId === 'figure_eight') {
    let bestA = rings[0];
    let bestB = rings[1];
    let bestDot = Infinity;
    for (let i = 0; i < rings.length; i++) {
      for (let j = i + 1; j < rings.length; j++) {
        const ax = rings[i].x;
        const ay = rings[i].y;
        const bx = rings[j].x;
        const by = rings[j].y;
        const la = Math.hypot(ax, ay) || 1;
        const lb = Math.hypot(bx, by) || 1;
        const dot = (ax * bx + ay * by) / (la * lb);
        if (dot < bestDot) {
          bestDot = dot;
          bestA = rings[i];
          bestB = rings[j];
        }
      }
    }
    return [bestA.id, bestB.id, bestA.id];
  }

  if (courseId === 'island_hop') {
    const byDist = [...rings].sort(
      (a, b) => Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y),
    );
    // Outer, mid, inner
    const outer = byDist[0];
    const mid = byDist[Math.floor(byDist.length / 2)];
    const inner = byDist[byDist.length - 1];
    const ids = [outer.id, mid.id, inner.id];
    if (new Set(ids).size < 3) {
      return byDist.slice(0, 3).map((r) => r.id);
    }
    return ids;
  }

  if (courseId === 'rim_run') {
    const byAngle = [...rings].sort(
      (a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x),
    );
    // Pick three consecutive with wrap
    let bestStart = 0;
    let bestSpan = Infinity;
    for (let i = 0; i < byAngle.length; i++) {
      const a0 = Math.atan2(byAngle[i].y, byAngle[i].x);
      const a2 = Math.atan2(
        byAngle[(i + 2) % byAngle.length].y,
        byAngle[(i + 2) % byAngle.length].x,
      );
      let span = a2 - a0;
      while (span < 0) span += Math.PI * 2;
      while (span > Math.PI * 2) span -= Math.PI * 2;
      if (span < bestSpan && span > 0.2) {
        bestSpan = span;
        bestStart = i;
      }
    }
    return [
      byAngle[bestStart].id,
      byAngle[(bestStart + 1) % byAngle.length].id,
      byAngle[(bestStart + 2) % byAngle.length].id,
    ];
  }

  return null;
}
