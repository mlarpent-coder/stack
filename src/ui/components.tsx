import { useRef, useState } from 'react'
import type { CompleteProfile, HowTo, ReconItem, Rec } from '../engine/types'
import { howFor } from '../engine/knowledge'

export function Ambient() {
  return (
    <div className="amb" aria-hidden="true">
      <span className="cap a" /><span className="cap b" /><span className="cap c" /><span className="cap d" />
    </div>
  )
}

export function Brand() {
  return <div className="brand"><span className="lozenge" />Stack</div>
}

export function Progress({ pct }: { pct: number }) {
  return <div className="progress"><i style={{ width: `${pct}%` }} /></div>
}

type Opt = [value: string, label: string]

export function Question(props: {
  label: string
  hint?: string
  optional?: boolean
  options: Opt[]
  multi?: boolean
  value: string | string[]
  onSelect: (v: string) => void
}) {
  const { label, hint, optional, options, multi, value, onSelect } = props
  return (
    <div className="q">
      <div className="lab">{label}{optional && <span className="opt">optional</span>}</div>
      {hint && <div className="hint">{hint}</div>}
      <div className="chips">
        {options.map(([val, text]) => {
          const sel = multi ? (value as string[]).includes(val) : value === val
          return (
            <button
              type="button"
              key={val}
              className={`chip${sel ? ' sel' : ''}`}
              aria-pressed={sel}
              onClick={() => onSelect(val)}
            >
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function HowGrid({ how }: { how: HowTo }) {
  return (
    <div className="how">
      <div className="ht">◷ How to take it</div>
      <div className="grid">
        {how.fields.map((f) => (
          <div className="cell" key={f.k}>
            <div className="k">{f.k}</div>
            <div className="v">{f.v}</div>
          </div>
        ))}
      </div>
      {(how.buy || how.links) && (
        <div className="buy">
          {how.buy}
          {how.links && (
            <div className="buylinks">
              Where:{' '}
              {how.links.map((l, i) => (
                <span key={l.url}>
                  {i > 0 && ' · '}
                  <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RecCard({ rec, profile, showHow }: { rec: Rec; profile: CompleteProfile; showHow?: boolean }) {
  const how = showHow ? howFor(rec.id, profile) : null
  return (
    <div className="reccard">
      <div className="row">
        <span className={`dot ${rec.verdict}`} />
        <h3>{rec.name}</h3>
        <span className={`verdict ${rec.verdict}`}>{rec.badge}</span>
      </div>
      <div className="why">{rec.why}</div>
      {rec.evidence && (
        <span className={`ev ${rec.evidence}`}>● {rec.evidence === 'strong' ? 'Strong evidence' : 'Moderate evidence'}</span>
      )}
      {how && <HowGrid how={how} />}
      {rec.science && (
        <details>
          <summary><span className="arw">▶</span> The science</summary>
          <div className="sci">
            {rec.science}
            {rec.sources && (
              <span className="src">
                →{' '}
                {rec.sources.map((s, i) => (
                  <span key={s.url}>
                    {i > 0 && ' · '}
                    <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
                  </span>
                ))}
              </span>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

const stackLabel = (v: string) =>
  v === 'keep' ? 'Keep' : v === 'drop' ? 'Bin it' : v === 'adjust' ? 'Swap' : 'Get tested'

export function SwipeDeck({ items, onDone }: { items: ReconItem[]; onDone: () => void }) {
  const [cards, setCards] = useState<ReconItem[]>(items)
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0)
  const drag = useRef<{ active: boolean; sx: number }>({ active: false, sx: 0 })

  const topIndex = cards.length - 1

  function commit(dir: 1 | -1) {
    setLeaving(dir)
    window.setTimeout(() => {
      const remaining = cards.length - 1
      setCards((cs) => cs.slice(0, -1))
      setDx(0)
      setLeaving(0)
      if (remaining <= 0) window.setTimeout(onDone, 10)
    }, 380)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (leaving) return
    drag.current = { active: true, sx: e.clientX }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return
    setDx(e.clientX - drag.current.sx)
  }
  function onPointerUp() {
    if (!drag.current.active) return
    drag.current.active = false
    if (Math.abs(dx) > 90) commit(dx > 0 ? 1 : -1)
    else setDx(0)
  }

  return (
    <div className="deckwrap">
      <div className="deck">
        {cards.map((r, i) => {
          const isTop = i === topIndex
          let transform = ''
          let transition: string | undefined
          if (isTop) {
            if (leaving) {
              transform = `translateX(${leaving * 520}px) rotate(${leaving * 22}deg)`
            } else {
              transform = `translateX(${dx}px) rotate(${dx / 18}deg)`
              transition = drag.current.active ? 'none' : undefined
            }
          }
          const keepOp = isTop && !leaving ? Math.min(1, Math.max(0, dx / 80)) : leaving === 1 && isTop ? 1 : 0
          const skipOp = isTop && !leaving ? Math.min(1, Math.max(0, -dx / 80)) : leaving === -1 && isTop ? 1 : 0
          return (
            <div
              key={r.id}
              className="sw"
              style={{ transform, transition, opacity: isTop && leaving ? 0 : 1 }}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
            >
              <span className="stamp k" style={{ opacity: keepOp }}>Keep</span>
              <span className="stamp s" style={{ opacity: skipOp }}>Skip</span>
              <div className="top">
                <span className={`dot ${r.verdict}`} />
                <span className={`verdict ${r.verdict}`}>Our take: {stackLabel(r.verdict)}</span>
              </div>
              <h4>{r.name}</h4>
              <p>{r.why}</p>
            </div>
          )
        })}
      </div>
      <div className="ctrls">
        <button className="cbtn no" aria-label="Bin it" onClick={() => !leaving && commit(-1)}>✕</button>
        <button className="cbtn yes" aria-label="Keep" onClick={() => !leaving && commit(1)}>✓</button>
      </div>
      <div className="hintline">drag the card · or tap ✕ / ✓</div>
    </div>
  )
}
