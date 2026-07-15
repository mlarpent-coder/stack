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
const hasCond = (p: CompleteProfile, c: string) => p.conditions.includes(c as never)

const VERDICT_ORDER: Record<string, number> = { essential: 0, add: 1, consider: 2, check: 3, keep: 4, drop: 5 }

// --- Protein: the one recommendation that genuinely scales with bodyweight. ---
// Intake is estimated from an eating-pattern band (no food-weighing), so both sides are
// deliberately rough — we only ever surface protein when the gap is clearly meaningful.
const PROTEIN_EST: Record<string, number> = { low: 45, some: 70, moderate: 95, high: 125 }

export interface ProteinNeed { target: number; est: number; gap: number; factor: number; older: boolean }

/** Weight-based protein target vs an estimated intake. Returns null if either input was skipped —
 *  we never guess weight or intake, so with a gap we can't compute, protein simply isn't surfaced.
 *  Targets: 0.8 g/kg RDA baseline; ~1.2 g/kg for the active or the over-50s (sarcopenia); ~1.6 g/kg
 *  for the very active, within the 1.4–2.0 g/kg range for people training hard. */
export function proteinNeed(p: CompleteProfile): ProteinNeed | null {
  const w = p.weightKg
  if (w == null || w <= 0 || !p.protein) return null
  const est = PROTEIN_EST[p.protein]
  const older = p.age === '50s' || p.age === '60plus'
  const factor = p.activity === 'very' ? 1.6 : (p.activity === 'moderate' || older) ? 1.2 : 0.8
  const target = Math.round(w * factor)
  return { target, est, gap: target - est, factor, older }
}

/** Safety pass: real contraindications that MODIFY a recommendation, not just warn beside it.
 *  Runs after the profile rules so the base logic stays readable. */
function applySafety(recs: Rec[], p: CompleteProfile): Rec[] {
  const kidney = hasCond(p, 'kidney')
  const bleed = hasCond(p, 'bloodthinners')
  const ironOverload = hasCond(p, 'ironoverload')
  const thyroidMeds = hasCond(p, 'thyroidmeds')
  return recs.map((rec): Rec => {
    if (kidney && (rec.id === 'creatine' || rec.id === 'magnesium')) {
      return { ...rec, verdict: 'check', badge: 'Not without your GP', why: `You flagged kidney disease — ${rec.name.toLowerCase()} can be a problem for the kidneys, so don't start it without your doctor's OK.` }
    }
    if (kidney && rec.id === 'protein') {
      return { ...rec, verdict: 'check', badge: 'Check with your GP', why: 'You flagged kidney disease — a high protein intake can strain the kidneys, so agree your protein target with your doctor before adding to it.' }
    }
    if (bleed && rec.id === 'omega3') {
      return { ...rec, verdict: 'check', badge: 'Check with your GP', why: "You're on blood thinners — fish or algal oil can add to bleeding risk, so clear it with your GP before starting." }
    }
    if (ironOverload && rec.id === 'iron') {
      return { ...rec, name: 'Iron', verdict: 'drop', badge: 'Do not take', why: 'You have iron overload — do not take iron. Your levels should be managed by your specialist, never topped up.' }
    }
    if (thyroidMeds && rec.id === 'iron' && rec.verdict !== 'drop') {
      return { ...rec, why: rec.why + ' (Keep any iron at least 4 hours apart from your thyroid tablet — it blocks absorption.)' }
    }
    return rec
  })
}

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

  // --- Folate: the one clear-cut supplement for anyone pregnant or trying ---
  if (p.sex === 'female' && (p.pregnancy === 'trying' || p.pregnancy === 'pregnant')) {
    r.push({
      id: 'folate', name: 'Folic acid', verdict: 'essential', badge: 'Essential',
      why: "If you're pregnant or trying, this is the one clear-cut supplement — 400 µg daily from before conception through the first 12 weeks. It sharply cuts the risk of neural-tube defects like spina bifida.",
      evidence: 'strong', science: 'Peri-conceptional folic acid is among the most robustly evidenced interventions in medicine for preventing neural-tube defects.', sources: [SRC.nhsB12],
    })
  }

  // --- Creatine: earns its place ONLY alongside resistance training, not general activity.
  // Someone with no strength work (however much cardio) gets no card — just an honest aside. ---
  const femaleOlder = p.sex === 'female' && (p.age === '40s' || p.age === '50s' || p.age === '60plus')
  if (p.strength === 'regular' || p.strength === 'some') {
    const consistent = p.strength === 'regular'
    r.push({
      id: 'creatine', name: 'Creatine',
      // Benefit scales with training stimulus: regular training earns a confident "add";
      // occasional training sits genuinely between yes and no → a softer "consider".
      verdict: consistent ? 'add' : 'consider',
      badge: consistent ? 'Worth taking' : 'Consider',
      why:
        'One of the best-evidenced supplements for building and keeping muscle strength as you age — and promising, though less settled, for preserving bone' +
        (femaleOlder ? ', where the emerging evidence for women through perimenopause is encouraging' : '') +
        '. It pairs with your ' + (consistent ? 'regular strength training.' : 'occasional strength work — but the more consistent the training, the more it delivers, so this is a nice-to-have until you train more regularly.') +
        (goalHas(p, 'futurehealth') ? ' Given you flagged long-term health, it\'s a strong pick.' : ''),
      evidence: 'strong',
      science:
        'Creatine\'s benefits are strongest paired with resistance exercise; without training the effect is much smaller. A 2-year RCT in 237 postmenopausal women found creatine plus resistance training preserved hip bone density better than placebo, with consistent lean-mass and strength gains in women 40+.',
      sources: [SRC.exCre],
    })
  }
  // p.strength === 'none' → no creatine card; the report shows an aside pointing at the real lever.

  // --- Protein: weight-based, and only when there's a real gap to fill (food first) ---
  const prot = proteinNeed(p)
  if (prot && prot.gap >= 15) {
    // 'add' only when the gap is sizeable AND there's a reason to aim above the RDA;
    // otherwise a gentle 'consider' that points at food before powder.
    const strong = prot.gap >= 30 && prot.factor > 0.8
    const driver = p.activity === 'very' ? 'training hard' : isActive(p) ? 'being active' : prot.older ? 'being over 50' : 'your body'
    const plant = isPlant(p)
    r.push({
      id: 'protein', name: plant ? 'Protein (plant blend)' : 'Protein', verdict: strong ? 'add' : 'consider',
      badge: strong ? 'Worth adding' : 'Consider',
      why:
        `At roughly ${p.weightKg} kg and ${driver}, a sensible target is about ${prot.target} g of protein a day — ` +
        `your intake looks closer to ~${prot.est} g, a gap of roughly ${prot.gap} g. ` +
        'Food comes first (an extra egg, yoghurt, tin of beans or palm of meat/fish all count) — ' +
        (plant ? 'a pea/soy protein shake is just the easy way to close what food doesn’t.' : 'a scoop of protein powder is just the easy way to close what food doesn’t.'),
      evidence: 'strong',
      science:
        'Protein needs scale with bodyweight: ~0.8 g/kg/day covers the basics, but ~1.2 g/kg helps active and older adults hold onto muscle, and 1.4–2.0 g/kg suits people training hard. Powder isn’t magic — it’s just convenient food.',
      sources: [SRC.exProtein],
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

  return applySafety(r, p).sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict])
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
    case 'creatine':
      return (p.strength === 'regular' || p.strength === 'some')
        ? { id, name: 'Creatine', verdict: 'keep', why: 'Keep it — it earns its place alongside your strength training.' }
        : { id, name: 'Creatine', verdict: 'drop', why: "Without any resistance training, creatine does little — the effect really needs the training alongside. Worth pausing until you're lifting; then it's one of the best things you can take." }
    case 'protein': {
      const prot = proteinNeed(p)
      if (!prot) return { id, name: 'Protein powder', verdict: 'keep', why: "Protein powder is just food — fine to keep. (Add your weight and rough intake and we'll tell you whether you actually need it.)" }
      return prot.gap >= 15
        ? { id, name: 'Protein powder', verdict: 'keep', why: `Earns its place — it helps close a real gap (roughly ${prot.gap} g/day short of a ~${prot.target} g target for your body).` }
        : { id, name: 'Protein powder', verdict: 'drop', why: `You're already around your ~${prot.target} g/day target from food — the powder's a convenience, not a need. Fine to keep, but nothing here demands it.` }
    }
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

/** Safety overrides applied to something the user ALREADY takes. */
function applySafetyRecon(item: ReconItem, p: CompleteProfile): ReconItem {
  if (hasCond(p, 'ironoverload') && item.id === 'iron')
    return { ...item, verdict: 'drop', why: 'Stop — you have iron overload; do not take iron. Speak to your specialist.' }
  if (hasCond(p, 'bloodthinners') && (item.id === 'omega3' || item.id === 'omega369'))
    return { ...item, verdict: 'check', why: "You're on blood thinners — fish oil can add to bleeding risk; check with your GP before continuing." }
  if (hasCond(p, 'kidney') && item.id === 'magnesium')
    return { ...item, verdict: 'check', why: 'You flagged kidney disease — magnesium can accumulate; check with your GP.' }
  if (hasCond(p, 'kidney') && item.id === 'creatine' && item.verdict !== 'drop')
    return { ...item, verdict: 'check', why: 'You flagged kidney disease — check with your GP before continuing creatine.' }
  if (hasCond(p, 'kidney') && item.id === 'protein')
    return { ...item, verdict: 'check', why: 'You flagged kidney disease — a high protein load can strain the kidneys; agree your target with your GP before relying on a powder.' }
  if (hasCond(p, 'thyroidmeds') && item.id === 'iron' && item.verdict !== 'drop')
    return { ...item, why: item.why + ' Keep it 4h apart from your thyroid tablet.' }
  return item
}

/** Convenience: reconcile the whole current stack at once. */
export function reconcileStack(p: CompleteProfile): ReconItem[] {
  return p.taking
    .map((id) => reconcileItem(p, id))
    .filter((x): x is ReconItem => x !== null)
    .map((item) => applySafetyRecon(item, p))
}
