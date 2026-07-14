// The typed contract for the recommendation engine.
// Everything the UI knows about a recommendation comes through these shapes.

export type Age = 'under30' | '30s' | '40s' | '50s' | '60plus'
export type Sex = 'female' | 'male'
export type Diet = 'omnivore' | 'pescatarian' | 'vegetarian' | 'vegan'
export type Fish = 'never' | 'subweekly' | '1-2' | '3plus'
export type Sun = '0-1' | '2-3' | '4-5' | '6-7'
export type Latitude = 'high' | 'mid' | 'low' // how far from the equator — drives winter vitamin D
export type Alcohol = 'none' | 'occasional' | 'fewweekly' | 'mostdays'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'very'
export type Sleep = 'good' | 'patchy' | 'poor'
export type Periods = 'regular' | 'light' | 'none'
export type YesNo = 'yes' | 'no'

export type Goal = 'energy' | 'sleep' | 'futurehealth' | 'skin' | 'immunity'
export type Pref = 'coffee' | 'nolarge' | 'powder'
export type Pregnancy = 'no' | 'trying' | 'pregnant'
/** The medication/condition flags that genuinely change a supplement recommendation. */
export type Condition = 'kidney' | 'bloodthinners' | 'ironoverload' | 'thyroidmeds' | 'other' | 'none'
export type SupplementId =
  | 'vitd' | 'omega3' | 'omega369' | 'b12' | 'creatine'
  | 'magnesium' | 'vitc' | 'multi' | 'iron' | 'folate'

/** The four blood markers that actually change a supplement recommendation.
 *  Stored in canonical UK units; the parser + confirm step normalise to these. */
export interface BloodMarkers {
  vitD?: number     // 25-OH-D, nmol/L
  ferritin?: number // µg/L
  b12?: number      // serum B12, ng/L
  folate?: number   // serum folate, µg/L
}

/** What the assessment collects. Optional fields are the ones asked later or that can be skipped. */
export interface Profile {
  age?: Age
  sex?: Sex
  diet?: Diet
  fish?: Fish
  sun?: Sun
  latitude?: Latitude
  alcohol?: Alcohol
  activity?: Activity
  sleep?: Sleep
  periods?: Periods // only relevant when sex === 'female'
  pregnancy?: Pregnancy // only relevant when sex === 'female'
  goal: Goal[]
  prefs: Pref[]
  conditions: Condition[] // medications/conditions that gate recommendations
  taking: SupplementId[]
  blood?: BloodMarkers
}

/** A fully-answered profile — every gate answered. Produced once the assessment is complete. */
export type CompleteProfile =
  Required<Omit<Profile, 'goal' | 'prefs' | 'taking' | 'conditions' | 'blood' | 'sleep' | 'periods' | 'pregnancy'>> &
  Pick<Profile, 'goal' | 'prefs' | 'taking' | 'conditions' | 'blood' | 'sleep' | 'periods' | 'pregnancy'>

/** Recommendation verdicts. Profile-derived recs use add/essential/consider/check;
 *  reconcile verdicts use keep/drop/adjust/check. */
export type Verdict =
  | 'add' | 'essential' | 'consider' | 'check' // profile recommendations
  | 'keep' | 'drop' | 'adjust'                 // reconciling the current stack

export type Evidence = 'strong' | 'mod'

export interface Source {
  label: string
  url: string
}

/** A profile-derived recommendation shown on the report screen. */
export interface Rec {
  id: SupplementId
  name: string
  verdict: Verdict
  badge: string
  why: string
  evidence?: Evidence
  science?: string
  sources?: Source[]
}

/** A verdict on something the user already takes, shown on the reconcile/plan screens. */
export interface ReconItem {
  id: SupplementId
  name: string
  verdict: Verdict
  why: string
}

/** Ordered how-to protocol for a supplement worth adding. */
export interface HowTo {
  fields: Array<{ k: string; v: string }>
  buy?: string          // merit-based guidance on what to look for
  links?: Source[]       // reputable retailers, chosen on merit — never commission
}
