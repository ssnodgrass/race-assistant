export interface AwardLookupRunner {
  bib_number: string;
  first_name: string;
  last_name: string;
  gender: string;
  age: number;
  event_place: number;
}

export interface AwardLookupCategory {
  name: string;
  winners: AwardLookupRunner[];
}

export interface RunnerAwardStanding {
  category: string;
  place: number;
  isAwardWinner: boolean;
}

interface AgeGroupRule {
  gender?: string;
  min: number;
  max: number;
}

function ageGroupRule(name: string): AgeGroupRule | null {
  const split = name.match(/^(Male|Female) (\d+)(?:-(\d+)|\+)$/);
  if (split) {
    return {
      gender: split[1] === 'Male' ? 'M' : 'F',
      min: Number(split[2]),
      max: split[3] ? Number(split[3]) : Number.MAX_SAFE_INTEGER,
    };
  }
  const combined = name.match(/^(\d+)(?:-(\d+)|\+)$/);
  if (!combined) return null;
  return {
    min: Number(combined[1]),
    max: combined[2] ? Number(combined[2]) : Number.MAX_SAFE_INTEGER,
  };
}

function matchesRule(runner: AwardLookupRunner, rule: AgeGroupRule): boolean {
  return (!rule.gender || runner.gender === rule.gender) && runner.age >= rule.min && runner.age <= rule.max;
}

export function getRunnerAwardStanding(
  runner: AwardLookupRunner,
  results: AwardLookupRunner[],
  categories: AwardLookupCategory[],
): RunnerAwardStanding | null {
  for (const category of categories) {
    const winnerIndex = (category.winners || []).findIndex(winner => winner.bib_number === runner.bib_number);
    if (winnerIndex >= 0) {
      return { category: category.name, place: winnerIndex + 1, isAwardWinner: true };
    }
  }

  for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
    const category = categories[categoryIndex];
    const rule = ageGroupRule(category.name);
    if (!rule || !matchesRule(runner, rule)) continue;

    const previouslyClaimed = new Set(
      categories.slice(0, categoryIndex).flatMap(previous => (previous.winners || []).map(winner => winner.bib_number)),
    );
    const eligible = results.filter(candidate => !previouslyClaimed.has(candidate.bib_number) && matchesRule(candidate, rule));
    const place = eligible.findIndex(candidate => candidate.bib_number === runner.bib_number) + 1;
    if (place > 0) return { category: category.name, place, isAwardWinner: false };
  }

  return null;
}
