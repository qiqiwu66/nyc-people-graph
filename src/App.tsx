import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Graph } from './components/Graph'
import { Sidebar } from './components/Sidebar'
import { AddPersonForm } from './components/AddPersonForm'
import { loadGraph, saveGraph } from './store/people'
import type { AppGraphData, ConnectorNode, Person, RenderGraphData } from './types'
import './App.css'

const TOPBAR_HEIGHT = 53

function getNodeId(val: unknown): string {
  if (typeof val === 'object' && val !== null) return (val as Record<string, unknown>).id as string
  return val as string
}

function resolveVia(viaText: string | undefined, nodes: Person[]): { linkType?: string; viaPersonId?: string } {
  if (!viaText?.trim()) return {}
  const text = viaText.trim()
  const match = nodes.find((n) => !n.isSelf && n.name.toLowerCase() === text.toLowerCase())
  return match ? { viaPersonId: match.id } : { linkType: text }
}

function normalizeLinks(data: AppGraphData): AppGraphData {
  const nameToId = new Map(
    data.nodes.filter((n) => !n.isSelf).map((n) => [n.name.toLowerCase().trim(), n.id])
  )
  const hasMatch = data.links.some((l) => l.linkType && nameToId.has(l.linkType.toLowerCase().trim()))
  if (!hasMatch) return data
  return {
    ...data,
    links: data.links.map((l) => {
      if (!l.linkType) return l
      const matchId = nameToId.get(l.linkType.toLowerCase().trim())
      if (!matchId) return l
      const { linkType: _lt, ...rest } = l
      return { ...rest, viaPersonId: matchId }
    }),
  }
}

function buildRenderData(data: AppGraphData): RenderGraphData {
  const connectorMap = new Map<string, ConnectorNode>()
  const connectorLinkKeys = new Set<string>()
  const directLinks: Array<{ source: string; target: string }> = []
  const connectorLinks: Array<{ source: string; target: string }> = []

  for (const link of data.links) {
    const src = getNodeId(link.source)
    const tgt = getNodeId(link.target)
    if (link.viaPersonId) {
      // Route through existing person node — no connector pill created
      const k1 = `${src}|${link.viaPersonId}`
      const k2 = `${tgt}|${link.viaPersonId}`
      if (!connectorLinkKeys.has(k1)) { connectorLinkKeys.add(k1); connectorLinks.push({ source: src, target: link.viaPersonId }) }
      if (!connectorLinkKeys.has(k2)) { connectorLinkKeys.add(k2); connectorLinks.push({ source: tgt, target: link.viaPersonId }) }
    } else if (link.linkType) {
      const connId = `__conn__${link.linkType}`
      if (!connectorMap.has(connId)) {
        connectorMap.set(connId, { id: connId, isConnector: true, label: link.linkType })
      }
      const k1 = `${src}|${connId}`
      const k2 = `${tgt}|${connId}`
      if (!connectorLinkKeys.has(k1)) { connectorLinkKeys.add(k1); connectorLinks.push({ source: src, target: connId }) }
      if (!connectorLinkKeys.has(k2)) { connectorLinkKeys.add(k2); connectorLinks.push({ source: tgt, target: connId }) }
    } else {
      directLinks.push({ source: src, target: tgt })
    }
  }

  return {
    nodes: [...data.nodes, ...connectorMap.values()],
    links: [...directLinks, ...connectorLinks],
  }
}

function App() {
  const [graphData, setGraphData] = useState<AppGraphData>({ nodes: [], links: [] })
  const loaded = useRef(false)

  useEffect(() => {
    loadGraph().then((data) => {
      setGraphData(normalizeLinks(data))
      loaded.current = true
    })
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!loaded.current) return
    saveGraph(graphData)
  }, [graphData])

  const selectedPerson = graphData.nodes.find((n) => n.id === selectedId) ?? null

  function openAddForm() {
    setSelectedId(null)
    setAddingPerson(true)
    setPendingPersonId(null)
  }

  function handleBgDblClick(graphX: number, graphY: number) {
    const id = crypto.randomUUID()
    const newNode: Person = { id, name: '', tags: [], notes: '', fx: graphX, fy: graphY }
    setGraphData((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }))
    setPendingPersonId(id)
    setSelectedId(null)
    setAddingPerson(true)
  }

  // Live-update the pending node's name as the user types
  function handlePendingNameChange(name: string) {
    if (!pendingPersonId) return
    setGraphData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === pendingPersonId ? { ...n, name } : n)),
    }))
  }

  function createCenter() {
    const id = crypto.randomUUID()
    const newCenter: Person = { id, name: 'New network', tags: [], notes: '', isCenter: true }
    setGraphData((prev) => ({ ...prev, nodes: [...prev.nodes, newCenter] }))
    setAddingPerson(false)
    setSelectedId(id)
  }

  function handleFormAddMultiple(entries: Array<{ data: Omit<Person, 'id'>; viaText?: string }>, centerId = 'self') {
    setGraphData((prev) => {
      let { nodes, links } = prev
      for (const { data, viaText } of entries) {
        const id = crypto.randomUUID()
        const via = resolveVia(viaText, nodes)
        nodes = [...nodes, { ...data, id }]
        links = [...links, { source: centerId, target: id, ...via }]
      }
      return normalizeLinks({ nodes, links })
    })
    setAddingPerson(false)
  }

  function handleFormAdd(data: Omit<Person, 'id'>, viaText?: string, centerId = 'self') {
    const targetId = pendingPersonId ?? crypto.randomUUID()
    const via = resolveVia(viaText, graphData.nodes)
    if (pendingPersonId) {
      setGraphData((prev) => normalizeLinks({
        nodes: prev.nodes.map((n) => (n.id === targetId ? { ...n, ...data } : n)),
        links: [...prev.links, { source: centerId, target: targetId, ...via }],
      }))
      setPendingPersonId(null)
    } else {
      const newPerson: Person = { ...data, id: targetId }
      setGraphData((prev) => normalizeLinks({
        nodes: [...prev.nodes, newPerson],
        links: [...prev.links, { source: centerId, target: targetId, ...via }],
      }))
    }
    setAddingPerson(false)
  }

  function handleFormClose() {
    if (pendingPersonId) {
      const id = pendingPersonId
      setGraphData((prev) => ({
        nodes: prev.nodes.filter((n) => n.id !== id),
        links: prev.links.filter((l) => {
          const src = getNodeId(l.source)
          const tgt = getNodeId(l.target)
          return src !== id && tgt !== id
        }),
      }))
      setPendingPersonId(null)
    }
    setAddingPerson(false)
  }

  function updatePerson(updated: Person) {
    setGraphData((prev) => normalizeLinks({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === updated.id ? updated : n)),
    }))
  }

  function deletePerson(id: string) {
    setGraphData((prev) => ({
      nodes: prev.nodes.filter((n) => n.id !== id),
      links: prev.links.filter((l) => {
        const src = getNodeId(l.source)
        const tgt = getNodeId(l.target)
        return src !== id && tgt !== id
      }),
    }))
    setSelectedId(null)
  }

  function addLink(fromId: string, toId: string, viaText?: string) {
    const alreadyExists = graphData.links.some((l) => {
      const src = getNodeId(l.source)
      const tgt = getNodeId(l.target)
      return (src === fromId && tgt === toId) || (src === toId && tgt === fromId)
    })
    if (!alreadyExists) {
      const via = resolveVia(viaText, graphData.nodes)
      setGraphData((prev) => ({ ...prev, links: [...prev.links, { source: fromId, target: toId, ...via }] }))
    }
  }

  function updateLinkType(fromId: string, toId: string, viaText: string | undefined) {
    setGraphData((prev) => ({
      ...prev,
      links: prev.links.map((l) => {
        const src = getNodeId(l.source)
        const tgt = getNodeId(l.target)
        if ((src === fromId && tgt === toId) || (src === toId && tgt === fromId)) {
          const { linkType: _lt, viaPersonId: _vp, ...rest } = l
          return viaText?.trim() ? { ...rest, ...resolveVia(viaText, prev.nodes) } : rest
        }
        return l
      }),
    }))
  }

  function removeLink(fromId: string, toId: string) {
    setGraphData((prev) => ({
      ...prev,
      links: prev.links.filter((l) => {
        const src = getNodeId(l.source)
        const tgt = getNodeId(l.target)
        return !((src === fromId && tgt === toId) || (src === toId && tgt === fromId))
      }),
    }))
  }

  const handleNodeClick = useCallback((person: Person) => {
    setAddingPerson(false)
    setPendingPersonId(null)
    setSelectedId((prev) => (prev === person.id ? null : person.id))
  }, [])

  const filteredData = useMemo<AppGraphData>(() => {
    if (!search.trim()) return graphData
    const q = search.toLowerCase()
    const matchIds = new Set(
      graphData.nodes.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id),
    )
    return {
      nodes: graphData.nodes.filter((n) => matchIds.has(n.id)),
      links: graphData.links.filter((l) => {
        const src = getNodeId(l.source)
        const tgt = getNodeId(l.target)
        return matchIds.has(src) && matchIds.has(tgt)
      }),
    }
  }, [graphData, search])

  const renderData = useMemo(() => buildRenderData(filteredData), [filteredData])

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <span className="app-title">NYC People</span>
        </div>
        <div className="topbar-center">
          <input
            className="search-input"
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="topbar-right" style={{ gap: 8 }}>
          <button className="btn-ghost" onClick={createCenter}>
            + New network
          </button>
          <button className="btn-primary" onClick={openAddForm}>
            + Add person
          </button>
        </div>
      </div>

      <div className="graph-container">
        <Graph
          graphData={renderData}
          selectedId={selectedId}
          onNodeClick={handleNodeClick}
          onBgDblClick={handleBgDblClick}
          width={window.innerWidth}
          height={window.innerHeight - TOPBAR_HEIGHT}
        />
      </div>

      {addingPerson && (
        <AddPersonForm
          people={graphData.nodes.filter((n) => !n.isSelf && !n.isCenter)}
          centers={graphData.nodes.filter((n) => n.isSelf || n.isCenter)}
          onAdd={handleFormAdd}
          onAddMultiple={handleFormAddMultiple}
          onClose={handleFormClose}
          onNameChange={pendingPersonId ? handlePendingNameChange : undefined}
        />
      )}

      {!addingPerson && selectedPerson && (
        <Sidebar
          key={selectedPerson.id}
          person={selectedPerson}
          graphData={graphData}
          onClose={() => setSelectedId(null)}
          onUpdate={updatePerson}
          onDelete={deletePerson}
          onAddLink={addLink}
          onRemoveLink={removeLink}
          onUpdateLinkType={updateLinkType}
          onSelectPerson={setSelectedId}
        />
      )}
    </div>
  )
}

export default App
