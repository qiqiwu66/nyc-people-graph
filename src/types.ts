export type Tag = 'friend' | 'colleague' | 'acquaintance' | 'family'

export interface Person {
  id: string
  name: string
  tags: Tag[]
  notes: string
  isSelf?: boolean
  isCenter?: boolean
  fx?: number | null
  fy?: number | null
}

export interface GraphLink {
  source: string
  target: string
  linkType?: string
  viaPersonId?: string
}

export interface ConnectorNode {
  id: string
  isConnector: true
  label: string
}

export type RenderNode = Person | ConnectorNode

export interface AppGraphData {
  nodes: Person[]
  links: GraphLink[]
}

export interface RenderGraphData {
  nodes: RenderNode[]
  links: Array<{ source: string; target: string }>
}
