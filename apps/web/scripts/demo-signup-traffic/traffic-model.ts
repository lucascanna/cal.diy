type Rng = () => number;

type LocaleProfile = {
  language: string;
  locale: string;
  timeZone: string;
  weight: number;
};

type VisitorOutcome = "success" | "taken" | "bug";

type PlannedVisitor = {
  timestamp: Date;
  locale: LocaleProfile;
  utmSource: string | null;
  outcome: VisitorOutcome;
};

type FakeUser = {
  username: string;
  email: string;
  password: string;
};

const LOCALES: readonly LocaleProfile[] = [
  { language: "en", locale: "en-US", timeZone: "America/New_York", weight: 40 },
  { language: "it", locale: "it-IT", timeZone: "Europe/Rome", weight: 20 },
  { language: "es", locale: "es-ES", timeZone: "Europe/Madrid", weight: 20 },
  { language: "de", locale: "de-DE", timeZone: "Europe/Berlin", weight: 20 },
];

const SUPPORTED_LANGUAGES = LOCALES.map((profile) => profile.language);

// The demo story: a Reddit thread brings the audience the planted bug breaks,
// so a breakdown by utm_source points at the same cause as one by language.
const REDDIT_SHARE_FAILING = 0.7;
const REDDIT_SHARE_OTHER = 0.1;
const OTHER_SOURCES: readonly { source: string | null; weight: number }[] = [
  { source: null, weight: 50 },
  { source: "google", weight: 25 },
  { source: "linkedin", weight: 15 },
  { source: "newsletter", weight: 10 },
];

// Keeps the error chart alive before the drop, as in a real signup funnel.
const BASELINE_ERROR_RATE = 0.03;
const WEEKEND_FACTOR = 0.7;
const DAILY_NOISE = 0.15;
const HOUR_WEIGHTS = [2, 1, 1, 1, 1, 2, 4, 6, 8, 9, 10, 10, 11, 12, 12, 12, 11, 10, 9, 8, 7, 5, 4, 3];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const NAMES: Record<string, { first: string[]; last: string[] }> = {
  en: {
    first: ["Emma", "Liam", "Olivia", "Noah", "Ava", "James", "Mia", "Lucas"],
    last: ["Smith", "Johnson", "Brown", "Miller", "Davis", "Wilson", "Taylor", "Clark"],
  },
  it: {
    first: ["Giulia", "Marco", "Francesca", "Luca", "Chiara", "Matteo", "Sara", "Alessandro"],
    last: ["Rossi", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno"],
  },
  es: {
    first: ["Lucía", "Mateo", "Sofía", "Hugo", "Valeria", "Pablo", "Carmen", "Javier"],
    last: ["García", "Martínez", "López", "Sánchez", "Pérez", "Gómez", "Fernández", "Ruiz"],
  },
  de: {
    first: ["Lukas", "Hannah", "Leon", "Lena", "Jonas", "Marie", "Felix", "Laura"],
    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Becker", "Wagner", "Hoffmann"],
  },
};

function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { weight: number }>(items: readonly T[], rng: Rng): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

function pickUtmSource(language: string, failingLanguages: ReadonlySet<string>, rng: Rng): string | null {
  const redditShare = failingLanguages.has(language) ? REDDIT_SHARE_FAILING : REDDIT_SHARE_OTHER;
  if (rng() < redditShare) return "reddit";
  return pickWeighted(OTHER_SOURCES, rng).source;
}

/**
 * The share of a failing-language visitor that hits the planted bug, so that
 * successful signups fall by `dropPercent` in total.
 */
function failureRate(
  dropPercent: number,
  failingLanguages: ReadonlySet<string>
): { rate: number; capped: boolean } {
  const total = LOCALES.reduce((sum, profile) => sum + profile.weight, 0);
  const failing = LOCALES.filter((profile) => failingLanguages.has(profile.language)).reduce(
    (sum, profile) => sum + profile.weight,
    0
  );
  if (failing === 0) return { rate: 0, capped: dropPercent > 0 };
  const rate = dropPercent / 100 / (failing / total);
  return { rate: Math.min(1, rate), capped: rate > 1 };
}

function planBackfill({
  end,
  days,
  perDay,
  dropStart,
  failingLanguages,
  bugRate,
  rng,
}: {
  end: Date;
  days: number;
  perDay: number;
  dropStart: Date;
  failingLanguages: ReadonlySet<string>;
  bugRate: number;
  rng: Rng;
}): PlannedVisitor[] {
  const visitors: PlannedVisitor[] = [];
  const todayStart = Math.floor(end.getTime() / DAY_MS) * DAY_MS;
  const hours = HOUR_WEIGHTS.map((weight, hour) => ({ hour, weight }));

  for (let dayIndex = days - 1; dayIndex >= 0; dayIndex--) {
    const dayStart = todayStart - dayIndex * DAY_MS;
    const weekday = new Date(dayStart).getUTCDay();
    const weekFactor = weekday === 0 || weekday === 6 ? WEEKEND_FACTOR : 1;
    const count = Math.round(perDay * weekFactor * (1 + (rng() * 2 - 1) * DAILY_NOISE));

    for (let i = 0; i < count; i++) {
      const { hour } = pickWeighted(hours, rng);
      const timestamp = new Date(dayStart + hour * HOUR_MS + Math.floor(rng() * HOUR_MS));
      // Today is partial: only the hours that already passed get visitors.
      if (timestamp > end) continue;
      const locale = pickWeighted(LOCALES, rng);
      const utmSource = pickUtmSource(locale.language, failingLanguages, rng);
      let outcome: VisitorOutcome = "success";
      if (rng() < BASELINE_ERROR_RATE) {
        outcome = "taken";
      } else if (timestamp >= dropStart && failingLanguages.has(locale.language) && rng() < bugRate) {
        outcome = "bug";
      }
      visitors.push({ timestamp, locale, utmSource, outcome });
    }
  }

  return visitors.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function createFakeUser(language: string, emailDomain: string, rng: Rng): FakeUser {
  const names = NAMES[language] ?? NAMES.en;
  const first = toSlug(pick(names.first, rng));
  const last = toSlug(pick(names.last, rng));
  const suffix = String(Math.floor(rng() * 9000) + 1000);
  const secret = Math.floor(rng() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return {
    username: `${first}${last}${suffix}`,
    email: `${first}.${last}${suffix}@${emailDomain}`,
    password: `Signup${secret}x`,
  };
}

export {
  LOCALES,
  SUPPORTED_LANGUAGES,
  createRng,
  pickWeighted,
  pickUtmSource,
  failureRate,
  planBackfill,
  createFakeUser,
};
export type { Rng, LocaleProfile, VisitorOutcome, PlannedVisitor, FakeUser };
