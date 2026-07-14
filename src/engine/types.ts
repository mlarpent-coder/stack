// The typed contract for the recommendation engine.
// Everything the UI knows about a recommendation comes through these shapes.

export type Age = 'under30' | '30s' | '40s' | '50s' | '60plus'
export type Sex = 'female' | 'male'
export type Diet = 'omnivore' | 'pescatarian' | 'vegetarian' | 'vegan'
export type Fish = 'never' | 'subweekly' | '1-2' | '3plus'
export type Sun = '0-1' | '2-3' | '4-5' | '6-7'
export type Alcohol = 'none' | 'occasional' | 'fewweekly' | 'mostdays'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'very'
export type YesNo = 'yes' | 'no'

export type Goal = 'energy' | 'sleep' | 'futurehealth' | 'skin' | 'immunity'
export type Pref = 'coffee' | 'nolarge' | 'powder'
export type SupplementId =
  | 'vitd' | 'omega3' | 'omega369' | 'b12' | 'creatine'
  | 'magnesium' | 'vitc' | 'multi' | 'iron'

/** What the assessment collects. Optional fields are the ones asked later or that can be skipped. */
export interface Profile {
  age?: Age
  sex?: Sex
  diet?: Diet
  fish?: Fish
  sun?: Sun
  alcohol?: Alcohol
  activity?: Activity
  safety?: YesNo
  goal: Goal[]
  prefs: Pref[]
  taking: SupplementId[]
}

/** A fully-answered profile — every gate answered. Produced once the assessment is complete. */
export type CompleteProfile = Required<Omit<Profile, 'goal' | 'prefs' | 'taking'>> &
  Pick<Profile, 'goal' | 'prefs' | 'taking'>

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
  buy?: string
}
