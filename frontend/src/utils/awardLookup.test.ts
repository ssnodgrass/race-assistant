import { describe, expect, it } from 'vitest';
import { AwardLookupCategory, AwardLookupRunner, getRunnerAwardStanding } from './awardLookup';

const runners: AwardLookupRunner[] = [
  { bib_number: '1', first_name: 'Overall', last_name: 'Winner', gender: 'M', age: 42, event_place: 1 },
  { bib_number: '2', first_name: 'Age', last_name: 'First', gender: 'M', age: 43, event_place: 2 },
  { bib_number: '3', first_name: 'Age', last_name: 'Second', gender: 'M', age: 41, event_place: 3 },
];

const categories: AwardLookupCategory[] = [
  { name: 'Overall Male', winners: [runners[0]] },
  { name: 'Male 40-49', winners: [runners[1]] },
];

describe('award lookup', () => {
  it('returns the category and place for an award winner', () => {
    expect(getRunnerAwardStanding(runners[1], runners, categories)).toEqual({
      category: 'Male 40-49',
      place: 1,
      isAwardWinner: true,
    });
  });

  it('ranks non-winners after runners claimed by earlier awards are removed', () => {
    expect(getRunnerAwardStanding(runners[2], runners, categories)).toEqual({
      category: 'Male 40-49',
      place: 2,
      isAwardWinner: false,
    });
  });

  it('reports the higher-priority award instead of a lower age group', () => {
    expect(getRunnerAwardStanding(runners[0], runners, categories)).toEqual({
      category: 'Overall Male',
      place: 1,
      isAwardWinner: true,
    });
  });
});
