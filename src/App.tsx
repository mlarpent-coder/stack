import { useMemo, useState } from 'react'
import type { BloodMarkers, CompleteProfile, Profile, ReconItem, Rec, SupplementId } from './engine/types'
import { profileRecs, reconcileStack, buildPlan } from './engine/engine'
import { howFor } from './engine/knowledge'
import { Ambient, Brand, Progress, Question, RecCard, SwipeDeck, HowGrid } from './ui/components'

type Screen = 'intro' | 'assess' | 'report' | 'current' | 'swipe' | 'plan'

const REQUIRED: (keyof Profile)[] = ['age', 'sex', 'diet', 'fish', 'sun', 'latitude', 'alcohol', 'activity', 'sleep', 'safety']

// Single-select assessment questions, in order.
const QUESTIONS: { key: keyof Profile; label: string; hint?: string; options: [string, string][] }[] = [
  { key: 'age', label: 'Your age', options: [['under30', 'Under 30'], ['30s', '30s'], ['40s', '40s'], ['50s', '50s'], ['60plus', '60+']] },
  { key: 'sex', label: 'Sex at birth', options: [['female', 'Female'], ['male', 'Male']] },
  { key: 'diet', label: 'How you eat', options: [['omnivore', 'Omnivore'], ['pescatarian', 'Pescatarian'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan']] },
  { key: 'fish', label: 'How often you eat oily fish', hint: 'Salmon, mackerel, sardines, trout', options: [['never', 'Never'], ['subweekly', 'Less than weekly'], ['1-2', '1–2× a week'], ['3plus', '3+ a week']] },
  { key: 'sun', label: 'Days a week with skin in daylight, ~1hr+', hint: 'Arms or face — not through a window', options: [['0-1', '0–1'], ['2-3', '2–3'], ['4-5', '4–5'], ['6-7', '6–7']] },
  { key: 'latitude', label: 'Where do you live?', hint: 'Pick whichever’s closest — it changes your vitamin D', options: [['high', 'UK, N. Europe, Canada, northern US'], ['mid', 'S. Europe, southern US or similar'], ['low', 'Tropics or somewhere sunny year-round']] },
  { key: 'alcohol', label: 'Alcohol', options: [['none', 'None'], ['occasional', 'Occasionally'], ['fewweekly', 'A few a week'], ['mostdays', 'Most days']] },
  { key: 'activity', label: 'How active you are', options: [['sedentary', 'Mostly sedentary'], ['light', 'Lightly active'], ['moderate', 'Moderate'], ['very', 'Very active']] },
  { key: 'sleep', label: 'How you sleep', options: [['good', 'Sleeping well'], ['patchy', 'A bit patchy'], ['poor', 'Sleeping badly']] },
]

const BLOOD_FIELDS: { k: keyof BloodMarkers; label: string; unit: string; ph: string }[] = [
  { k: 'vitD', label: 'Vitamin D', unit: 'nmol/L', ph: 'e.g. 58' },
  { k: 'ferritin', label: 'Ferritin', unit: 'µg/L', ph: 'e.g. 41' },
  { k: 'b12', label: 'Vitamin B12', unit: 'ng/L', ph: 'e.g. 380' },
  { k: 'folate', label: 'Folate', unit: 'µg/L', ph: 'e.g. 8' },
]

const GOALS: [string, string][] = [['energy', 'Energy'], ['sleep', 'Sleep'], ['futurehealth', 'Long-term health'], ['skin', 'Skin'], ['immunity', 'Immunity']]
const PREFS: [string, string][] = [['coffee', 'Not in my coffee'], ['nolarge', 'No large pills'], ['powder', 'Powders are fine']]
const TAKING: [string, string][] = [
  ['vitd', 'Vitamin D'], ['omega369', 'Omega 3-6-9'], ['omega3', 'Omega-3 / fish oil'], ['vitc', 'Vitamin C'],
  ['multi', 'Multivitamin'], ['magnesium', 'Magnesium'], ['b12', 'B12'], ['iron', 'Iron'],
]

const EMPTY: Profile = { goal: [], prefs: [], taking: [] }

export default function App() {
  const [screen, setScreen] = useState<Screen>('intro')
  const [profile, setProfile] = useState<Profile>(EMPTY)
  const [none, setNone] = useState(false)
  const [showBlood, setShowBlood] = useState(false)
  const [recon, setRecon] = useState<ReconItem[]>([])

  // periods is required only for female profiles (it drives the iron logic)
  const complete = REQUIRED.every((k) => profile[k]) && (profile.sex !== 'female' || !!profile.periods)
  const cp = profile as CompleteProfile

  // recs are pure-derived from the profile once it's complete
  const recs: Rec[] = useMemo(() => (complete ? profileRecs(cp) : []), [complete, profile])

  function goto(s: Screen) { setScreen(s); window.scrollTo(0, 0) }
  const setField = (key: keyof Profile, val: string) => setProfile((p) => ({ ...p, [key]: val }))
  const toggle = (key: 'goal' | 'prefs', val: string) =>
    setProfile((p) => {
      const arr = p[key] as string[]
      return { ...p, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] }
    })
  function toggleTaking(id: string) {
    if (id === 'none') { setProfile((p) => ({ ...p, taking: [] })); setNone(true); return }
    setNone(false)
    setProfile((p) => ({
      ...p,
      taking: p.taking.includes(id as SupplementId)
        ? p.taking.filter((x) => x !== id)
        : [...p.taking, id as SupplementId],
    }))
  }
  function setBlood(k: keyof BloodMarkers, raw: string) {
    setProfile((prof) => {
      const blood: BloodMarkers = { ...(prof.blood ?? {}) }
      const v = raw.trim()
      if (v === '' || Number.isNaN(Number(v))) delete blood[k]
      else blood[k] = Number(v)
      return { ...prof, blood: Object.keys(blood).length ? blood : undefined }
    })
  }
  function reset() { setProfile(EMPTY); setNone(false); setShowBlood(false); setRecon([]); goto('intro') }

  function goReport() { goto('report') }
  function sortStack() {
    const r = reconcileStack(cp)
    setRecon(r)
    goto(r.length ? 'swipe' : 'plan')
  }

  return (
    <>
      <Ambient />
      <div className="app">
        {screen === 'intro' && <Intro onStart={() => goto('assess')} />}

        {screen === 'assess' && (
          <section className="screen">
            <Brand />
            <div className="head">
              <span className="step">Step 1 of 4 · About you</span>
              <h2>Tell us about you</h2>
              <div className="lede">The more honest your answers, the more useful the read.</div>
              <Progress pct={25} />
            </div>
            {QUESTIONS.map((q) => (
              <Question key={q.key} label={q.label} hint={q.hint} options={q.options}
                value={(profile[q.key] as string) ?? ''} onSelect={(v) => setField(q.key, v)} />
            ))}
            {profile.sex === 'female' && (
              <Question label="Do you have periods?" hint="Whatever the reason — contraception, menopause, or otherwise. It affects iron risk."
                options={[['regular', 'Yes, regular'], ['light', 'Light or irregular'], ['none', 'No — none right now']]}
                value={profile.periods ?? ''} onSelect={(v) => setField('periods', v)} />
            )}
            <Question label="What's on your mind?" optional hint="Pick any that apply" multi options={GOALS}
              value={profile.goal} onSelect={(v) => toggle('goal', v)} />
            <Question label="Any way you won't take things?" optional multi options={PREFS}
              value={profile.prefs} onSelect={(v) => toggle('prefs', v)} />
            <Question label="Regular medications or diagnosed conditions?" options={[['no', 'No'], ['yes', 'Yes']]}
              value={profile.safety ?? ''} onSelect={(v) => setField('safety', v)} />

            <div className="q">
              <div className="lab">Had a blood test recently that gave you these numbers?<span className="opt">optional</span></div>
              <div className="hint">Only these four change a supplement call. Have them to hand? Add them to sharpen the result — otherwise skip.</div>
              {!showBlood ? (
                <button type="button" className="chip" onClick={() => setShowBlood(true)}>Yes, I'll add them →</button>
              ) : (
                <div className="bloodgrid">
                  {BLOOD_FIELDS.map((f) => (
                    <label className="bfield" key={f.k}>
                      <span className="bk">{f.label} <em>{f.unit}</em></span>
                      <input type="number" inputMode="decimal" min="0" step="any" placeholder={f.ph}
                        value={profile.blood?.[f.k] ?? ''} onChange={(e) => setBlood(f.k, e.target.value)} />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="actions">
              <button className="btn" disabled={!complete} onClick={goReport}>See what's worth taking →</button>
            </div>
            {!complete && <div className="warn">Pick one option for each question above to continue.</div>}
          </section>
        )}

        {screen === 'report' && (
          <section className="screen">
            <Brand />
            <div className="head">
              <span className="step">Step 2 of 4 · What's worth taking</span>
              <h2>For your body — here's the shortlist</h2>
              <div className="lede">Based only on who you are. Next, we'll sort what you already take.</div>
              <Progress pct={50} />
            </div>
            {profile.safety === 'yes' && (
              <div className="gate">
                <b>Because you take medication or have a condition:</b> some supplements interact with medicines.
                Check anything here with your GP or pharmacist before you start it.
              </div>
            )}
            {recs.map((r) => <RecCard key={r.id} rec={r} profile={cp} />)}
            {profile.alcohol === 'mostdays' && (
              <div className="aside">
                <b>One honest aside:</b> easing back on alcohol would move your long-term health more than anything
                here — and it's part of why magnesium made the list. Not a lecture, just the most useful thing we can say.
              </div>
            )}
            {profile.sleep === 'poor' && (
              <div className="aside">
                <b>On sleep:</b> the biggest levers are a steady schedule, morning daylight and cutting caffeine after
                midday — more than any supplement. Anything here is a small add on top.
              </div>
            )}
            <div className="actions">
              <button className="btn blue" onClick={() => goto('current')}>Next: what do you take? →</button>
            </div>
          </section>
        )}

        {screen === 'current' && (
          <section className="screen">
            <Brand />
            <div className="head">
              <span className="step">Step 3 of 4 · Your current stack</span>
              <h2>What do you take now?</h2>
              <div className="lede">We'll check each one against the shortlist — keep what earns its place, bin what doesn't.</div>
              <Progress pct={75} />
            </div>
            <div className="q">
              <div className="chips">
                {TAKING.map(([val, text]) => (
                  <button type="button" key={val} className={`chip${profile.taking.includes(val as SupplementId) ? ' sel' : ''}`}
                    aria-pressed={profile.taking.includes(val as SupplementId)} onClick={() => toggleTaking(val)}>{text}</button>
                ))}
                <button type="button" className={`chip${none ? ' sel' : ''}`} aria-pressed={none} onClick={() => toggleTaking('none')}>I take nothing</button>
              </div>
            </div>
            <div className="actions">
              <button className="btn" onClick={sortStack}>Sort my stack →</button>
            </div>
          </section>
        )}

        {screen === 'swipe' && (
          <section className="screen">
            <Brand />
            <div className="head">
              <span className="step">Step 3 of 4 · Your current stack</span>
              <h2>Keep it or bin it</h2>
              <div className="lede">Swipe through what you take. Right to keep, left to bin — our take is on each card.</div>
              <Progress pct={75} />
            </div>
            <SwipeDeck items={recon} onDone={() => goto('plan')} />
          </section>
        )}

        {screen === 'plan' && <Plan profile={cp} recs={recs} recon={recon} onRestart={reset} />}
      </div>
    </>
  )
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <section className="screen">
      <Brand />
      <div className="hero">
        <div className="sunburst" />
        <div className="in">
          <h1>What should <span className="hl">you</span> actually take?</h1>
          <p>An honest read on your vitamins and supplements — no influencers, no upsell. Just the evidence, for your body.</p>
          <button className="btn blue" onClick={onStart}>Start →</button>
          <div className="fine">2 minutes · nothing to buy</div>
        </div>
      </div>
    </section>
  )
}

function Plan({ profile, recs, recon, onRestart }: { profile: CompleteProfile; recs: Rec[]; recon: ReconItem[]; onRestart: () => void }) {
  const plan = buildPlan(profile, recs, recon)
  const nothing = !plan.keep.length && !plan.drop.length && !plan.add.length && !plan.check.length && !plan.addCheck.length
  const checks = [...plan.check, ...plan.addCheck.map((r) => ({ id: r.id, name: r.name.replace(/ —.*/, ''), verdict: 'check' as const, why: r.why }))]
  return (
    <section className="screen">
      <Brand />
      <div className="head">
        <span className="step">Step 4 of 4 · Your plan</span>
        <h2>Your honest stack</h2>
        <div className="lede">What to keep, what to drop, and what's worth adding — with how.</div>
        <Progress pct={100} />
      </div>

      {plan.keep.length > 0 && (
        <div className="planblock">
          <div className="bt"><span className="swatch" style={{ background: 'var(--green)' }} />Keep</div>
          {plan.keep.map((r) => <PlanRow key={r.id} dot="keep" name={r.name} why={r.why} />)}
        </div>
      )}
      {plan.drop.length > 0 && (
        <div className="planblock">
          <div className="bt"><span className="swatch" style={{ background: 'var(--burnt)' }} />Drop</div>
          {plan.drop.map((r) => <PlanRow key={r.id} dot="drop" name={r.name + (r.verdict === 'adjust' ? ' → swap' : '')} why={r.why} />)}
        </div>
      )}
      {plan.add.length > 0 && (
        <div className="planblock">
          <div className="bt"><span className="swatch" style={{ background: 'var(--blue)' }} />Worth adding — here's how</div>
          {plan.add.map((r) => (
            <div className="planadd" key={r.id}>
              <div className="ah"><span className={`dot ${r.verdict}`} /><h3>{r.name}</h3><span className={`verdict ${r.verdict}`}>{r.badge}</span></div>
              <RecCardHow rec={r} profile={profile} />
            </div>
          ))}
        </div>
      )}
      {checks.map((r) => (
        <div className="checknote" key={'chk-' + r.id}><b>Get tested first:</b> {r.name} — {r.why}</div>
      ))}
      {nothing && <div className="aside">Nothing to change — you're in good shape.</div>}

      <div className="actions"><button className="btn ghost" onClick={onRestart}>↺ Start over</button></div>
      <div className="footnote">
        <b>Not medical advice</b> — general wellness information. Any buy links are chosen on merit; we don't sell supplements.
      </div>
    </section>
  )
}

function PlanRow({ dot, name, why }: { dot: string; name: string; why: string }) {
  return (
    <div className="prow"><span className={`dot ${dot}`} /><div><div className="nm">{name}</div><div className="rs">{why}</div></div></div>
  )
}

// A plan "add" shows the how-to protocol (or the why, if it has no protocol).
function RecCardHow({ rec, profile }: { rec: Rec; profile: CompleteProfile }) {
  const how = howFor(rec.id, profile)
  return how ? <HowGrid how={how} /> : <div className="rs" style={{ fontSize: 14 }}>{rec.why}</div>
}
