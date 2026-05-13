import type { AppGraphData, Person } from '../types'
import seedData from './seed-data.json'

const LS_KEY = 'nyc-people-graph'

const SELF_NODE: Person = {
  id: 'self',
  name: 'You',
  tags: [],
  notes: '',
  isSelf: true,
  fx: 0,
  fy: 0,
}

export const SEED: AppGraphData = seedData as AppGraphData

function normalizeSelf(data: AppGraphData): AppGraphData {
  const hasOtherCenters = data.nodes.some((n) => n.isCenter)
  const selfIdx = data.nodes.findIndex((n) => n.isSelf)
  if (selfIdx === -1) {
    data.nodes.unshift(SELF_NODE)
  } else {
    data.nodes[selfIdx] = {
      ...data.nodes[selfIdx],
      fx: hasOtherCenters ? null : 0,
      fy: hasOtherCenters ? null : 0,
    }
  }
  return data
}

export async function loadGraph(): Promise<AppGraphData> {
  // Try file API (dev mode only)
  try {
    const res = await fetch('/api/graph')
    if (res.ok) {
      const data: AppGraphData = await res.json()
      return normalizeSelf(data)
    }
  } catch {
    // not available in production
  }
  // Fall back to localStorage
  const raw = localStorage.getItem(LS_KEY)
  if (raw) {
    try {
      return normalizeSelf(JSON.parse(raw))
    } catch {
      // corrupted, use seed
    }
  }
  return SEED
}

export async function saveGraph(data: AppGraphData): Promise<void> {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
  try {
    await fetch('/api/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch {
    // not available in production, localStorage is enough
  }
}
