import { describe, it, expect } from 'vitest'
import { profileRecs, reconcileItem, reconcileStack, buildPlan } from './engine'
import type { CompleteProfile } from './types'

// A neutral baseline we override per-test, so each test states only what it depends on.
const base: CompleteProfile = {
  age: '40s', sex: 'female', diet: 'omnivore', fish: '1-2', sun: '2-3', latitude: 'high',
  alcohol: 'occasional', activity: 'moderate', sleep: 'good', periods: 'regular', safety: 'no',
  goal: [], prefs: [], taking: [],
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

describe('creatine', () => {
  it('is a strong add for active people', () => {
    expect(byId(profileRecs(p({ activity: 'very' })), 'creatine')?.verdict).toBe('add')
  })
  it('drops to "consider" for the sedentary — never disappears', () => {
    expect(byId(profileRecs(p({ activity: 'sedentary' })), 'creatine')?.verdict).toBe('consider')
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
