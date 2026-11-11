import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVITY_FACTORS,
  adaptiveTdee,
  explainAdaptiveTdee,
  explainKatchMcArdle,
  explainMifflinStJeor,
  explainStepsTdee,
  explainTdee,
  formatNumber,
  inchesToCm,
  katchMcArdle,
  leanBodyMass,
  mifflinStJeor,
  netKcalPerKgPerStep,
  poundsToKg,
  round,
  stepsTdee,
  tdee,
  walkingVo2,
} from '../src/index.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Reference person used on tdeesteps.com: male, 30 years, 70 kg, 175 cm.
const REF = { weightKg: 70, heightCm: 175, age: 30, sex: 'male' } as const;

describe('Mifflin-St Jeor', () => {
  it('matches the tdeesteps.com reference case: BMR 1649, TDEE 2556', () => {
    const bmr = mifflinStJeor(REF);
    assert.equal(bmr, 1648.75);
    assert.equal(round(bmr), 1649);
    assert.equal(round(tdee(bmr, 'moderate')), 2556);
  });

  it('applies the female offset', () => {
    const bmr = mifflinStJeor({ weightKg: 60, heightCm: 165, age: 40, sex: 'female' });
    assert.equal(round(bmr), 1270);
    assert.equal(round(tdee(bmr, 'moderate')), 1969);
  });

  it('differs by exactly 166 kcal between the sexes', () => {
    assert.equal(mifflinStJeor(REF) - mifflinStJeor({ ...REF, sex: 'female' }), 166);
  });

  it('rejects minors and bad input', () => {
    assert.throws(() => mifflinStJeor({ ...REF, age: 17 }), RangeError);
    assert.throws(() => mifflinStJeor({ ...REF, weightKg: 0 }), RangeError);
    assert.throws(() => mifflinStJeor({ ...REF, heightCm: Number.NaN }), RangeError);
    assert.throws(() => mifflinStJeor({ ...REF, sex: 'other' as never }), RangeError);
  });
});

describe('activity factors', () => {
  it('uses the conventional five multipliers', () => {
    assert.deepEqual(Object.values(ACTIVITY_FACTORS), [1.2, 1.375, 1.55, 1.725, 1.9]);
  });

  it('accepts a named level or a custom factor', () => {
    assert.equal(tdee(1648.75, 'sedentary'), 1648.75 * 1.2);
    assert.equal(tdee(1648.75, 1.45), 1648.75 * 1.45);
    assert.throws(() => tdee(1648.75, 'couch' as never), RangeError);
  });
});

describe('Katch-McArdle', () => {
  it('rounds only the final result', () => {
    const input = { weightKg: 70, bodyFatPercent: 20 };
    close(leanBodyMass(input), 56);
    const bmr = katchMcArdle(input);
    close(bmr, 1579.6);
    // Multiplying the rounded BMR (1580 x 1.55 = 2449) would disagree with the real result.
    assert.equal(round(tdee(bmr, 'moderate')), 2448);
  });

  it('rejects impossible body fat', () => {
    assert.throws(() => katchMcArdle({ weightKg: 70, bodyFatPercent: 100 }), RangeError);
    assert.throws(() => katchMcArdle({ weightKg: 70, bodyFatPercent: -1 }), RangeError);
  });
});

describe('steps', () => {
  it('matches the tdeesteps.com reference case: 10,000 steps at cadence 100 gives 2250', () => {
    const r = stepsTdee({ bmr: mifflinStJeor(REF), weightKg: 70, steps: 10000 });
    close(r.base, 1978.5);
    close(r.vo2, 11.252);
    close(r.perStep, 0.0003876);
    close(r.walking, 271.32);
    assert.equal(round(r.tdee), 2250);
  });

  it('costs more per step at a brisker cadence', () => {
    close(walkingVo2(80), 8.17548);
    close(walkingVo2(120), 14.92268);
    assert.ok(netKcalPerKgPerStep(80) < netKcalPerKgPerStep(100));
    assert.ok(netKcalPerKgPerStep(100) < netKcalPerKgPerStep(120));
  });

  it('is the sedentary estimate at zero steps', () => {
    const bmr = mifflinStJeor(REF);
    assert.equal(stepsTdee({ bmr, weightKg: 70, steps: 0 }).tdee, tdee(bmr, 'sedentary'));
  });
});

describe('adaptive', () => {
  it('backs out TDEE from a loss', () => {
    const r = adaptiveTdee({ intakeKcal: 2400, startKg: 70, endKg: 69.4, days: 21 });
    assert.equal(round(r.changeKg, 4), -0.6);
    assert.equal(round(r.dailyDelta, 4), -220);
    assert.equal(round(r.tdee), 2620);
  });

  it('keeps the sign for a gain and for maintenance', () => {
    assert.equal(round(adaptiveTdee({ intakeKcal: 2800, startKg: 70, endKg: 70.6, days: 21 }).tdee), 2580);
    assert.equal(adaptiveTdee({ intakeKcal: 2500, startKg: 70, endKg: 70, days: 14 }).tdee, 2500);
  });

  it('needs at least 14 days', () => {
    assert.throws(() => adaptiveTdee({ intakeKcal: 2400, startKg: 70, endKg: 69.4, days: 13 }), RangeError);
  });
});

describe('unit conversion', () => {
  it('rounds converted inputs to 2 decimals', () => {
    assert.equal(poundsToKg(154), 69.85);
    assert.equal(inchesToCm(69), 175.26);
  });
});

describe('the working, as text', () => {
  it('writes out Mifflin-St Jeor', () => {
    assert.deepEqual(explainMifflinStJeor(REF), [
      'BMR = 10w + 6.25h − 5a + 5',
      'BMR = 10 × 70 + 6.25 × 175 − 5 × 30 + 5',
      '    = 700 + 1093.75 − 150 + 5',
      '    = 1648.75 ≈ 1649 kcal/day',
    ]);
    assert.equal(explainMifflinStJeor({ ...REF, sex: 'female' })[0], 'BMR = 10w + 6.25h − 5a − 161');
  });

  it('writes out the activity step', () => {
    assert.deepEqual(explainTdee(1648.75, 'moderate'), [
      'TDEE = BMR × activity factor',
      'TDEE = 1648.75 × 1.55',
      '     = 2555.5625 ≈ 2556 kcal/day',
    ]);
  });

  it('writes out Katch-McArdle', () => {
    const lines = explainKatchMcArdle({ weightKg: 70, bodyFatPercent: 20 });
    assert.equal(lines[1], 'LBM = 70 × (1 − 20 ÷ 100) = 56 kg');
    assert.equal(lines.at(-1), '    = 1579.6 ≈ 1580 kcal/day');
  });

  it('writes out the step-count model', () => {
    const lines = explainStepsTdee({ bmr: 1648.75, weightKg: 70, steps: 10000 });
    assert.equal(lines[0], 'Base = BMR × 1.2 = 1648.75 × 1.2 = 1978.5 kcal/day');
    assert.equal(lines[6], 'Walking = 10000 × 70 × 0.0003876 = 271.32 kcal/day');
    assert.equal(lines.at(-1), '     = 2249.82 ≈ 2250 kcal/day');
  });

  it('writes out the adaptive estimate', () => {
    const lines = explainAdaptiveTdee({ intakeKcal: 2400, startKg: 70, endKg: 69.4, days: 21 });
    assert.equal(lines[1], 'Weight change = 69.4 − 70 = -0.6 kg');
    assert.equal(lines.at(-1), '     = 2620 kcal/day');
  });

  it('formats without trailing zeros or negative zero', () => {
    assert.equal(formatNumber(1.5), '1.5');
    assert.equal(formatNumber(2555.5625, 0), '2556');
    assert.equal(formatNumber(-0.00001), '0');
  });
});
