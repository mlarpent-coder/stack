// Curated, sourced reference data. This is the part that matters most for trust:
// every claim the app makes should trace back to something here.
// Keep sources to stable, authoritative pages (NHS, Examine, named trials).

import type { CompleteProfile, HowTo, Source, SupplementId } from './types'

export const SRC: Record<string, Source> = {
  nhsD: { label: 'NHS · Vitamin D', url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-d/' },
  nhsB12: { label: 'NHS · B12 & folate', url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-b12-and-folate/' },
  nhsVit: { label: 'NHS · Vitamins & minerals', url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/' },
  vital: { label: 'VITAL trial (2019)', url: 'https://pubmed.ncbi.nlm.nih.gov/31733345/' },
  exCre: { label: 'Examine · Creatine', url: 'https://examine.com/supplements/creatine/' },
  exMag: { label: 'Examine · Magnesium', url: 'https://examine.com/supplements/magnesium/' },
  exFish: { label: 'Examine · Fish oil', url: 'https://examine.com/supplements/fish-oil/' },
  exC: { label: 'Examine · Vitamin C', url: 'https://examine.com/supplements/vitamin-c/' },
}

const lowSun = (p: CompleteProfile) => p.sun === '0-1' || p.sun === '2-3'
const isPlant = (p: CompleteProfile) => p.diet === 'vegan' || p.diet === 'vegetarian'
const vehicle = (p: CompleteProfile) =>
  p.prefs.includes('coffee') ? 'In water or juice — not your coffee' : 'In water, juice or a smoothie'

/** The "how to actually take it" protocol for anything worth adding. Shaped by preferences. */
export function howFor(id: SupplementId, p: CompleteProfile): HowTo | null {
  switch (id) {
    case 'creatine':
      return {
        fields: [
          { k: 'Form', v: 'Monohydrate — skip the fancy forms' },
          { k: 'Dose', v: '3–5 g, every day' },
          { k: 'When', v: 'Any time — consistency matters most' },
          { k: 'How', v: vehicle(p) },
          { k: 'How long', v: 'Ongoing — builds over weeks' },
          { k: 'Cost', v: '~£10–15 / month' },
        ],
        buy: 'A plain, third-party-tested monohydrate — chosen on merit, not commission.',
      }
    case 'magnesium':
      return {
        fields: [
          { k: 'Form', v: 'Glycinate — gentle, good for sleep' },
          { k: 'Dose', v: '200–300 mg' },
          { k: 'When', v: 'Evening, with food' },
          { k: 'How long', v: 'Ongoing; ease off if it loosens your stool' },
        ],
      }
    case 'vitd':
      return {
        fields: [
          { k: 'Form', v: 'D3 (not D2)' },
          { k: 'Dose', v: '10 µg / 400 IU daily' },
          { k: 'When', v: 'With a meal — it needs fat' },
          { k: 'How long', v: lowSun(p) ? 'Year-round' : 'October–March' },
        ],
      }
    case 'omega3':
      return {
        fields: [
          { k: 'Form', v: isPlant(p) ? 'Algal oil (vegan)' : 'Fish oil' },
          { k: 'Dose', v: '~1000 mg combined EPA + DHA' },
          { k: 'When', v: 'With food' },
          { k: 'How long', v: 'Ongoing' },
        ],
      }
    case 'b12':
      return {
        fields: [
          { k: 'Form', v: 'Methyl- or cyanocobalamin' },
          { k: 'Dose', v: '10–25 µg daily' },
          { k: 'When', v: 'Any time' },
          { k: 'How long', v: 'Ongoing' },
        ],
      }
    default:
      return null
  }
}
