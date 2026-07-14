// The rules engine. Pure functions, no DOM, no framework — which is what makes it testable
// and trustworthy. The UI only ever renders what these functions return.
//
// Two distinct phases, deliberately separate (the "assess before you disclose" principle):
//   1. profileRecs(profile)        → what's worth taking, from WHO YOU ARE alone
//   2. reconcileItem(profile, id)  → a verdict on each thing you ALREADY take
// buildPlan() then assembles keep / drop / add / check from both.

import { SRC } from './knowledge'
import type { CompleteProfile, Rec, ReconItem, SupplementId } from './types'

// ---- small, named predicates so the rules read like sentences ----
// Iron risk is driven by menstrual blood loss, NOT age — so someone with no periods
// (continuous contraception, menopause, etc.) isn't in the high-loss group.
export const menstruating = (p: CompleteProfile) =>
  p.sex === 'female' && (p.periods === 'regular' || p.periods === 'light')
export const isActive = (p: CompleteProfile) => p.activity === 'moderate' || p.activity === 'very'
export const lowSun = (p: CompleteProfile) => p.sun === '0-1' || p.sun === '2-3'
export const isPlant = (p: CompleteProfile) => p.diet === 'vegan' || p.diet === 'vegetarian'
const goalHas = (p: CompleteProfile, g: string) => p.goal.includes(g as never)

const VERDICT_ORDER: Record<string, number> = { essential: 0, add: 1, consider: 2, check: 3, keep: 4 }

/** Turn a real ferritin reading into an iron verdict. Shared by the report and the reconcile step
 *  so an uploaded blood result gives ONE consistent answer in both places. */
function ironFromBlood(fer: number): { verdict: 'check' | 'keep'; badge: string; why: string } {
  if (fer < 15) return { verdict: 'check', badge: 'Low — see your GP', why: `Your ferritin (${fer} µg/L) is low — that's iron deficiency. Worth addressing, but through your GP rather than blind supplements.` }
  if (fer < 30) return { verdict: 'check', badge: 'Borderline', why: `Your ferritin (${fer} µg/L) is on the low side — worth a word with your GP. Borderline stores, not clearly deficient.` }
  return { verdict: 'keep', badge: 'Iron looks fine', why: `Your ferritin (${fer} µg/L) is healthy — no need to supplement iron.` }
}

/** What's worth taking, derived from the profile only. Never presupposes the current stack. */
export function profileRecs(p: CompleteProfile): Rec[] {
  const r: Rec[] = []

  // --- Vitamin D: a real 25-OH-D reading beats the sun-exposure guess ---
  const d = p.blood?.vitD
  if (d != null) {
    let verdict: 'add' | 'consider' = 'add'
    let badge: string
    let why: string
    if (d < 25) { badge = "Add — you're low"; why = `Your vitamin D came back at ${d} nmol/L — below the deficiency threshold. Worth correcting properly, ideally via your GP (a short loading course, then a daily maintenance dose).` }
    else if (d < 50) { badge = 'Add'; why = `Your level (${d} nmol/L) is on the low side of normal — a daily 10–25 µg tops it up.` }
    else if (d <= 75) { verdict = 'consider'; badge = 'Optional · winter'; why = `Your level (${d} nmol/L) is adequate — no urgent need, though a low winter dose keeps it steady through the darker months.` }
    else { verdict = 'consider'; badge = "You're topped up"; why = `Your level (${d} nmol/L) is comfortably sufficient — you don't need much beyond maybe a low winter dose.` }
    r.push({
      id: 'vitd', name: 'Vitamin D', verdict, badge, why, evidence: 'strong',
      science: 'Vitamin D status is best read directly from 25-OH-D. Standard guidance treats <25 nmol/L as deficient and ~50+ as sufficient — so a reading replaces any guesswork from sun or location.',
      sources: [SRC.nhsD, SRC.vital],
    })
  } else {
    // No blood reading → estimate from latitude + sun exposure. Both are asked, neither assumed.
    if (p.latitude === 'low') {
      // Near the equator, sun usually covers it — only flag if they're rarely in it.
      if (lowSun(p)) {
        r.push({
          id: 'vitd', name: 'Vitamin D', verdict: 'consider', badge: 'Optional',
          why: "Even somewhere sunny, if you're rarely outdoors or usually covered up, a modest daily dose is worth it.",
          evidence: 'strong', science: 'Sun avoidance or covering up limits skin synthesis even at low latitudes.', sources: [SRC.nhsD],
        })
      }
      // good sun + low latitude → genuinely not needed, so no card at all
    } else {
      const seasonal = !lowSun(p)
      r.push({
        id: 'vitd', name: 'Vitamin D', verdict: 'add',
        badge: seasonal ? 'Worth taking · seasonal' : 'Worth taking',
        why: seasonal
          ? 'Worth it for the darker months — through summer, the daylight where you live likely covers you.'
          : (p.latitude === 'high'
              ? 'This far from the equator you get little winter daylight, and skin makes almost none — a daily dose is worth it, especially October to March.'
              : 'You get limited daylight and winter levels dip — worth a daily dose, especially in winter.'),
        evidence: 'strong',
        science: 'At higher latitudes skin makes negligible vitamin D in winter, so cold-season supplementation is widely advised. On breast-cancer prevention, the large VITAL trial found no significant benefit — not a reason to take high doses.',
        sources: [SRC.nhsD, SRC.vital],
      })
    }
  }

  // --- Omega-3: depends on diet and oily-fish frequency ---
  if (isPlant(p)) {
    r.push({
      id: 'omega3', name: 'Omega-3 (from algae)', verdict: 'add', badge: 'Worth taking',
      why: "Plant diets are typically low in EPA and DHA, and you're not getting them from fish — an algae-based omega-3 covers it.",
      evidence: 'mod', science: 'EPA/DHA are scarce in plant diets; algal oil is the direct vegan source.', sources: [SRC.exFish],
    })
  } else if (p.fish === 'never' || p.fish === 'subweekly') {
    r.push({
      id: 'omega3', name: 'Omega-3', verdict: 'add', badge: 'Worth taking',
      why: 'You rarely eat oily fish, so a plain omega-3 (EPA/DHA) is worth taking to fill the gap.',
      evidence: 'mod', science: 'With little dietary oily fish, EPA/DHA intake is usually low; a fish-oil or algal omega-3 fills it.', sources: [SRC.exFish],
    })
  } else if (p.fish === '1-2') {
    r.push({
      id: 'omega3', name: 'Omega-3', verdict: 'consider', badge: 'Optional',
      why: 'Borderline — one to two portions of oily fish a week is roughly enough, so this is a nice-to-have rather than a need.',
      evidence: 'mod', science: 'Around 1–2 oily-fish portions weekly approximates typical EPA/DHA targets.', sources: [SRC.exFish],
    })
  }
  // fish === '3plus' → covered by diet, nothing to recommend

  // --- B12: essential for vegans, sensible for vegetarians ---
  if (p.diet === 'vegan') {
    r.push({
      id: 'b12', name: 'Vitamin B12', verdict: 'essential', badge: 'Essential',
      why: "Non-negotiable on a vegan diet — plants don't provide B12. One of the few genuinely essential supplements for you.",
      evidence: 'strong', science: 'B12 is found almost exclusively in animal foods; vegans need a supplement or fortified foods.', sources: [SRC.nhsB12],
    })
  } else if (p.diet === 'vegetarian') {
    r.push({
      id: 'b12', name: 'Vitamin B12', verdict: 'consider', badge: 'Worth it',
      why: 'Dairy and eggs give you some, but vegetarians can run low — an inexpensive B12 is sensible insurance.',
      evidence: 'mod', science: 'Vegetarian B12 intakes are often marginal; low-dose supplementation is a reasonable safeguard.', sources: [SRC.nhsB12],
    })
  }

  // --- Creatine: strong for the active; a "consider" otherwise ---
  const femaleOlder = p.sex === 'female' && (p.age === '40s' || p.age === '50s' || p.age === '60plus')
  if (isActive(p)) {
    r.push({
      id: 'creatine', name: 'Creatine', verdict: 'add', badge: 'Worth taking',
      why:
        'One of the best-evidenced supplements for building and keeping muscle strength as you age — and promising, though less settled, for preserving bone' +
        (femaleOlder ? ', where the emerging evidence for women through perimenopause is encouraging' : '') +
        '.' +
        (goalHas(p, 'futurehealth') ? ' Given you flagged long-term health, it\'s a strong pick.' : ''),
      evidence: 'strong',
      science:
        'A 2-year RCT in 237 postmenopausal women found creatine plus resistance training preserved hip bone density better than placebo, with consistent lean-mass and strength gains in women 40+.',
      sources: [SRC.exCre],
    })
  } else {
    r.push({
      id: 'creatine', name: 'Creatine', verdict: 'consider', badge: 'Consider',
      why: 'Helps preserve muscle and bone with age — but it earns its keep most alongside some resistance training. If you add strength work, move this up.',
      evidence: 'strong', science: "Creatine's benefits are strongest paired with resistance exercise; without training the effect is smaller.", sources: [SRC.exCre],
    })
  }

  // --- Magnesium: only when training load or alcohol justifies it ---
  if (p.activity === 'very' || p.alcohol === 'mostdays') {
    const drivers =
      (p.activity === 'very' ? 'hard training ' : '') +
      (p.alcohol === 'mostdays' ? (p.activity === 'very' ? 'and regular alcohol ' : 'regular alcohol ') : '')
    r.push({
      id: 'magnesium', name: 'Magnesium', verdict: 'add', badge: 'Worth taking',
      why:
        'A sensible add — ' + drivers + "depletes it, and it's decent for sleep and recovery." +
        (goalHas(p, 'sleep') || p.sleep === 'poor' ? ' Take it in the evening — it may help your sleep, too.' : ''),
      evidence: 'mod',
      science: 'Modest but real evidence for magnesium glycinate on sleep and recovery; low intake is more common with heavy training and higher alcohol use.',
      sources: [SRC.exMag],
    })
  }

  // Poor sleep on its own: magnesium is a modest, honest add — but the real levers aren't a pill.
  if (p.sleep === 'poor' && !r.some((x) => x.id === 'magnesium')) {
    r.push({
      id: 'magnesium', name: 'Magnesium', verdict: 'consider', badge: 'Consider · sleep',
      why: "Your sleep's been rough — magnesium glycinate in the evening has modest evidence for sleep quality. Worth a try, but the bigger levers are a steady routine, morning daylight and caffeine timing, not a supplement.",
      evidence: 'mod',
      science: 'Evidence for magnesium and sleep is modest; behavioural sleep measures have larger effects.',
      sources: [SRC.exMag],
    })
  }

  // --- Iron: a real ferritin reading resolves the "get tested" into an answer ---
  const fer = p.blood?.ferritin
  if (fer != null) {
    const v = ironFromBlood(fer)
    r.push({
      id: 'iron', name: 'Iron', verdict: v.verdict, badge: v.badge, why: v.why, evidence: 'strong',
      science: 'Ferritin reflects iron stores; supplement only when low, and ideally with clinical guidance.', sources: [SRC.nhsVit],
    })
  } else if (menstruating(p)) {
    r.push({
      id: 'iron', name: 'Iron — get it checked first', verdict: 'check', badge: 'Get tested',
      why: "Because you have periods, you're in the group most likely to run low on iron — so it's worth a ferritin blood test. Never supplement iron blind; too much is harmful.",
      evidence: 'strong', science: 'Menstrual blood loss is the main driver of low iron in this group; confirm with ferritin before supplementing.', sources: [SRC.nhsVit],
    })
  }

  // --- B12: a low reading gets flagged (unless a diet-based B12 rec is already present) ---
  const b12 = p.blood?.b12
  if (b12 != null && b12 < 200 && !r.some((x) => x.id === 'b12')) {
    r.push({
      id: 'b12', name: 'Vitamin B12', verdict: 'check', badge: 'Low',
      why: `Your B12 (${b12} ng/L) is low — worth addressing, and worth your GP checking why.`,
      evidence: 'strong', science: 'Serum B12 below ~200 ng/L suggests deficiency and merits follow-up.', sources: [SRC.nhsB12],
    })
  }

  return r.sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict])
}

/** A verdict on a single supplement the user already takes. Returns null if we have no opinion. */
export function reconcileItem(p: CompleteProfile, id: SupplementId): ReconItem | null {
  switch (id) {
    case 'vitd':
      return { id, name: 'Vitamin D', verdict: 'keep', why: 'Matches the shortlist — keep it going' + (lowSun(p) ? ' year-round.' : ', at least Oct–Mar.') }
    case 'vitc':
      return {
        id, name: 'Vitamin C', verdict: 'drop',
        why: "You're already replete from food — surplus is excreted, not stored. Harmless, but inert." + (goalHas(p, 'skin') ? ' (For skin, the evidence is for topical vitamin C, not tablets.)' : ''),
      }
    case 'multi':
      return { id, name: 'Multivitamin', verdict: 'drop', why: "Insurance you don't really need if you're eating reasonably. Not harmful, just low-value — better to target the one or two things you actually need." }
    case 'omega369':
      return p.fish === '3plus'
        ? { id, name: 'Omega 3-6-9', verdict: 'drop', why: "Your fish covers the omega-3, and the 6 and 9 are filler nobody's short on." }
        : { id, name: 'Omega 3-6-9', verdict: 'adjust', why: 'Swap it for a plain omega-3 — you may want the 3, but the 6 and 9 add nothing.' }
    case 'omega3':
      return p.fish === '3plus'
        ? { id, name: 'Omega-3 / fish oil', verdict: 'drop', why: 'Eating oily fish 3+ times a week already gives you more EPA/DHA than the capsule.' }
        : { id, name: 'Omega-3 / fish oil', verdict: 'keep', why: 'Reasonable to keep — your fish intake is low enough that a top-up helps.' }
    case 'magnesium':
      return p.activity === 'very' || p.alcohol === 'mostdays'
        ? { id, name: 'Magnesium', verdict: 'keep', why: 'Earns its place given your training / alcohol — good for sleep and recovery.' }
        : { id, name: 'Magnesium', verdict: 'drop', why: 'Optional for you — fine to keep if it helps your sleep, but nothing here demands it.' }
    case 'b12':
      return isPlant(p)
        ? { id, name: 'Vitamin B12', verdict: 'keep', why: 'Keep it — essential on a plant-based diet.' }
        : { id, name: 'Vitamin B12', verdict: 'drop', why: "Eating animal products, you're almost certainly getting enough already — drop unless a test showed low." }
    case 'iron': {
      const fer = p.blood?.ferritin
      if (fer != null) { const v = ironFromBlood(fer); return { id, name: 'Iron', verdict: v.verdict, why: v.why } }
      return { id, name: 'Iron', verdict: 'check', why: "Only keep taking this if a blood test showed you're low — iron when you're replete is genuinely harmful." }
    }
    default:
      return null
  }
}

export interface Plan {
  keep: ReconItem[]
  drop: ReconItem[]     // includes 'adjust' (swap) items
  check: ReconItem[]    // things you take that need a test first
  add: Rec[]            // profile recs you're not already taking
  addCheck: Rec[]       // profile "get tested" recs you're not already taking
}

/** Assemble the final plan from the profile recs and the reconciliation of the current stack. */
export function buildPlan(p: CompleteProfile, recs: Rec[], recon: ReconItem[]): Plan {
  const taking = p.taking
  return {
    keep: recon.filter((r) => r.verdict === 'keep'),
    drop: recon.filter((r) => r.verdict === 'drop' || r.verdict === 'adjust'),
    check: recon.filter((r) => r.verdict === 'check'),
    add: recs.filter((r) => (r.verdict === 'add' || r.verdict === 'essential' || r.verdict === 'consider') && !taking.includes(r.id)),
    addCheck: recs.filter((r) => r.verdict === 'check' && !taking.includes(r.id)),
  }
}

/** Convenience: reconcile the whole current stack at once. */
export function reconcileStack(p: CompleteProfile): ReconItem[] {
  return p.taking.map((id) => reconcileItem(p, id)).filter((x): x is ReconItem => x !== null)
}
