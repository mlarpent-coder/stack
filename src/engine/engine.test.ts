import { describe, it, expect } from 'vitest'
import { profileRecs, reconcileItem, reconcileStack, buildPlan } from './engine'
import type { CompleteProfile } from './types'

// A neutral baseline we override per-test, so each test states only what it depends on.
const base: CompleteProfile = {
  age: '40s', sex: 'female', diet: 'omnivore', fish: '1-2', sun: '2-3',
  alcohol: 'occasional', activity: 'moderate', safety: 'no',
  goal: [], prefs: [], taking: [],
}
const p = (over: Partial<CompleteProfile>): CompleteProfile => ({ ...base, ...over })
const byId = <T extends { id: string }>(recs: T[], id: string): T | undefined => recs.find((r) => r.id === id)

describe('vitamin D', () => {
  it('is always recommended, seasonally when sun is high', () => {
    expect(byId(profileRecs(p({ sun: '6-7' })), 'vitd')?.badge).toContain('seasonal')
    expect(byId(profileRecs(p({ sun: '0-1' })), 'vitd')?.badge).not.toContain('seasonal')
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

describe('iron is a check, gated on who actually needs it', () => {
  it('flags a ferritin test for menstruating-age women', () => {
    expect(byId(profileRecs(p({ sex: 'female', age: '30s' })), 'iron')?.verdict).toBe('check')
  })
  it('does not flag iron for men', () => {
    expect(byId(profileRecs(p({ sex: 'male' })), 'iron')).toBeUndefined()
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
