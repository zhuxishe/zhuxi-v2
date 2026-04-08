/** University network data -- 1:1 from Remotion source.
 * buildScrollOrder returns frame-based activateFrame (not seconds). */

import type { Point2D } from './animation-utils'

export interface University {
  id: string; name: string; nameJp: string
  lat: number; lng: number; playerCount: number
}

export interface Connection { from: number; to: number }

export const UNIVERSITIES: University[] = [
  {id:'tus',name:'東京理科大学',nameJp:'東京理科大学',lat:35.700,lng:139.745,playerCount:3},
  {id:'mejiro',name:'目白大学',nameJp:'目白大学',lat:35.733,lng:139.707,playerCount:1},
  {id:'waseda',name:'早稲田大学',nameJp:'早稲田大学',lat:35.709,lng:139.719,playerCount:27},
  {id:'toyo',name:'東洋大学',nameJp:'東洋大学',lat:35.706,lng:139.728,playerCount:4},
  {id:'hosei',name:'法政大学',nameJp:'法政大学',lat:35.693,lng:139.742,playerCount:5},
  {id:'gakushuin',name:'学習院大学',nameJp:'学習院大学',lat:35.718,lng:139.711,playerCount:1},
  {id:'todai',name:'東京大学',nameJp:'東京大学',lat:35.713,lng:139.762,playerCount:9},
  {id:'komazawa',name:'駒澤大学',nameJp:'駒澤大学',lat:35.632,lng:139.661,playerCount:2},
  {id:'juntendo',name:'順天堂大学',nameJp:'順天堂大学',lat:35.700,lng:139.763,playerCount:4},
  {id:'musashino',name:'武蔵野大学',nameJp:'武蔵野大学',lat:35.717,lng:139.567,playerCount:2},
  {id:'seikei',name:'成蹊大学',nameJp:'成蹊大学',lat:35.713,lng:139.560,playerCount:1},
  {id:'tokyotech',name:'東京科学大学',nameJp:'東京科学大学',lat:35.604,lng:139.684,playerCount:2},
  {id:'joshibi',name:'女子美術大学',nameJp:'女子美術大学',lat:35.685,lng:139.580,playerCount:1},
  {id:'hitotsubashi',name:'一橋大学',nameJp:'一橋大学',lat:35.694,lng:139.434,playerCount:1},
  {id:'kyorin',name:'杏林大学',nameJp:'杏林大学',lat:35.699,lng:139.385,playerCount:1},
  {id:'chuo',name:'中央大学',nameJp:'中央大学',lat:35.620,lng:139.345,playerCount:1},
  {id:'sophia',name:'上智大学',nameJp:'上智大学',lat:35.683,lng:139.731,playerCount:1},
  {id:'titech',name:'東京工業大学',nameJp:'東京工業大学',lat:35.606,lng:139.683,playerCount:1},
  {id:'rikkyo',name:'立教大学',nameJp:'立教大学',lat:35.730,lng:139.704,playerCount:1},
  {id:'kyoritsu',name:'共立女子大学',nameJp:'共立女子大学',lat:35.695,lng:139.758,playerCount:1},
  {id:'tmu',name:'東京都立大学',nameJp:'東京都立大学',lat:35.619,lng:139.384,playerCount:1},
]

export const CONNECTIONS: Connection[] = [
  {from:2,to:5},{from:2,to:1},{from:2,to:18},{from:2,to:3},{from:2,to:0},
  {from:2,to:4},{from:2,to:6},{from:2,to:16},{from:2,to:8},{from:2,to:19},
  {from:2,to:7},{from:2,to:11},{from:2,to:17},{from:2,to:9},{from:2,to:10},
  {from:2,to:12},{from:2,to:13},{from:2,to:14},{from:2,to:15},{from:2,to:20},
]

const WASEDA_IDX = 2
const UNI_START = 10
const UNI_GAP = 9
const BOUNDS = { minLng: 139.32, maxLng: 139.80, minLat: 35.58, maxLat: 35.76 }

export function projectUniversities(w: number, h: number, padding = 80): Point2D[] {
  const { minLng, maxLng, minLat, maxLat } = BOUNDS
  const dW = w - padding * 2, dH = h - padding * 2
  const scale = Math.min(dW / (maxLng - minLng), dH / (maxLat - minLat))
  const oX = padding + (dW - (maxLng - minLng) * scale) / 2
  const oY = padding + (dH - (maxLat - minLat) * scale) / 2
  return UNIVERSITIES.map(u => ({
    x: oX + (u.lng - minLng) * scale,
    y: oY + (maxLat - u.lat) * scale,
  }))
}

/** particlesPerArc=15 matches Remotion computeNetworkParticles call */
export function computeNetworkParticles(screenPos: Point2D[], perArc = 15): Point2D[] {
  const pts: Point2D[] = []
  for (const c of CONNECTIONS) {
    const p1 = screenPos[c.from], p2 = screenPos[c.to]
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const cy = my - d * 0.3
    for (let i = 0; i <= perArc; i++) {
      const t = i / perArc
      pts.push({
        x: (1 - t) ** 2 * p1.x + 2 * (1 - t) * t * mx + t ** 2 * p2.x,
        y: (1 - t) ** 2 * p1.y + 2 * (1 - t) * t * cy + t ** 2 * p2.y,
      })
    }
  }
  for (const p of screenPos) pts.push({ x: p.x, y: p.y })
  return pts
}

/** Build scroll order sorted by distance from Waseda.
 * Returns frame-based activateFrame: UNI_START + i * UNI_GAP */
export function buildScrollOrder(screenPos: Point2D[]) {
  const origin = screenPos[WASEDA_IDX]
  const items = UNIVERSITIES.map((_, i) => ({
    idx: i,
    dist: Math.hypot(screenPos[i].x - origin.x, screenPos[i].y - origin.y),
    activateFrame: 0,
  }))
  items.sort((a, b) => a.dist - b.dist)
  items.forEach((item, i) => { item.activateFrame = UNI_START + i * UNI_GAP })
  return items
}
