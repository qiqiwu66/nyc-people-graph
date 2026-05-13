import { useEffect, useRef, useState } from 'react'
import type { Person, Tag } from '../types'
import './AddPersonForm.css'

const ALL_TAGS: Tag[] = ['friend', 'colleague', 'acquaintance', 'family']

const TAG_SHORT: Record<Tag, string> = {
  friend: 'fr', colleague: 'co', acquaintance: 'aq', family: 'fa',
}
const TAG_COLOR: Record<Tag, string> = {
  friend: '#7C5CBF', colleague: '#2563EB', acquaintance: '#6B7280', family: '#059669',
}
const TAG_BG: Record<Tag, string> = {
  friend: '#F0EBFB', colleague: '#EBF2FF', acquaintance: '#F3F4F6', family: '#ECFDF5',
}

function Caret() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <path d="M1.5 3.5l3.5 3 3.5-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TagDropdown({ tags, onChange }: { tags: Tag[]; onChange: (tags: Tag[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const label = tags.length === 0
    ? <span className="cell-dd-placeholder">Select...</span>
    : <span className="cell-dd-tags">
        {tags.map(t => (
          <span key={t} className="cell-dd-tag" style={{ color: TAG_COLOR[t], background: TAG_BG[t] }}>
            {TAG_SHORT[t]}
          </span>
        ))}
      </span>

  return (
    <div className="cell-dd" ref={ref}>
      <div className="cell-dd-trigger" onClick={() => setOpen(v => !v)}>
        {label}
        <Caret />
      </div>
      {open && (
        <div className="cell-dd-menu">
          {ALL_TAGS.map(tag => {
            const active = tags.includes(tag)
            return (
              <div
                key={tag}
                className={`cell-dd-option${active ? ' cell-dd-option-active' : ''}`}
                onClick={() => onChange(active ? tags.filter(t => t !== tag) : [...tags, tag])}
              >
                <span className="cell-dd-check">{active ? '✓' : ''}</span>
                <span style={{ color: TAG_COLOR[tag] }}>{tag}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface Row { name: string; tags: Tag[]; linkType: string }
const emptyRow = (): Row => ({ name: '', tags: [], linkType: '' })

interface Props {
  people: Person[]
  centers: Person[]
  onAdd: (person: Omit<Person, 'id'>, viaText?: string, centerId?: string) => void
  onAddMultiple: (entries: Array<{ data: Omit<Person, 'id'>; viaText?: string }>, centerId?: string) => void
  onClose: () => void
  onNameChange?: (name: string) => void
}

export function AddPersonForm({ people, centers, onAdd, onAddMultiple, onClose, onNameChange }: Props) {
  const [name, setName] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [notes, setNotes] = useState('')
  const [linkType, setLinkType] = useState('')
  const [multiMode, setMultiMode] = useState(false)
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, emptyRow))
  const defaultCenterId = centers[0]?.id ?? 'self'
  const [centerId, setCenterId] = useState(defaultCenterId)

  function toggleTag(tag: Tag) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function updateRow(i: number, field: 'name' | 'linkType', value: string) {
    setRows((prev) => prev.map((r, idx) => idx !== i ? r : { ...r, [field]: value }))
  }

  function setRowTags(i: number, newTags: Tag[]) {
    setRows((prev) => prev.map((r, idx) => idx !== i ? r : { ...r, tags: newTags }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onAdd({ name: name.trim(), tags, notes }, linkType.trim() || undefined, centerId)
    onClose()
  }

  function submitMulti() {
    const valid = rows.filter((r) => r.name.trim())
    if (!valid.length) return
    onAddMultiple(valid.map((r) => ({
      data: { name: r.name.trim(), tags: r.tags, notes: '' },
      viaText: r.linkType.trim() || undefined,
    })), centerId)
    onClose()
  }

  const filledCount = rows.filter((r) => r.name.trim()).length

  return (
    <div className={`sidebar${multiMode ? ' sidebar-wide' : ''}`}>
      <button className="sidebar-close" onClick={onClose}>×</button>

      <div className="add-person-header">
        <h2 className="sidebar-name">{multiMode ? 'Add people' : 'Add person'}</h2>
        <label className="multi-toggle">
          <span className="multi-toggle-label">Add multiple</span>
          <span
            role="switch"
            aria-checked={multiMode}
            className={`toggle-track${multiMode ? ' toggle-track-on' : ''}`}
            onClick={() => setMultiMode((v) => !v)}
          >
            <span className="toggle-thumb" />
          </span>
        </label>
      </div>

      {centers.length > 1 && (
        <div className="form-field" style={{ marginTop: 16 }}>
          <label>Connect to</label>
          <div className="tag-selector">
            {centers.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`tag-btn${centerId === c.id ? ' tag-btn-active' : ''}`}
                onClick={() => setCenterId(c.id)}
              >
                {c.isSelf ? 'You' : c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!multiMode ? (
        <form onSubmit={submit} style={{ marginTop: centers.length > 1 ? 4 : 20 }}>
          <div className="form-field">
            <label>Name *</label>
            <input
              className="input"
              placeholder="Full name"
              value={name}
              onChange={(e) => { setName(e.target.value); onNameChange?.(e.target.value) }}
              autoFocus
            />
          </div>

          <div className="form-field">
            <label>Tags</label>
            <div className="tag-selector">
              {ALL_TAGS.map((tag) => (
                <button key={tag} type="button"
                  className={`tag-btn ${tags.includes(tag) ? 'tag-btn-active' : ''}`}
                  onClick={() => toggleTag(tag)}
                >{tag}</button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label>Connection via <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>(optional)</span></label>
            <input className="input" placeholder="e.g. school, work, Austin Wu…"
              value={linkType} onChange={(e) => setLinkType(e.target.value)}
              list="add-person-via-list" />
            <datalist id="add-person-via-list">
              {people.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>

          <div className="form-field">
            <label>Notes</label>
            <textarea className="input" placeholder="How do you know them? Where did you meet?"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={3} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={!name.trim()}>Add to graph</button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      ) : (
        <div style={{ marginTop: 20 }}>
          <div className="multi-table-wrap">
            <table className="multi-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tags</th>
                  <th>Via</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className="multi-cell-input"
                        placeholder="Select..."
                        value={row.name}
                        onChange={(e) => updateRow(i, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <TagDropdown tags={row.tags} onChange={(t) => setRowTags(i, t)} />
                    </td>
                    <td>
                      <ViaInput
                        value={row.linkType}
                        onChange={(v) => updateRow(i, 'linkType', v)}
                        people={people}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="multi-via-list">
              {people.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>

          <button type="button" className="multi-add-row" onClick={() => setRows((r) => [...r, emptyRow()])}>
            + Add row
          </button>

          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn-primary" disabled={filledCount === 0} onClick={submitMulti}>
              Add {filledCount > 0 ? filledCount : ''} {filledCount === 1 ? 'person' : 'people'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ViaInput({ value, onChange }: { value: string; onChange: (v: string) => void; people: Person[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="cell-dd cell-dd-via">
      <input
        ref={inputRef}
        className="cell-dd-via-input"
        placeholder="Select..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list="multi-via-list"
      />
      <span className="cell-dd-caret" onClick={() => inputRef.current?.focus()}>
        <Caret />
      </span>
    </div>
  )
}
