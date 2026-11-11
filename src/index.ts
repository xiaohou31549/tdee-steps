// BMR and TDEE equations with the working shown.
// The same arithmetic runs the calculators on https://tdeesteps.com - zero dependencies.

export type Sex = 'male' | 'female';

/** The five activity multipliers conventionally applied to a resting estimate. */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  veryActive: 1.725,
  extraActive: 1.9,
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;

export const LB_PER_KG = 2.20462;
export const CM_PER_INCH = 2.54;
/** Commonly used energy density of body mass change, kcal per kg. */
export const KCAL_PER_KG = 7700;
/** Shorter logs are dominated by water-weight noise. */
export const MIN_ADAPTIVE_DAYS = 14;
/** Mifflin-St Jeor and Katch-McArdle are adult equations. */
export const MIN_ADULT_AGE = 18;
/** Activity factor for daily living without deliberate walking; steps are added on top of it. */
export const SEDENTARY_FACTOR = 1.2;
/** Resting oxygen uptake (1 MET) in mL/kg/min, subtracted so only the cost of walking itself is counted. */
export const RESTING_VO2 = 3.5;
/** Standard approximation: 1 L of oxygen is about 5 kcal. */
export const KCAL_PER_ML_O2 = 0.005;
/** Cadence (steps/min) used when none is given; the usual moderate-intensity threshold. */
export const DEFAULT_CADENCE = 100;

export interface MifflinInput {
  weightKg: number;
  heightCm: number;
  /** Years. Must be at least 18. */
  age: number;
  sex: Sex;
}

export interface KatchMcArdleInput {
  weightKg: number;
  /** 0-100, e.g. 20 for 20 %. */
  bodyFatPercent: number;
}

export interface StepsInput {
  /** Resting estimate in kcal/day, e.g. from `mifflinStJeor`. */
  bmr: number;
  weightKg: number;
  /** Average steps per day. */
  steps: number;
  /** Walking cadence in steps/min. Defaults to 100. */
  cadence?: number;
}

export interface AdaptiveInput {
  /** Average logged intake, kcal/day. */
  intakeKcal: number;
  startKg: number;
  endKg: number;
  /** Length of the log. Must be at least 14. */
  days: number;
}

function positive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}`);
  }
}

/** Rounds half up to `digits` decimals. Only final results should be rounded, never intermediate ones. */
export function round(value: number, digits = 0): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

/** Pounds to kilograms, rounded to 2 decimals - the value the calculators on tdeesteps.com carry forward. */
export function poundsToKg(lb: number): number {
  return round(lb / LB_PER_KG, 2);
}

/** Inches to centimetres, rounded to 2 decimals. */
export function inchesToCm(inches: number): number {
  return round(inches * CM_PER_INCH, 2);
}

/**
 * Mifflin-St Jeor resting energy expenditure, kcal/day:
 * BMR = 10w + 6.25h - 5a + s, where s = +5 for men and -161 for women.
 * Mifflin et al., Am J Clin Nutr 1990;51(2):241-247. Not rounded.
 */
export function mifflinStJeor({ weightKg, heightCm, age, sex }: MifflinInput): number {
  positive('weightKg', weightKg);
  positive('heightCm', heightCm);
  positive('age', age);
  if (age < MIN_ADULT_AGE) {
    throw new RangeError(`Mifflin-St Jeor is an adult equation: age must be at least ${MIN_ADULT_AGE}, got ${age}`);
  }
  if (sex !== 'male' && sex !== 'female') {
    throw new RangeError(`sex must be 'male' or 'female', got ${String(sex)}`);
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/** Lean body mass in kg: weight x (1 - body fat % / 100). */
export function leanBodyMass({ weightKg, bodyFatPercent }: KatchMcArdleInput): number {
  positive('weightKg', weightKg);
  if (!Number.isFinite(bodyFatPercent) || bodyFatPercent < 0 || bodyFatPercent >= 100) {
    throw new RangeError(`bodyFatPercent must be between 0 and 100, got ${bodyFatPercent}`);
  }
  return weightKg * (1 - bodyFatPercent / 100);
}

/** Katch-McArdle resting energy expenditure, kcal/day: BMR = 370 + 21.6 x lean body mass (kg). Not rounded. */
export function katchMcArdle(input: KatchMcArdleInput): number {
  return 370 + 21.6 * leanBodyMass(input);
}

/** The multiplier for a named activity level, or the number itself if a custom factor is passed. */
export function activityFactor(activity: ActivityLevel | number): number {
  const factor = typeof activity === 'number' ? activity : ACTIVITY_FACTORS[activity];
  if (factor === undefined) throw new RangeError(`unknown activity level: ${String(activity)}`);
  positive('activity factor', factor);
  return factor;
}

/** TDEE = BMR x activity factor. Pass the unrounded BMR. Not rounded. */
export function tdee(bmr: number, activity: ActivityLevel | number): number {
  positive('bmr', bmr);
  return bmr * activityFactor(activity);
}

/**
 * Oxygen uptake while walking at a given cadence, mL/kg/min:
 * VO2 = 1.811 + 0.02014c + 0.0007427c^2.
 * Simple cadence-based metabolic equation from Moore, Aguiar, Ducharme & Tudor-Locke,
 * Med Sci Sports Exerc 2021;53(1):165-173.
 */
export function walkingVo2(cadence: number): number {
  positive('cadence', cadence);
  return 1.811 + 0.02014 * cadence + 7.427e-4 * cadence ** 2;
}

/** Net energy of one step above rest, kcal per kg of body weight. */
export function netKcalPerKgPerStep(cadence: number): number {
  return ((walkingVo2(cadence) - RESTING_VO2) / cadence) * KCAL_PER_ML_O2;
}

export interface StepsResult {
  /** BMR x 1.2: the day without deliberate walking. */
  base: number;
  /** Oxygen uptake at the chosen cadence, mL/kg/min. */
  vo2: number;
  /** Net kcal per kg per step. */
  perStep: number;
  /** Energy spent on the steps themselves, kcal/day. */
  walking: number;
  tdee: number;
}

/**
 * TDEE from a daily step count: BMR x 1.2 + steps x weight x net energy per step.
 * Energy that does not show up as steps (strength training, cycling, swimming) is not counted.
 */
export function stepsTdee({ bmr, weightKg, steps, cadence = DEFAULT_CADENCE }: StepsInput): StepsResult {
  positive('bmr', bmr);
  positive('weightKg', weightKg);
  if (!Number.isFinite(steps) || steps < 0) throw new RangeError(`steps must be zero or more, got ${steps}`);
  const base = bmr * SEDENTARY_FACTOR;
  const vo2 = walkingVo2(cadence);
  const perStep = netKcalPerKgPerStep(cadence);
  const walking = steps * weightKg * perStep;
  return { base, vo2, perStep, walking, tdee: base + walking };
}

export interface AdaptiveResult {
  /** endKg - startKg; negative for a loss. */
  changeKg: number;
  /** Daily energy stored (+) or drawn from the body (-), kcal/day. */
  dailyDelta: number;
  tdee: number;
}

/**
 * Backs TDEE out of logged data: TDEE = average intake - weight change (kg) x 7700 / days.
 * Needs at least 14 days of data.
 */
export function adaptiveTdee({ intakeKcal, startKg, endKg, days }: AdaptiveInput): AdaptiveResult {
  positive('intakeKcal', intakeKcal);
  positive('startKg', startKg);
  positive('endKg', endKg);
  if (!Number.isFinite(days) || days < MIN_ADAPTIVE_DAYS) {
    throw new RangeError(`days must be at least ${MIN_ADAPTIVE_DAYS}, got ${days}`);
  }
  const changeKg = endKg - startKg;
  const dailyDelta = (changeKg * KCAL_PER_KG) / days;
  return { changeKg, dailyDelta, tdee: intakeKcal - dailyDelta };
}

// ---------------------------------------------------------------------------------------------------------
// The working, as text. Each function returns the lines a person would write when doing the sum by hand:
// the formula, the values substituted, the intermediate results, and the rounded answer.

/** Shows a number with at most `digits` decimals and no trailing zeros. */
export function formatNumber(value: number, digits = 4): string {
  const r = round(value, digits);
  return String(Object.is(r, -0) ? 0 : r);
}

const f = formatNumber;

/** "= 1649" when the whole number is exact, "= 1648.75 ≈ 1649" when it was rounded. */
function result(value: number, unit: string): string {
  const whole = f(value, 0);
  const shown = f(value);
  return shown === whole ? `= ${whole} ${unit}` : `= ${shown} ≈ ${whole} ${unit}`;
}

export function explainMifflinStJeor(input: MifflinInput): string[] {
  const bmr = mifflinStJeor(input);
  const { weightKg: w, heightCm: h, age: a, sex } = input;
  const s = sex === 'male' ? '+ 5' : '− 161';
  return [
    `BMR = 10w + 6.25h − 5a ${s}`,
    `BMR = 10 × ${f(w)} + 6.25 × ${f(h)} − 5 × ${f(a)} ${s}`,
    `    = ${f(10 * w)} + ${f(6.25 * h)} − ${f(5 * a)} ${s}`,
    `    ${result(bmr, 'kcal/day')}`,
  ];
}

export function explainKatchMcArdle(input: KatchMcArdleInput): string[] {
  const lbm = leanBodyMass(input);
  const bmr = katchMcArdle(input);
  const { weightKg: w, bodyFatPercent: bf } = input;
  return [
    'LBM = weight × (1 − body fat % ÷ 100)',
    `LBM = ${f(w)} × (1 − ${f(bf)} ÷ 100) = ${f(lbm)} kg`,
    'BMR = 370 + 21.6 × LBM',
    `BMR = 370 + 21.6 × ${f(lbm)}`,
    `    = 370 + ${f(21.6 * lbm)}`,
    `    ${result(bmr, 'kcal/day')}`,
  ];
}

export function explainTdee(bmr: number, activity: ActivityLevel | number): string[] {
  const factor = activityFactor(activity);
  return [
    'TDEE = BMR × activity factor',
    `TDEE = ${f(bmr)} × ${f(factor)}`,
    `     ${result(tdee(bmr, activity), 'kcal/day')}`,
  ];
}

export function explainStepsTdee(input: StepsInput): string[] {
  const r = stepsTdee(input);
  const c = input.cadence ?? DEFAULT_CADENCE;
  return [
    `Base = BMR × ${SEDENTARY_FACTOR} = ${f(input.bmr)} × ${SEDENTARY_FACTOR} = ${f(r.base)} kcal/day`,
    'VO₂ = 1.811 + 0.02014c + 0.0007427c²',
    `VO₂ = 1.811 + 0.02014 × ${f(c)} + 0.0007427 × ${f(c)}² = ${f(r.vo2)} mL/kg/min`,
    `Net energy per step = (VO₂ − ${RESTING_VO2}) ÷ c × ${KCAL_PER_ML_O2}`,
    `                    = (${f(r.vo2)} − ${RESTING_VO2}) ÷ ${f(c)} × ${KCAL_PER_ML_O2} = ${f(r.perStep, 7)} kcal/kg/step`,
    'Walking = steps × weight × net energy per step',
    `Walking = ${f(input.steps)} × ${f(input.weightKg)} × ${f(r.perStep, 7)} = ${f(r.walking)} kcal/day`,
    'TDEE = Base + Walking',
    `TDEE = ${f(r.base)} + ${f(r.walking)}`,
    `     ${result(r.tdee, 'kcal/day')}`,
  ];
}

export function explainAdaptiveTdee(input: AdaptiveInput): string[] {
  const r = adaptiveTdee(input);
  return [
    `TDEE = average intake − weight change × ${KCAL_PER_KG} ÷ days`,
    `Weight change = ${f(input.endKg)} − ${f(input.startKg)} = ${f(r.changeKg)} kg`,
    `Daily balance = ${f(r.changeKg)} × ${KCAL_PER_KG} ÷ ${f(input.days)} = ${f(r.dailyDelta)} kcal/day`,
    `TDEE = ${f(input.intakeKcal)} − (${f(r.dailyDelta)})`,
    `     ${result(r.tdee, 'kcal/day')}`,
  ];
}
