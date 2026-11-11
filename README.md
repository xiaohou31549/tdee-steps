# tdee-steps

BMR and TDEE equations that show their working. Zero dependencies, typed, one small file.

Most calorie calculators hand back one number. This library returns the number and, if you ask, the lines
you would write when doing the sum by hand: the formula, your values substituted, each intermediate result,
and the rounded answer. It is the arithmetic behind the calculators on [tdeesteps.com](https://tdeesteps.com),
extracted so the results can be checked, tested and reused.

```
BMR = 10w + 6.25h − 5a + 5
BMR = 10 × 70 + 6.25 × 175 − 5 × 30 + 5
    = 700 + 1093.75 − 150 + 5
    = 1648.75 ≈ 1649 kcal/day
TDEE = BMR × activity factor
TDEE = 1648.75 × 1.55
     = 2555.5625 ≈ 2556 kcal/day
```

## Install

```bash
npm install tdee-steps
```

ESM only. Works in Node 18+ and in any bundler or modern browser.

## Usage

```js
import { mifflinStJeor, tdee, round, explainMifflinStJeor, explainTdee } from 'tdee-steps';

const person = { weightKg: 70, heightCm: 175, age: 30, sex: 'male' };

const bmr = mifflinStJeor(person); // 1648.75
const total = tdee(bmr, 'moderate'); // 2555.5625
round(total); // 2556

// The working, one string per line
console.log([...explainMifflinStJeor(person), ...explainTdee(bmr, 'moderate')].join('\n'));
```

Functions return unrounded numbers. Round once, at the end, with `round()` - see
[Rounding](#rounding) for why that matters.

## What is in it

### Mifflin-St Jeor

```
BMR = 10 × weight (kg) + 6.25 × height (cm) − 5 × age (years) + s
s = +5 for men, −161 for women
```

`mifflinStJeor({ weightKg, heightCm, age, sex })` returns resting energy expenditure in kcal/day.
Source: Mifflin MD, St Jeor ST, et al. *A new predictive equation for resting energy expenditure in healthy
individuals.* Am J Clin Nutr 1990;51(2):241-247. [doi:10.1093/ajcn/51.2.241](https://doi.org/10.1093/ajcn/51.2.241)

### Activity factors

```
TDEE = BMR × activity factor
```

| Key | Factor | Usual description |
|---|---|---|
| `sedentary` | 1.2 | Little or no exercise |
| `light` | 1.375 | 1-3 days a week |
| `moderate` | 1.55 | 3-5 days a week |
| `veryActive` | 1.725 | 6-7 days a week |
| `extraActive` | 1.9 | Physical job or twice-daily training |

`tdee(bmr, 'moderate')` or `tdee(bmr, 1.45)` for a custom factor. The table is exported as `ACTIVITY_FACTORS`.
These multipliers are a convention layered on top of the resting equation; Mifflin and colleagues did not
publish them.

### Katch-McArdle (when body fat is known)

```
LBM = weight × (1 − body fat % ÷ 100)
BMR = 370 + 21.6 × LBM
```

```js
import { katchMcArdle, leanBodyMass, explainKatchMcArdle } from 'tdee-steps';

leanBodyMass({ weightKg: 70, bodyFatPercent: 20 }); // 56
katchMcArdle({ weightKg: 70, bodyFatPercent: 20 }); // 1579.6
```

### TDEE from a daily step count

```
TDEE = BMR × 1.2 + steps × weight (kg) × net energy per step
net energy per step = (VO₂ − 3.5) ÷ cadence × 0.005   kcal per kg per step
VO₂ = 1.811 + 0.02014c + 0.0007427c²                  mL/kg/min, c = cadence in steps/min
```

The VO₂ equation is the simple cadence-based metabolic equation from Moore, Aguiar, Ducharme & Tudor-Locke,
Med Sci Sports Exerc 2021;53(1):165-173. Resting uptake (3.5 mL/kg/min) is subtracted so only the cost of
the walking itself is added to the sedentary baseline.

```js
import { mifflinStJeor, stepsTdee, explainStepsTdee } from 'tdee-steps';

const bmr = mifflinStJeor({ weightKg: 70, heightCm: 175, age: 30, sex: 'male' });
stepsTdee({ bmr, weightKg: 70, steps: 10000 });
// { base: 1978.5, vo2: 11.252, perStep: 0.0003876, walking: 271.32, tdee: 2249.82 }   (to floating-point precision)
```

`cadence` defaults to 100 steps/min; 80 and 120 are reasonable values for a slow and a brisk walk.
Energy that does not show up as steps - strength training, cycling, swimming - is not counted.

### Adaptive estimate from logged data

```
TDEE = average intake − weight change (kg) × 7700 ÷ days
```

```js
import { adaptiveTdee } from 'tdee-steps';

adaptiveTdee({ intakeKcal: 2400, startKg: 70, endKg: 69.4, days: 21 });
// { changeKg: -0.6, dailyDelta: -220, tdee: 2620 }   (to floating-point precision)
```

Requires at least 14 days; shorter logs are mostly water-weight noise. 7700 kcal/kg is the commonly used
energy density of body-mass change and is itself an approximation.

### The working, as text

Every model has an `explain…` counterpart that returns `string[]`:
`explainMifflinStJeor`, `explainTdee`, `explainKatchMcArdle`, `explainStepsTdee`, `explainAdaptiveTdee`.

### Helpers

- `round(value, digits = 0)` and `formatNumber(value, digits = 4)`
- `poundsToKg(lb)` and `inchesToCm(inches)` - both round to 2 decimals, and that rounded value is what goes
  into the equation, so the working you print matches the result you get
- Constants: `ACTIVITY_FACTORS`, `LB_PER_KG`, `CM_PER_INCH`, `KCAL_PER_KG`, `MIN_ADULT_AGE`,
  `MIN_ADAPTIVE_DAYS`, `SEDENTARY_FACTOR`, `RESTING_VO2`, `KCAL_PER_ML_O2`, `DEFAULT_CADENCE`

## Rounding

Intermediate values are never rounded. With Katch-McArdle at 70 kg and 20 % body fat, BMR is 1579.6.
Multiply that by 1.55 and you get 2448.38, which rounds to 2448. Round the BMR to 1580 first and you get
2449. One kilocalorie does not matter to anyone's day, but it is the reason two calculators using the same
formula can disagree, and it makes results impossible to verify by hand.

## Reference values

The test suite pins these, and the live calculators produce the same figures:

| Input | Result |
|---|---|
| Male, 30 y, 70 kg, 175 cm | BMR 1648.75 → 1649 |
| …moderately active (×1.55) | TDEE 2555.5625 → 2556 |
| …10,000 steps/day at cadence 100 | TDEE 2249.82 → 2250 |
| 70 kg, 20 % body fat, moderately active | BMR 1579.6, TDEE 2448 |
| 2400 kcal/day, 70 → 69.4 kg over 21 days | TDEE 2620 |

## Scope

These are population equations for adults. `mifflinStJeor` throws a `RangeError` for ages under 18, and
none of the models apply during pregnancy or breastfeeding. The output is an estimate of energy
expenditure, not dietary or medical advice.

## Development

```bash
npm install
npm test        # node --test, needs Node 22.18+ (runs the TypeScript directly)
npm run build   # emits dist/
```

## License

MIT
