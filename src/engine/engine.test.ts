import { describe, it, expect } from 'vitest'
import { profileRecs, reconcileItem, reconcileStack, buildPlan } from './engine'
import { howFor } from './knowledge'
import type { CompleteProfile } from './types'

// A neutral baseline we override per-test, so each test states only what it depends on.
const base: CompleteProfile = {
  age: '40s', sex: 'female', diet: 'omnivore', fish: '1-2', sun: '2-3', latitude: 'high',
  alcohol: 'occasional', activity: 'moderate', strength: 'regular', sleep: 'good', periods: 'regular', pregnancy: 'no',
  goal: [], prefs: [], conditions: [], taking: [],
}
const p = (over: Partial<CompleteProfile>): CompleteProfile => ({ ...base, ...over })
const byId = <T extends { id: string }>(recs: T[], id: string): T | undefined => recs.find((r) => r.id === id)

describe('vitamin D depends on latitude — never assumed', () => {
  it('at high latitude: seasonal when sun is high, year-round when sun is low', () => {
    expect(byId(profileRecs(p({ latitude: 'high', sun: '6-7' })), 'vitd')?.badge).toContain('seasonal')
    expect(byId(profileRecs(p({ latitude: 'high', sun: '0-1' })), 'vitd')?.badge).not.toContain('seasonal')
  })
  it('the SAME sun-exposure gives a different answer in the tropics vs up north', () => {
    // good sun near the equator → genuinely not needed, no card
    expect(byId(profileRecs(p({ latitude: 'low', sun: '6-7' })), 'vitd')).toBeUndefined()
    // same person up north → recommended
    expect(byId(profileRecs(p({ latitude: 'high', sun: '6-7' })), 'vitd')?.verdict).toBe('add')
  })
  it('low latitude but rarely outside → still an optional nudge', () => {
    expect(byId(profileRecs(p({ latitude: 'low', sun: '0-1' })), 'vitd')?.verdict).toBe('consider')
  })
  it('does not say "UK" for someone who is not in the UK', () => {
    const rec = byId(profileRecs(p({ latitude: 'high', sun: '0-1' })), 'vitd')
    expect(rec?.why).not.toMatch(/UK/)
  })
})

describe('omega-3 turns on diet and fish intake', () => {
  it('recommends algal omega-3 for vegans', () => {
    const rec = byId(profileRecs(p({ diet: 'vegan' })), 'omega3')
    expect(rec?.verdict).toBe('add')
    expect(rec?.name).toMatch(/alga/i)
  })
  it('recommends a plain omega-3 when fish is rare', () => {
    expect(byId(profileRecs(p({ fish: 'never' })), 'omega3')?.verdict).toBe('add')
  })
  it('does NOT recommend omega-3 when someone eats oily fish 3+/week', () => {
    expect(byId(profileRecs(p({ fish: '3plus' })), 'omega3')).toBeUndefined()
  })
})

describe('B12', () => {
  it('is essential for vegans', () => {
    expect(byId(profileRecs(p({ diet: 'vegan' })), 'b12')?.verdict).toBe('essential')
  })
  it('is not surfaced for omnivores', () => {
    expect(byId(profileRecs(p({ diet: 'omnivore' })), 'b12')).toBeUndefined()
  })
})

describe('creatine — gated on resistance training, not general activity', () => {
  it('gives three genuinely distinct answers across the tiers', () => {
    // regular → confident add; occasional → softer consider; none → no card at all
    expect(byId(profileRecs(p({ strength: 'regular' })), 'creatine')?.verdict).toBe('add')
    expect(byId(profileRecs(p({ strength: 'some' })), 'creatine')?.verdict).toBe('consider')
    expect(byId(profileRecs(p({ strength: 'none' })), 'creatine')).toBeUndefined()
  })
  it('the occasional-training copy flags that consistency is what earns it', () => {
    expect(byId(profileRecs(p({ strength: 'some' })), 'creatine')?.why).toMatch(/consistent/)
  })
  it('shows NO card for someone who does no strength training, however much cardio they do', () => {
    // a very-active endurance type who never lifts → no creatine card (an aside handles it in the UI)
    expect(byId(profileRecs(p({ activity: 'very', strength: 'none' })), 'creatine')).toBeUndefined()
    expect(byId(profileRecs(p({ activity: 'sedentary', strength: 'none' })), 'creatine')).toBeUndefined()
  })
  it('reconcile keeps creatine for someone who trains, drops it for someone who doesn’t', () => {
    expect(reconcileItem(p({ strength: 'regular' }), 'creatine')?.verdict).toBe('keep')
    expect(reconcileItem(p({ strength: 'none' }), 'creatine')?.verdict).toBe('drop')
  })
})

describe('protein — weight-based, only when there is a real gap', () => {
  it('is silent unless BOTH weight and intake are given (we never guess either)', () => {
    expect(byId(profileRecs(p({ weightKg: 90, protein: undefined })), 'protein')).toBeUndefined()
    expect(byId(profileRecs(p({ weightKg: undefined, protein: 'low' })), 'protein')).toBeUndefined()
  })
  it('a heavy, very-active person eating little protein gets a strong add, with numbers', () => {
    const rec = byId(profileRecs(p({ weightKg: 90, activity: 'very', protein: 'low' })), 'protein')
    expect(rec?.verdict).toBe('add')           // 90*1.6=144 target vs ~45 intake
    expect(rec?.why).toMatch(/144 g/)
    expect(rec?.why).toMatch(/90 kg/)
  })
  it('does NOT push protein when intake already meets the target', () => {
    // 70kg sedentary → 0.8*70 = 56g target; "moderate" intake ~95g already clears it
    expect(byId(profileRecs(p({ weightKg: 70, activity: 'sedentary', age: '30s', protein: 'moderate' })), 'protein')).toBeUndefined()
  })
  it('over-50s get the higher (1.2 g/kg) target even when not very active', () => {
    const rec = byId(profileRecs(p({ weightKg: 80, age: '60plus', activity: 'light', protein: 'some' })), 'protein')
    expect(rec?.why).toMatch(/96 g/)           // 80*1.2 = 96
    expect(rec).toBeDefined()
  })
  it('a small gap stays quiet — no nagging on a few grams', () => {
    // 60kg sedentary young → 48g target; "some" intake ~70g clears it
    expect(byId(profileRecs(p({ weightKg: 60, activity: 'sedentary', age: '30s', protein: 'some' })), 'protein')).toBeUndefined()
  })
  it('vegan sees a plant-blend framing, not whey', () => {
    const rec = byId(profileRecs(p({ weightKg: 85, activity: 'very', diet: 'vegan', fish: 'never', protein: 'low' })), 'protein')
    expect(rec?.name).toMatch(/plant/i)
    expect(rec?.why).toMatch(/pea\/soy/i)
  })
  it('kidney disease flips a protein add to "check with your GP"', () => {
    const rec = byId(profileRecs(p({ weightKg: 90, activity: 'very', protein: 'low', conditions: ['kidney'] })), 'protein')
    expect(rec?.verdict).toBe('check')
    expect(rec?.why).toMatch(/kidney/i)
  })
  it('reconcile keeps a taken protein when there is a gap, drops it when there is not', () => {
    expect(reconcileItem(p({ weightKg: 90, activity: 'very', protein: 'low' }), 'protein')?.verdict).toBe('keep')
    expect(reconcileItem(p({ weightKg: 70, activity: 'sedentary', age: '30s', protein: 'moderate' }), 'protein')?.verdict).toBe('drop')
  })
})

describe('iron is a check, gated on menstrual blood loss (not age)', () => {
  it('flags a ferritin test for someone who has periods', () => {
    expect(byId(profileRecs(p({ sex: 'female', periods: 'regular' })), 'iron')?.verdict).toBe('check')
  })
  it('does NOT flag iron for a woman with no periods (e.g. continuous contraception)', () => {
    expect(byId(profileRecs(p({ sex: 'female', age: '40s', periods: 'none' })), 'iron')).toBeUndefined()
  })
  it('does not flag iron for men', () => {
    expect(byId(profileRecs(p({ sex: 'male' })), 'iron')).toBeUndefined()
  })
  it('but a low ferritin reading still flags, periods or not', () => {
    const rec = byId(profileRecs(p({ sex: 'female', periods: 'none', blood: { ferritin: 10 } })), 'iron')
    expect(rec?.verdict).toBe('check')
    expect(rec?.why).toMatch(/GP/)
  })
})

describe('sleep: honest, not an upsell', () => {
  it('poor sleep surfaces magnesium as a "consider", even for the otherwise-magnesium-free', () => {
    const rec = byId(profileRecs(p({ activity: 'sedentary', alcohol: 'none', sleep: 'poor' })), 'magnesium')
    expect(rec?.verdict).toBe('consider')
    expect(rec?.why).toMatch(/routine|daylight|caffeine/) // says the real levers aren't a pill
  })
  it('good sleep + no other driver → no magnesium at all', () => {
    expect(byId(profileRecs(p({ activity: 'sedentary', alcohol: 'none', sleep: 'good' })), 'magnesium')).toBeUndefined()
  })
})

describe('the engine tells two different people apart (the personalisation test)', () => {
  it('an active omnivore and a sedentary vegan get materially different shortlists', () => {
    const a = profileRecs(p({ activity: 'very', diet: 'omnivore', fish: '3plus' })).map((r) => r.id).sort()
    const b = profileRecs(p({ activity: 'sedentary', diet: 'vegan', fish: 'never' })).map((r) => r.id).sort()
    expect(a).not.toEqual(b)
  })
})

describe('reconciling the current stack', () => {
  it('drops vitamin C', () => {
    expect(reconcileItem(p({}), 'vitc')?.verdict).toBe('drop')
  })
  it('keeps vitamin D', () => {
    expect(reconcileItem(p({}), 'vitd')?.verdict).toBe('keep')
  })
  it('drops omega 3-6-9 entirely when fish is plentiful, else swaps it', () => {
    expect(reconcileItem(p({ fish: '3plus' }), 'omega369')?.verdict).toBe('drop')
    expect(reconcileItem(p({ fish: 'never' }), 'omega369')?.verdict).toBe('adjust')
  })
  it('keeps B12 for vegans but drops it for omnivores', () => {
    expect(reconcileItem(p({ diet: 'vegan' }), 'b12')?.verdict).toBe('keep')
    expect(reconcileItem(p({ diet: 'omnivore' }), 'b12')?.verdict).toBe('drop')
  })
})

describe('a blood result changes the answer (not just gets stored)', () => {
  it('vitamin D: a low reading forces an Add; a high reading downgrades to Optional', () => {
    const low = byId(profileRecs(p({ sun: '6-7', blood: { vitD: 18 } })), 'vitd')
    expect(low?.verdict).toBe('add')
    expect(low?.why).toContain('18')
    const high = byId(profileRecs(p({ sun: '0-1', blood: { vitD: 92 } })), 'vitd')
    // even with low sun, a sufficient reading overrides the guess
    expect(high?.verdict).toBe('consider')
  })

  it('ferritin: a healthy reading resolves iron to "fine"; a low one flags the GP', () => {
    const fine = byId(profileRecs(p({ sex: 'female', age: '30s', blood: { ferritin: 55 } })), 'iron')
    expect(fine?.verdict).toBe('keep')
    expect(fine?.badge).toMatch(/fine/i)
    const low = byId(profileRecs(p({ sex: 'female', age: '30s', blood: { ferritin: 10 } })), 'iron')
    expect(low?.verdict).toBe('check')
    expect(low?.why).toMatch(/GP/)
  })

  it('ferritin reading gives the SAME answer in the report and when reconciling a taken iron pill', () => {
    const prof = p({ sex: 'female', age: '30s', blood: { ferritin: 55 }, taking: ['iron'] })
    expect(byId(profileRecs(prof), 'iron')?.verdict).toBe('keep')
    expect(reconcileItem(prof, 'iron')?.verdict).toBe('keep')
  })

  it('a low B12 gets flagged for an omnivore who would otherwise see no B12 card', () => {
    expect(byId(profileRecs(p({ diet: 'omnivore' })), 'b12')).toBeUndefined()
    expect(byId(profileRecs(p({ diet: 'omnivore', blood: { b12: 150 } })), 'b12')?.badge).toBe('Low')
  })

  it('does not double-card B12 when a vegan already has an essential B12 rec', () => {
    const recs = profileRecs(p({ diet: 'vegan', blood: { b12: 150 } }))
    expect(recs.filter((r) => r.id === 'b12')).toHaveLength(1)
  })
})

describe('folate — the one clear-cut supplement for pregnancy/trying', () => {
  it('is essential when trying or pregnant, absent otherwise', () => {
    expect(byId(profileRecs(p({ pregnancy: 'trying' })), 'folate')?.verdict).toBe('essential')
    expect(byId(profileRecs(p({ pregnancy: 'pregnant' })), 'folate')?.verdict).toBe('essential')
    expect(byId(profileRecs(p({ pregnancy: 'no' })), 'folate')).toBeUndefined()
  })
})

describe('the safety gate actually changes recommendations, not just warns', () => {
  it('kidney disease → creatine and magnesium become "check with GP", not "add"', () => {
    const recs = profileRecs(p({ activity: 'very', conditions: ['kidney'] }))
    expect(byId(recs, 'creatine')?.verdict).toBe('check')
    expect(byId(recs, 'magnesium')?.verdict).toBe('check')
  })
  it('iron overload → iron flips to "do not take"', () => {
    const rec = byId(profileRecs(p({ periods: 'regular', conditions: ['ironoverload'] })), 'iron')
    expect(rec?.verdict).toBe('drop')
    expect(rec?.why).toMatch(/do not take/i)
  })
  it('blood thinners → omega-3 flagged to check first (bleeding risk)', () => {
    const rec = byId(profileRecs(p({ fish: 'never', conditions: ['bloodthinners'] })), 'omega3')
    expect(rec?.verdict).toBe('check')
    expect(rec?.why).toMatch(/bleeding/i)
  })
  it('thyroid meds → iron gets a 4-hour timing note', () => {
    const rec = byId(profileRecs(p({ periods: 'regular', conditions: ['thyroidmeds'] })), 'iron')
    expect(rec?.why).toMatch(/4 hours/i)
  })
  it('reconciling a taken iron pill with iron overload says stop', () => {
    const list = reconcileStack(p({ conditions: ['ironoverload'], taking: ['iron'] }))
    expect(list.find((x) => x.id === 'iron')?.verdict).toBe('drop')
  })
})

describe('buy links are present and merit-based', () => {
  it('addable supplements carry retailer links', () => {
    expect((howFor('creatine', base)?.links?.length ?? 0)).toBeGreaterThan(0)
    expect((howFor('folate', base)?.links?.length ?? 0)).toBeGreaterThan(0)
  })
})

describe('buildPlan assembles keep / drop / add correctly', () => {
  it('an omnivore taking vit C + omega-3-6-9 keeps nothing new, drops both, and gains adds', () => {
    const prof = p({ fish: '3plus', activity: 'very', taking: ['vitc', 'omega369'] })
    const recs = profileRecs(prof)
    const recon = reconcileStack(prof)
    const plan = buildPlan(prof, recs, recon)
    expect(plan.drop.map((r) => r.id).sort()).toEqual(['omega369', 'vitc'])
    // creatine is a profile add and they're not taking it → should be in adds
    expect(plan.add.some((r) => r.id === 'creatine')).toBe(true)
    // vitamin D is a profile add they're not taking → also an add
    expect(plan.add.some((r) => r.id === 'vitd')).toBe(true)
  })

  it('does not list something as an add if it is already being taken (no duplication)', () => {
    const prof = p({ taking: ['vitd'] })
    const recs = profileRecs(prof)
    const plan = buildPlan(prof, recs, reconcileStack(prof))
    expect(plan.add.some((r) => r.id === 'vitd')).toBe(false)
    expect(plan.keep.some((r) => r.id === 'vitd')).toBe(true)
  })
})
