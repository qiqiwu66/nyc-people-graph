import { useEffect, useRef } from 'react'
import ForceGraph_ from 'force-graph'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph = (ForceGraph_ as any).default ?? ForceGraph_
import type { ConnectorNode, Person, RenderGraphData, RenderNode } from '../types'

const ORANGE = '#D97757'
const NODE_RADIUS = 6   // 12px diameter
const SELF_RADIUS = 12  // 24px diameter
const MIN_ZOOM = 0.4
const MAX_ZOOM = 4
const RING_RADIUS = 90       // distance from each center to its ring nodes
const CENTER_SPACING = 300   // horizontal distance between adjacent centers

function isConnector(n: RenderNode): n is ConnectorNode {
  return 'isConnector' in n && n.isConnector === true
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

interface Props {
  graphData: RenderGraphData
  selectedId: string | null
  onNodeClick: (person: Person) => void
  onBgDblClick?: (graphX: number, graphY: number) => void
  width: number
  height: number
}

type FGNode = { id: string; x?: number; y?: number; fx?: number | null; fy?: number | null }

export function Graph({ graphData, selectedId, onNodeClick, onBgDblClick, width, height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ReturnType<typeof ForceGraph> | null>(null)
  const selectedIdRef = useRef(selectedId)
  const onNodeClickRef = useRef(onNodeClick)
  const onBgDblClickRef = useRef(onBgDblClick)
  const prevNodeCountRef = useRef(0)
  const dragNodeIdRef = useRef<string | null>(null)
  const tempPinnedRef = useRef(new Set<string>())
  const centerIdsRef = useRef(new Set<string>())
  const ringMapRef = useRef(new Map<string, Set<string>>())

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { onNodeClickRef.current = onNodeClick }, [onNodeClick])
  useEffect(() => { onBgDblClickRef.current = onBgDblClick }, [onBgDblClick])

  // Initialize once
  useEffect(() => {
    if (!containerRef.current) return
    const fg = ForceGraph()(containerRef.current)
    fgRef.current = fg

    fg.backgroundColor('#FAF9F5')
      .nodeId('id')
      .nodeLabel('')
      .nodeVal((node: unknown) => {
        const n = node as RenderNode
        if (isConnector(n)) return 2
        const p = n as Person
        const r = (p.isSelf || p.isCenter) ? SELF_RADIUS : NODE_RADIUS
        return (r / 4) * (r / 4)
      })
      .linkCanvasObjectMode(() => 'replace')
      .linkCanvasObject((link: unknown, ctx: CanvasRenderingContext2D) => {
        type LocNode = { x: number; y: number }
        const l = link as { source: LocNode; target: LocNode }
        if (l.source.x == null || l.target.x == null) return
        ctx.beginPath()
        ctx.moveTo(l.source.x, l.source.y)
        ctx.lineTo(l.target.x, l.target.y)
        ctx.strokeStyle = '#D9D5D0'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })
      .nodeCanvasObjectMode(() => 'replace')
      .nodePointerAreaPaint((node: unknown, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const n = node as RenderNode & { x: number; y: number }
        if (n.x == null || n.y == null) return
        if (isConnector(n)) return
        const p = n as Person & { x: number; y: number }
        if (p.isSelf) return  // original self node is not interactive
        const r = (p.isSelf || p.isCenter) ? SELF_RADIUS : NODE_RADIUS
        const fontSize = ((p.isSelf || p.isCenter) ? 12 : 11) / globalScale
        const labelWidth = p.name.length * fontSize * 0.6
        const hitWidth = Math.max(r * 2, labelWidth)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillRect(p.x - hitWidth / 2, p.y + r, hitWidth, fontSize + 6)
      })

    fg.enablePanInteraction(false)
    fg.minZoom(MIN_ZOOM)
    fg.maxZoom(MAX_ZOOM)
    fg.d3VelocityDecay(0.6)   // more friction → slower movement
    fg.d3AlphaDecay(0.04)     // cools faster → settles sooner
    fg.d3Force('charge')?.strength(-120)

    // Collision radius includes estimated label width; multiple iterations prevent overlaps
    type CollideNode = { name?: string; isSelf?: boolean; isCenter?: boolean; isConnector?: boolean }
    const collideForce = fg.d3Force('collide') as {
      radius: (fn: (n: unknown) => number) => void
      iterations: (n: number) => void
    } | undefined
    collideForce?.radius((node: unknown) => {
      const n = node as CollideNode
      if (n.isConnector) return 28
      const isC = n.isSelf || n.isCenter
      const r = isC ? SELF_RADIUS : NODE_RADIUS
      const labelW = (n.name?.length ?? 0) * (isC ? 6 : 5.5)
      return Math.max(r, labelW / 2) + 10
    })
    collideForce?.iterations(4)

    // Radial ring force — pulls each center's ring nodes to RING_RADIUS from that center
    type RingNode = FGNode & { vx: number; vy: number }
    let ringNodes: RingNode[] = []

    function getCenterPositions() {
      const pos = new Map<string, { x: number; y: number }>()
      for (const n of ringNodes) {
        if (centerIdsRef.current.has(n.id)) pos.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })
      }
      return pos
    }

    function ringForce(alpha: number) {
      const centerPos = getCenterPositions()
      for (const node of ringNodes) {
        for (const [centerId, memberIds] of ringMapRef.current) {
          if (!memberIds.has(node.id)) continue
          const cp = centerPos.get(centerId)
          if (!cp) continue
          const dx = (node.x ?? 0) - cp.x
          const dy = (node.y ?? 0) - cp.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const factor = (RING_RADIUS - dist) / dist * alpha * 0.6
          node.vx += dx * factor
          node.vy += dy * factor
        }
      }
    }
    ;(ringForce as typeof ringForce & { initialize: (n: RingNode[]) => void }).initialize =
      (nodes) => { ringNodes = nodes }
    fg.d3Force('ring', ringForce as never)

    // Angular spacing force — equalizes gaps between adjacent ring nodes per center
    function angularSpacingForce(alpha: number) {
      const centerPos = getCenterPositions()
      for (const [centerId, memberIds] of ringMapRef.current) {
        const cp = centerPos.get(centerId)
        if (!cp) continue
        const ringList = ringNodes.filter(n => memberIds.has(n.id))
        if (ringList.length < 2) continue
        ringList.sort((a, b) =>
          Math.atan2((a.y ?? 0) - cp.y, (a.x ?? 0) - cp.x) -
          Math.atan2((b.y ?? 0) - cp.y, (b.x ?? 0) - cp.x)
        )
        const N = ringList.length
        const step = (2 * Math.PI) / N
        for (let i = 0; i < N; i++) {
          const curr = ringList[i]
          const next = ringList[(i + 1) % N]
          const currAngle = Math.atan2((curr.y ?? 0) - cp.y, (curr.x ?? 0) - cp.x)
          let nextAngle = Math.atan2((next.y ?? 0) - cp.y, (next.x ?? 0) - cp.x)
          while (nextAngle <= currAngle) nextAngle += 2 * Math.PI
          const gap = nextAngle - currAngle
          const gapError = gap - step
          const strength = 0.25 * alpha
          const rCurr = Math.sqrt(((curr.x ?? 0) - cp.x) ** 2 + ((curr.y ?? 0) - cp.y) ** 2) || 1
          curr.vx += (-((curr.y ?? 0) - cp.y) / rCurr) * gapError * strength
          curr.vy += (((curr.x ?? 0) - cp.x) / rCurr) * gapError * strength
          const rNext = Math.sqrt(((next.x ?? 0) - cp.x) ** 2 + ((next.y ?? 0) - cp.y) ** 2) || 1
          next.vx -= (-((next.y ?? 0) - cp.y) / rNext) * gapError * strength
          next.vy -= (((next.x ?? 0) - cp.x) / rNext) * gapError * strength
        }
      }
    }
    ;(angularSpacingForce as typeof angularSpacingForce & { initialize: (n: RingNode[]) => void }).initialize =
      (nodes) => { ringNodes = nodes }
    fg.d3Force('angular', angularSpacingForce as never)

    // Center-spread force — arranges centers in a horizontal line at Y=0, evenly spaced, centroid at origin
    function centerSpreadForce(alpha: number) {
      const centerList = ringNodes.filter(n => centerIdsRef.current.has(n.id))
      if (centerList.length < 2) return
      centerList.sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
      const N = centerList.length
      for (let i = 0; i < N; i++) {
        const node = centerList[i]
        const targetX = CENTER_SPACING * (i - (N - 1) / 2)
        node.vx += (targetX - (node.x ?? 0)) * alpha * 0.5
        node.vy += (0 - (node.y ?? 0)) * alpha * 0.8
      }
    }
    ;(centerSpreadForce as typeof centerSpreadForce & { initialize: (n: RingNode[]) => void }).initialize =
      (nodes) => { ringNodes = nodes }
    fg.d3Force('centerSpread', centerSpreadForce as never)

    // Link distances — center-connections target RING_RADIUS so link + ring forces agree
    type LinkNode = { id?: string; isSelf?: boolean; isCenter?: boolean; isConnector?: boolean }
    const linkForce = fg.d3Force('link') as { distance: (fn: (l: unknown) => number) => void } | undefined
    linkForce?.distance((link: unknown) => {
      const l = link as { source: LinkNode; target: LinkNode }
      if (l.source.isSelf || l.target.isSelf || l.source.isCenter || l.target.isCenter) return RING_RADIUS
      if (l.source.isConnector || l.target.isConnector) return 80
      return NODE_RADIUS + NODE_RADIUS + 80
    })

    // Center once after first simulation stop
    let firstStop = true
    fg.onEngineStop(() => {
      if (!firstStop) return
      firstStop = false
      fg.centerAt(0, 0, 200)
    })

    // Zoom toward graph center (not mouse), then re-center
    const el = containerRef.current
    const canvas = el.querySelector('canvas') as HTMLCanvasElement | null
    if (canvas) {
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fg.zoom() * factor))
        fg.zoom(next, 0)
        fg.centerAt(0, 0, 0)
      }, { passive: false, capture: true })
    }

    // Pin other nodes when drag starts; unpin + reheat on release
    fg.onNodeDrag((node: unknown) => {
      const dragged = node as FGNode
      // Self is immovable only when it's the sole center
      if (dragged.id === 'self' && centerIdsRef.current.size <= 1) {
        dragged.fx = 0; dragged.fy = 0; return
      }
      if (dragNodeIdRef.current === dragged.id) return
      dragNodeIdRef.current = dragged.id
      const { nodes } = fg.graphData() as { nodes: FGNode[] }
      for (const n of nodes) {
        if (n.id !== dragged.id && n.fx == null) {
          n.fx = n.x ?? 0
          n.fy = n.y ?? 0
          tempPinnedRef.current.add(n.id)
        }
      }
    })

    fg.onNodeDragEnd((node: unknown) => {
      const dragged = node as FGNode
      if (dragged.id === 'self' && centerIdsRef.current.size <= 1) return
      dragNodeIdRef.current = null
      dragged.fx = null
      dragged.fy = null

      // Unpin temporarily frozen nodes
      const { nodes } = fg.graphData() as { nodes: FGNode[] }
      for (const n of nodes) {
        if (tempPinnedRef.current.has(n.id)) {
          n.fx = null
          n.fy = null
        }
      }
      tempPinnedRef.current.clear()

      // Reheat to redistribute
      fg.d3ReheatSimulation()
    })

    let lastNodeClickAt = 0
    fg.onNodeClick((node: unknown) => {
      lastNodeClickAt = Date.now()
      const n = node as RenderNode
      if (isConnector(n)) return
      const p = n as Person
      if (p.isSelf) return
      onNodeClickRef.current(p)
    })

    function handleDblClick(e: MouseEvent) {
      if (Date.now() - lastNodeClickAt < 300) return
      const rect = el.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const coords = (fg as never as { screen2GraphCoords: (x: number, y: number) => { x: number; y: number } })
        .screen2GraphCoords(screenX, screenY)
      onBgDblClickRef.current?.(coords.x, coords.y)
    }
    el.addEventListener('dblclick', handleDblClick)

    return () => {
      el.removeEventListener('dblclick', handleDblClick)
      fg._destructor?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const newCount = graphData.nodes.length
    const onlyLinksChanged = newCount === prevNodeCountRef.current
    prevNodeCountRef.current = newCount

    // Rebuild centerIdsRef and ringMapRef from current graph data
    const newCenterIds = new Set(
      graphData.nodes
        .filter((n): n is (typeof n & { id: string }) => !('isConnector' in n) && !!(n.isSelf || (n as Person).isCenter))
        .map((n) => n.id)
    )
    centerIdsRef.current = newCenterIds
    const newRingMap = new Map<string, Set<string>>()
    for (const cid of newCenterIds) newRingMap.set(cid, new Set())
    for (const link of graphData.links) {
      const src = link.source as string
      const tgt = link.target as string
      if (newCenterIds.has(src)) newRingMap.get(src)!.add(tgt)
      if (newCenterIds.has(tgt)) newRingMap.get(tgt)!.add(src)
    }
    ringMapRef.current = newRingMap

    // When multiple centers exist, strip fx/fy from all center nodes so the
    // centerSpreadForce controls their positions instead of the data pinning them.
    const simGraphData = newCenterIds.size > 1
      ? { ...graphData, nodes: graphData.nodes.map(n => newCenterIds.has(n.id) ? { ...n, fx: null, fy: null } : n) }
      : graphData

    if (onlyLinksChanged) {
      // Pin all free nodes so link forces can't move them
      const { nodes } = fg.graphData() as { nodes: FGNode[] }
      const tempPinned: FGNode[] = []
      for (const n of nodes) {
        if (n.fx == null) { n.fx = n.x ?? 0; n.fy = n.y ?? 0; tempPinned.push(n) }
      }
      const savedDecay = fg.d3AlphaDecay()
      fg.d3AlphaDecay(1)
      fg.graphData(simGraphData as never)
      requestAnimationFrame(() => {
        fg.d3AlphaDecay(savedDecay)
        for (const n of tempPinned) { n.fx = null; n.fy = null }
      })
    } else {
      fg.graphData(simGraphData as never)
    }
  }, [graphData])

  useEffect(() => {
    fgRef.current?.width(width).height(height)
  }, [width, height])

  // Repaint nodes when selection changes
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.nodeCanvasObject((node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as RenderNode & { x: number; y: number }
      if (n.x == null || n.y == null) return

      // ── Connector pill ──
      if (isConnector(n)) {
        const fontSize = Math.max(11 / globalScale, 2)
        ctx.font = `500 ${fontSize}px Inter, -apple-system, sans-serif`
        const textWidth = ctx.measureText(n.label).width
        const padH = 7 / globalScale
        const padV = 3.5 / globalScale
        const w = textWidth + padH * 2
        const h = fontSize + padV * 2
        const rx = h / 2
        drawRoundRect(ctx, n.x - w / 2, n.y - h / 2, w, h, rx)
        ctx.fillStyle = '#F0EBF8'
        ctx.fill()
        ctx.strokeStyle = '#C4B8E0'
        ctx.lineWidth = 1 / globalScale
        ctx.stroke()
        ctx.fillStyle = '#7C5CBF'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(n.label, n.x, n.y)
        return
      }

      // ── Person node ──
      const p = n as Person & { x: number; y: number }
      const isSelected = p.id === selectedIdRef.current

      if (p.isSelf || p.isCenter) {
        const r = SELF_RADIUS
        if (isSelected) {
          const glow = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r + 20)
          glow.addColorStop(0, ORANGE + '55')
          glow.addColorStop(1, ORANGE + '00')
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 20, 0, 2 * Math.PI)
          ctx.fillStyle = glow
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI)
        ctx.fillStyle = '#FFFFFF'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI)
        ctx.strokeStyle = isSelected ? ORANGE : ORANGE + 'bb'
        ctx.lineWidth = isSelected ? 2.5 : 2
        ctx.stroke()
        if (p.name) {
          const fontSize = Math.max(12 / globalScale, 2.5)
          ctx.font = `600 ${fontSize}px Inter, -apple-system, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.lineJoin = 'round'
          ctx.lineWidth = 2 / globalScale
          ctx.strokeStyle = '#FAF9F5'
          ctx.strokeText(p.name, p.x, p.y + r + 4)
          ctx.fillStyle = '#1A1A1A'
          ctx.fillText(p.name, p.x, p.y + r + 4)
        }
        return
      }

      const r = NODE_RADIUS
      if (isSelected) {
        const glow = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r + 14)
        glow.addColorStop(0, ORANGE + '44')
        glow.addColorStop(1, ORANGE + '00')
        ctx.beginPath()
        ctx.arc(p.x, p.y, r + 14, 0, 2 * Math.PI)
        ctx.fillStyle = glow
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, 2 * Math.PI)
      ctx.strokeStyle = isSelected ? ORANGE : '#C8C4BF'
      ctx.lineWidth = isSelected ? 2 : 1.5
      ctx.stroke()
      if (p.name) {
        const fontSize = Math.max(11 / globalScale, 2)
        ctx.font = `${fontSize}px Inter, -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4 / globalScale
        ctx.strokeStyle = '#FAF9F5'
        ctx.strokeText(p.name, p.x, p.y + r + 3)
        ctx.fillStyle = isSelected ? ORANGE : '#4A4A4A'
        ctx.fillText(p.name, p.x, p.y + r + 3)
      }
    })
  }, [selectedId])

  return <div ref={containerRef} />
}
