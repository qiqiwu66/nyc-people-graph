import type { AppGraphData, Person } from '../types'

const SELF_NODE: Person = {
  id: 'self',
  name: 'You',
  tags: [],
  notes: '',
  isSelf: true,
  fx: 0,
  fy: 0,
}

export const SEED: AppGraphData = {
  nodes: [
    SELF_NODE,
    { id: '1', name: 'Maya Chen', tags: ['friend'], notes: 'Met at a ceramics class. Makes pottery on weekends.' },
    { id: '2', name: 'Jordan Price', tags: ['friend', 'colleague'], notes: 'Works at the same co-working space on Rivington.' },
    { id: '3', name: 'Priya Sharma', tags: ['friend'], notes: 'College friend, moved to NYC last year. Into climbing.' },
    { id: '4', name: 'Marcus Williams', tags: ['colleague'], notes: 'Met at a tech meetup in Midtown. Works in ML.' },
    { id: '5', name: 'Sofia Russo', tags: ['acquaintance'], notes: 'Friend of a friend. Works in film production.' },
    { id: '6', name: 'Alex Kim', tags: ['friend'], notes: 'Grew up together. Back in NYC after SF.' },
    { id: '7', name: 'Nadia Hassan', tags: ['friend'], notes: 'Book club. Recommends everything.' },
    { id: '8', name: 'Tom Rivera', tags: ['acquaintance'], notes: "Neighbor's friend. DJ, plays Output sometimes." },
  ],
  links: [
    { source: 'self', target: '1' },
    { source: 'self', target: '2' },
    { source: 'self', target: '3' },
    { source: 'self', target: '4' },
    { source: 'self', target: '5' },
    { source: 'self', target: '6' },
    { source: 'self', target: '7' },
    { source: 'self', target: '8' },
    { source: '1', target: '2' },
    { source: '1', target: '3' },
    { source: '1', target: '7' },
    { source: '2', target: '4' },
    { source: '2', target: '5' },
    { source: '3', target: '6' },
    { source: '3', target: '7' },
    { source: '5', target: '8' },
  ],
}

function normalizeSelf(data: AppGraphData): AppGraphData {
  const selfIdx = data.nodes.findIndex((n) => n.isSelf)
  if (selfIdx === -1) {
    data.nodes.unshift(SELF_NODE)
  } else {
    data.nodes[selfIdx] = { ...data.nodes[selfIdx], fx: 0, fy: 0 }
  }
  return data
}

export async function loadGraph(): Promise<AppGraphData> {
  try {
    const res = await fetch('/api/graph')
    if (!res.ok) return SEED
    const data: AppGraphData = await res.json()
    return normalizeSelf(data)
  } catch {
    return SEED
  }
}

export async function saveGraph(data: AppGraphData): Promise<void> {
  await fetch('/api/graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
