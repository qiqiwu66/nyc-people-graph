import { useState, useEffect, useRef } from 'react'
import type { AppGraphData, Person, Tag } from '../types'
import './Sidebar.css'

const TAG_COLORS: Record<Tag, string> = {
  friend: '#7C5CBF',
  colleague: '#2563EB',
  acquaintance: '#6B7280',
  family: '#059669',
}

const TAG_BG: Record<Tag, string> = {
  friend: '#F0EBFB',
  colleague: '#EBF2FF',
  acquaintance: '#F3F4F6',
  family: '#ECFDF5',
}

function getNodeId(val: unknown): string {
  if (typeof val === 'object' && val !== null) return (val as Record<string, unknown>).id as string
  return val as string
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <path d="M1.5 3.5l3.5 3 3.5-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface Props {
  person: Person
  graphData: AppGraphData
  onClose: () => void
  onUpdate: (updated: Person) => void
  onDelete: (id: string) => void
  onAddLink: (fromId: string, toId: string, linkType?: string) => void
  onRemoveLink: (fromId: string, toId: string) => void
  onUpdateLinkType: (fromId: string, toId: string, newType: string | undefined) => void
  onSelectPerson: (id: string) => void
}

export function Sidebar({ person, graphData, onClose, onUpdate, onDelete, onAddLink, onRemoveLink, onUpdateLinkType, onSelectPerson }: Props) {
  const [notes, setNotes] = useState(person.notes)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(person.name)
  const [showConnectDropdown, setShowConnectDropdown] = useState(false)
  const [pendingLinkTarget, setPendingLinkTarget] = useState<string | null>(null)
  const [linkTypeInput, setLinkTypeInput] = useState('')
  const [editingLinkFor, setEditingLinkFor] = useState<string | null>(null)
  const [editingLinkType, setEditingLinkType] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setNotes(person.notes) }, [person.id, person.notes])
  useEffect(() => { setNameVal(person.name) }, [person.id, person.name])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showConnectDropdown) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowConnectDropdown(false)
        setPendingLinkTarget(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showConnectDropdown])

  const connectedIds = new Set<string>()
  for (const link of graphData.links) {
    const src = getNodeId(link.source)
    const tgt = getNodeId(link.target)
    if (src === person.id) connectedIds.add(tgt)
    if (tgt === person.id) connectedIds.add(src)
  }

  const connected = graphData.nodes
    .filter((n) => connectedIds.has(n.id))
    .map((n) => {
      const link = graphData.links.find((l) => {
        const src = getNodeId(l.source)
        const tgt = getNodeId(l.target)
        return (src === person.id && tgt === n.id) || (src === n.id && tgt === person.id)
      })
      let viaDisplay: string | undefined
      if (link?.viaPersonId) {
        viaDisplay = graphData.nodes.find((p) => p.id === link.viaPersonId)?.name
      } else {
        viaDisplay = link?.linkType
      }
      return { node: n, linkType: viaDisplay }
    })

  const unconnected = graphData.nodes.filter((n) => n.id !== person.id && !connectedIds.has(n.id))

  function confirmAddLink(targetId: string) {
    onAddLink(person.id, targetId, linkTypeInput.trim() || undefined)
    setShowConnectDropdown(false)
    setPendingLinkTarget(null)
    setLinkTypeInput('')
  }

  return (
    <div className="sidebar">
      <button className="sidebar-close" onClick={onClose}>×</button>

      <div className="sidebar-header">
        {editingName ? (
          <input
            className="sidebar-name-input"
            value={nameVal}
            autoFocus
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={() => {
              onUpdate({ ...person, name: nameVal.trim() || person.name })
              setEditingName(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { setNameVal(person.name); setEditingName(false) }
            }}
          />
        ) : (
          <h2 className="sidebar-name" onClick={() => setEditingName(true)}>{person.name}</h2>
        )}
      </div>

      {person.tags.length > 0 && (
        <div className="sidebar-tags">
          {person.tags.map((tag) => (
            <span
              key={tag}
              className="tag"
              style={{
                background: TAG_BG[tag],
                color: TAG_COLORS[tag],
                border: `1px solid ${TAG_COLORS[tag]}33`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-section-label">Notes</div>
        <textarea
          className="notes-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onUpdate({ ...person, notes })}
          placeholder="Click to add notes..."
          rows={4}
        />
      </div>

      <div className="sidebar-section">
        <div className="links-header">
          <div className="sidebar-section-label">Links ({connected.length})</div>
          {unconnected.length > 0 && (
            <div className="add-link-wrapper" ref={dropdownRef}>
              <button
                className="btn-add-link"
                onClick={() => { setShowConnectDropdown((v) => !v); setPendingLinkTarget(null) }}
              >
                + Add link <Chevron />
              </button>
              {showConnectDropdown && (
                <div className="connect-dropdown">
                  {unconnected.map((p) => (
                    <div
                      key={p.id}
                      className={`connect-option${pendingLinkTarget === p.id ? ' connect-option-active' : ''}`}
                      onClick={() => {
                        if (pendingLinkTarget !== p.id) {
                          setPendingLinkTarget(p.id)
                          setLinkTypeInput('')
                        }
                      }}
                    >
                      <div className="connect-option-row">
                        <span>{p.name}</span>
                      </div>
                      {pendingLinkTarget === p.id && (
                        <div className="connect-via-row" onClick={(e) => e.stopPropagation()}>
                          <input
                            className="connect-via-input"
                            placeholder="via… (optional)"
                            value={linkTypeInput}
                            autoFocus
                            list="sidebar-via-list"
                            onChange={(e) => setLinkTypeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') confirmAddLink(p.id)
                              if (e.key === 'Escape') setPendingLinkTarget(null)
                            }}
                          />
                          <datalist id="sidebar-via-list">
                            {graphData.nodes
                              .filter((n) => !n.isSelf && n.id !== person.id && n.id !== p.id)
                              .map((n) => <option key={n.id} value={n.name} />)}
                          </datalist>
                          <button className="btn-primary connect-via-confirm" onClick={() => confirmAddLink(p.id)}>
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="connections-list">
          {connected.map(({ node: p, linkType }) => (
            <div key={p.id} className="connection-item">
              <span className="connection-name" onClick={() => onSelectPerson(p.id)}>
                {p.name}
              </span>
              {editingLinkFor === p.id ? (
                <>
                  <input
                    className="connection-link-type-input"
                    value={editingLinkType}
                    autoFocus
                    placeholder="via…"
                    list="sidebar-edit-via-list"
                    onChange={(e) => setEditingLinkType(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => {
                      onUpdateLinkType(person.id, p.id, editingLinkType.trim() || undefined)
                      setEditingLinkFor(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setEditingLinkFor(null)
                    }}
                  />
                  <datalist id="sidebar-edit-via-list">
                    {graphData.nodes
                      .filter((n) => !n.isSelf && n.id !== person.id && n.id !== p.id)
                      .map((n) => <option key={n.id} value={n.name} />)}
                  </datalist>
                </>
              ) : (
                <span
                  className={`connection-link-type${linkType ? '' : ' connection-link-type-empty'}`}
                  onClick={() => { setEditingLinkFor(p.id); setEditingLinkType(linkType ?? '') }}
                >
                  {linkType ?? 'via…'}
                </span>
              )}
              <button className="connection-remove btn-ghost" onClick={() => onRemoveLink(person.id, p.id)}>
                ×
              </button>
            </div>
          ))}
          {connected.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No links yet</p>
          )}
        </div>
      </div>

      {person.isCenter && (
        <div className="sidebar-footer">
          <button className="btn-danger" onClick={() => onDelete(person.id)}>
            Remove network
          </button>
        </div>
      )}

      {!person.isSelf && !person.isCenter && (
        <div className="sidebar-footer">
          <button className="btn-ghost" style={{ width: '100%', marginBottom: 8 }} onClick={() => onUpdate({ ...person, isCenter: true })}>
            Make network center
          </button>
          <button className="btn-danger" onClick={() => onDelete(person.id)}>
            Remove person
          </button>
        </div>
      )}
    </div>
  )
}
