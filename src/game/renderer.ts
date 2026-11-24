import {
  Collectible,
  FloatingText,
  Lane,
  Obstacle,
  Particle,
  PlayerState,
  SheruSkin,
} from './types';

interface ProjectedPoint {
  x: number;
  y: number;
  scale: number;
}

export interface RenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  worldScroll: number;
  distance: number;
  player: PlayerState;
  skin: SheruSkin;
  obstacles: Obstacle[];
  collectibles: Collectible[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  shakeOffset: { x: number; y: number };
  time: number;
}

const DEPTH_K = 5.2;
const MAX_DF = 1 / (1 + DEPTH_K);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  const pa = parseInt(hexA.slice(1), 16);
  const pb = parseInt(hexB.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const b = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${b})`;
}

export function project(
  laneFloat: number,
  z: number,
  width: number,
  height: number
): ProjectedPoint {
  const horizonY = height * 0.27;
  const groundY = height * 0.85;
  const df = 1 / (1 + Math.max(-0.14, z) * DEPTH_K);
  const t = (df - MAX_DF) / (1 - MAX_DF);
  const scale = 0.14 + t * 0.86;
  const y = horizonY + t * (groundY - horizonY);

  const halfTrackBottom = Math.min(width * 0.42, 270);
  const laneSpacing = (halfTrackBottom * 2) / 3;
  const x = width * 0.5 + (laneFloat - 1) * laneSpacing * scale;

  return { x, y, scale };
}

export function getLaneWidthAtZ(z: number, width: number, height: number): number {
  const p0 = project(0, z, width, height);
  const p1 = project(1, z, width, height);
  return Math.abs(p1.x - p0.x);
}

export function renderGame(params: RenderParams): void {
  const {
    ctx,
    width,
    height,
    worldScroll,
    distance,
    player,
    skin,
    obstacles,
    collectibles,
    particles,
    floatingTexts,
    shakeOffset,
    time,
  } = params;

  ctx.save();
  ctx.translate(shakeOffset.x, shakeOffset.y);

  const horizonY = height * 0.27;

  // Cycle sky slowly over distance: Day -> Sunset -> Night -> Day
  const cycle = (distance / 900) % 3;
  let skyTop = '#4FA9E8';
  let skyBottom = '#FDE68A';
  let grassNear = '#2E7D32';
  let grassFar = '#1B5E20';
  let isNight = false;

  if (cycle < 1) {
    const t = Math.max(0, (cycle - 0.6) / 0.4);
    skyTop = lerpColor('#4FA9E8', '#E65100', t);
    skyBottom = lerpColor('#FDE68A', '#FFAB40', t);
    grassNear = lerpColor('#2E7D32', '#2B5B2E', t);
    grassFar = lerpColor('#1B5E20', '#163D19', t);
  } else if (cycle < 2) {
    const t = Math.max(0, (cycle - 1.5) / 0.5);
    skyTop = lerpColor('#E65100', '#0F172A', t);
    skyBottom = lerpColor('#FFAB40', '#312E81', t);
    grassNear = lerpColor('#2B5B2E', '#133827', t);
    grassFar = lerpColor('#163D19', '#0B2218', t);
    isNight = t > 0.45;
  } else {
    const t = Math.max(0, (cycle - 2.5) / 0.5);
    skyTop = lerpColor('#0F172A', '#4FA9E8', t);
    skyBottom = lerpColor('#312E81', '#FDE68A', t);
    grassNear = lerpColor('#133827', '#2E7D32', t);
    grassFar = lerpColor('#0B2218', '#1B5E20', t);
    isNight = t < 0.55;
  }

  // 1. Sky backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY + 12);
  skyGrad.addColorStop(0, skyTop);
  skyGrad.addColorStop(1, skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-20, -20, width + 40, horizonY + 32);

  // Sun or Moon
  const sunX = width * 0.78;
  const sunY = horizonY * 0.42;
  ctx.beginPath();
  ctx.arc(sunX, sunY, Math.min(width, height) * 0.055, 0, Math.PI * 2);
  ctx.fillStyle = isNight ? 'rgba(241, 245, 249, 0.92)' : 'rgba(255, 243, 176, 0.92)';
  ctx.fill();

  // Soft clouds / stars
  if (isNight) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 197 + 43) % 100) * 0.01 * width;
      const sy = ((i * 89 + 17) % 75) * 0.01 * horizonY;
      ctx.fillRect(sx, sy, 2, 2);
    }
  } else {
    drawClouds(ctx, width, horizonY, time);
  }

  // 2. Distant Indian railway city skyline
  drawSkyline(ctx, width, horizonY, isNight);

  // 3. Green ground embankments
  const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
  groundGrad.addColorStop(0, grassFar);
  groundGrad.addColorStop(1, grassNear);
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-20, horizonY, width + 40, height - horizonY + 20);

  // 4. 3-Lane Railway Track Bed
  drawRailwayTracks(ctx, width, height, worldScroll);

  // 5. Roadside electric poles & trees
  drawRoadsideScenery(ctx, width, height, worldScroll, isNight);

  // 6. Depth-sorted Obstacles, Collectibles, and Sheru Bhai
  type DrawItem =
    | { kind: 'OBSTACLE'; z: number; data: Obstacle }
    | { kind: 'COLLECTIBLE'; z: number; data: Collectible }
    | { kind: 'PLAYER'; z: number };

  const playerSortZ =
    player.y > 0.35 || player.floorY > 0.15 ? -0.35 : 0.001;
  const items: DrawItem[] = [{ kind: 'PLAYER', z: playerSortZ }];

  for (const obs of obstacles) {
    if (obs.z > -0.35 && obs.z <= 1.05) {
      items.push({ kind: 'OBSTACLE', z: obs.z, data: obs });
    }
  }
  for (const col of collectibles) {
    if (!col.collected && col.z > -0.15 && col.z <= 1.02) {
      // Ensure coins sitting on train roofs draw after the train body
      const sortZ = col.yOffset > 0.5 ? col.z - 0.32 : col.z;
      items.push({ kind: 'COLLECTIBLE', z: sortZ, data: col });
    }
  }

  // Draw furthest first
  items.sort((a, b) => b.z - a.z);

  for (const item of items) {
    if (item.kind === 'OBSTACLE') {
      drawObstacle(ctx, item.data, width, height, time, isNight);
    } else if (item.kind === 'COLLECTIBLE') {
      drawCollectible(ctx, item.data, width, height, time);
    } else {
      drawSheruPlayer(ctx, player, skin, width, height, time);
    }
  }

  // 7. Particles (dust, sparkles, shield shatter)
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 8. Floating score / bonus text
  for (const ft of floatingTexts) {
    const alpha = Math.max(0, ft.life / ft.maxLife);
    ctx.globalAlpha = alpha;
    ctx.font = '800 18px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  time: number
) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 0.28 * width + time * 8) % (width + 180)) - 90;
    const cy = horizonY * (0.28 + (i % 2) * 0.16);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 48, 15, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 24, cy - 8, 30, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 22, cy - 5, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSkyline(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  isNight: boolean
) {
  // Distant atmospheric mountain ridge
  ctx.fillStyle = isNight ? 'rgba(30, 41, 59, 0.7)' : 'rgba(100, 116, 139, 0.32)';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  const hillSteps = 8;
  for (let i = 0; i <= hillSteps; i++) {
    const hx = (i / hillSteps) * width;
    const hy = horizonY - (22 + Math.sin(i * 1.45) * 16 + Math.cos(i * 2.1) * 10);
    ctx.lineTo(hx, hy);
  }
  ctx.lineTo(width, horizonY);
  ctx.closePath();
  ctx.fill();

  const buildingColors = isNight
    ? ['#1E293B', '#283548', '#334155']
    : ['#475569', '#52637A', '#64748B'];

  const count = 16;
  const step = width / count;
  const centerIdx = Math.floor(count / 2);

  for (let i = 0; i <= count; i++) {
    const bw = step * 0.94;
    const bh = 20 + ((i * 41) % 38);
    const bx = i * step;

    if (i === centerIdx || i === centerIdx - 1) {
      // Grand Indian Heritage Railway Station facade in the center
      ctx.fillStyle = isNight ? '#3B2F2F' : '#B45309';
      ctx.fillRect(bx, horizonY - 36, bw, 38);

      // Station dome & minaret spire
      ctx.fillStyle = isNight ? '#475569' : '#D97706';
      ctx.beginPath();
      ctx.arc(bx + bw / 2, horizonY - 36, bw * 0.36, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(bx + bw / 2 - 2, horizonY - 36 - bw * 0.45, 4, bw * 0.14);

      // Arched station windows
      ctx.fillStyle = isNight ? '#FDE047' : '#FEF3C7';
      for (let w = 0; w < 3; w++) {
        ctx.beginPath();
        ctx.arc(bx + bw * (0.22 + w * 0.28), horizonY - 16, 3.5, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(bx + bw * (0.22 + w * 0.28) - 3.5, horizonY - 16, 7, 9);
      }
      continue;
    }

    ctx.fillStyle = buildingColors[i % buildingColors.length];
    ctx.fillRect(bx, horizonY - bh, bw, bh + 2);

    // Rooftop water tank / antenna silhouette on select buildings
    if (i % 4 === 1) {
      ctx.fillRect(bx + bw * 0.35, horizonY - bh - 7, bw * 0.3, 7);
    }

    if (isNight) {
      ctx.fillStyle = '#FDE047';
      for (let wy = horizonY - bh + 5; wy < horizonY - 6; wy += 8) {
        for (let wx = bx + 5; wx < bx + bw - 6; wx += 9) {
          if ((wx + wy + i) % 3 !== 0) {
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      for (let wy = horizonY - bh + 6; wy < horizonY - 7; wy += 9) {
        for (let wx = bx + 6; wx < bx + bw - 7; wx += 10) {
          if ((wx + i) % 2 === 0) {
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
    }
  }

  // Warm atmospheric horizon glow strip
  ctx.fillStyle = isNight ? 'rgba(99, 102, 241, 0.16)' : 'rgba(254, 243, 199, 0.26)';
  ctx.fillRect(0, horizonY - 6, width, 10);
}

function drawRailwayTracks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldScroll: number
) {
  const pTopL = project(-0.62, 1.0, width, height);
  const pTopR = project(2.62, 1.0, width, height);
  const pBotL = project(-0.62, -0.14, width, height);
  const pBotR = project(2.62, -0.14, width, height);

  // Outer concrete platform shoulders
  const kerbTopL = project(-0.76, 1.0, width, height);
  const kerbTopR = project(2.76, 1.0, width, height);
  const kerbBotL = project(-0.76, -0.14, width, height);
  const kerbBotR = project(2.76, -0.14, width, height);

  ctx.fillStyle = '#64748B';
  ctx.beginPath();
  ctx.moveTo(kerbTopL.x, kerbTopL.y);
  ctx.lineTo(pTopL.x, pTopL.y);
  ctx.lineTo(pBotL.x, pBotL.y);
  ctx.lineTo(kerbBotL.x, kerbBotL.y);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pTopR.x, pTopR.y);
  ctx.lineTo(kerbTopR.x, kerbTopR.y);
  ctx.lineTo(kerbBotR.x, kerbBotR.y);
  ctx.lineTo(pBotR.x, pBotR.y);
  ctx.closePath();
  ctx.fill();

  // Ballast gravel bed trapezoid
  const bedGrad = ctx.createLinearGradient(0, pTopL.y, 0, pBotL.y);
  bedGrad.addColorStop(0, '#334155');
  bedGrad.addColorStop(0.5, '#475569');
  bedGrad.addColorStop(1, '#3B4252');

  ctx.fillStyle = bedGrad;
  ctx.beginPath();
  ctx.moveTo(pTopL.x, pTopL.y);
  ctx.lineTo(pTopR.x, pTopR.y);
  ctx.lineTo(pBotR.x, pBotR.y);
  ctx.lineTo(pBotL.x, pBotL.y);
  ctx.closePath();
  ctx.fill();

  // Yellow outer safety edge stripes
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pTopL.x, pTopL.y);
  ctx.lineTo(pBotL.x, pBotL.y);
  ctx.moveTo(pTopR.x, pTopR.y);
  ctx.lineTo(pBotR.x, pBotR.y);
  ctx.stroke();

  // Wooden sleepers scrolling toward camera
  const sleeperSpacing = 0.055;
  const offset = (worldScroll * 0.45) % sleeperSpacing;
  for (let z = 1.0; z > -0.12; z -= sleeperSpacing) {
    const sz = z - offset;
    if (sz < -0.12 || sz > 1.0) continue;
    const alpha = Math.min(1, (1.02 - sz) * 2.5);
    ctx.fillStyle = `rgba(92, 64, 51, ${0.88 * alpha})`;

    for (let lane = 0; lane < 3; lane++) {
      const left = project(lane - 0.36, sz, width, height);
      const right = project(lane + 0.36, sz, width, height);
      const thick = Math.max(1.5, left.scale * 7);
      ctx.fillRect(left.x, left.y - thick / 2, right.x - left.x, thick);
    }
  }

  // Steel rails for each of the 3 lanes
  for (let lane = 0; lane < 3; lane++) {
    for (const rOff of [-0.28, 0.28]) {
      const top = project(lane + rOff, 1.0, width, height);
      const bot = project(lane + rOff, -0.14, width, height);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bot.x, bot.y);
      ctx.stroke();
    }
  }

  // Dashed lane dividers between lane 0|1 and 1|2
  for (const divLane of [0.5, 1.5]) {
    const dashStep = 0.09;
    const dashOffset = (worldScroll * 0.45) % dashStep;
    for (let z = 0.96; z > -0.1; z -= dashStep) {
      const zStart = z - dashOffset;
      const zEnd = zStart - dashStep * 0.48;
      if (zStart > 1.0 || zEnd < -0.14) continue;
      const p1 = project(divLane, Math.min(1.0, zStart), width, height);
      const p2 = project(divLane, Math.max(-0.14, zEnd), width, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = Math.max(1.5, p2.scale * 3.5);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
}

function drawRoadsideScenery(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldScroll: number,
  isNight: boolean
) {
  const step = 0.22;
  const scrollSteps = Math.floor((worldScroll * 0.45) / step);
  const offset = (worldScroll * 0.45) % step;

  for (let idx = 0; idx < 5; idx++) {
    const sz = 0.98 - idx * step - offset;
    if (sz <= 0.0 || sz > 0.98) continue;
    const worldIdx = idx + scrollSteps;

    for (const side of [-1.02, 3.02]) {
      const p = project(side, sz, width, height);
      const s = p.scale;

      // Overhead catenary / lamp pole
      const poleH = 165 * s;
      const poleW = Math.max(2, 6 * s);
      ctx.fillStyle = '#64748B';
      ctx.fillRect(p.x - poleW / 2, p.y - poleH, poleW, poleH);

      // Arm toward track
      const armDir = side < 1 ? 1 : -1;
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(p.x, p.y - poleH + 6 * s, armDir * 36 * s, Math.max(1.5, 4 * s));

      if (isNight) {
        ctx.fillStyle = 'rgba(254, 240, 138, 0.26)';
        ctx.beginPath();
        ctx.arc(p.x + armDir * 34 * s, p.y - poleH + 10 * s, Math.max(5, 14 * s), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(p.x + armDir * 34 * s, p.y - poleH + 10 * s, Math.max(2, 5 * s), 0, Math.PI * 2);
        ctx.fill();
      }

      // Alternating Coconut Palm Tree vs Neem Tree vs Station Board
      const treeP = project(side < 1 ? -1.58 : 3.58, sz, width, height);
      const ts = treeP.scale;

      if (worldIdx % 3 === 0 && side < 1) {
        // Yellow Indian Railway Station Nameboard!
        const bw = 66 * ts;
        const bh = 28 * ts;
        ctx.fillStyle = '#475569';
        ctx.fillRect(treeP.x - bw * 0.35, treeP.y - 42 * ts, 4 * ts, 42 * ts);
        ctx.fillRect(treeP.x + bw * 0.35 - 4 * ts, treeP.y - 42 * ts, 4 * ts, 42 * ts);
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = Math.max(1, 2 * ts);
        ctx.fillRect(treeP.x - bw / 2, treeP.y - 42 * ts - bh, bw, bh);
        ctx.strokeRect(treeP.x - bw / 2, treeP.y - 42 * ts - bh, bw, bh);
        if (bw > 26) {
          ctx.fillStyle = '#111827';
          ctx.font = `900 ${Math.max(5, Math.round(9 * ts))}px Outfit, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('SHERU JN', treeP.x, treeP.y - 42 * ts - bh * 0.35);
        }
      } else if (worldIdx % 2 === 0) {
        // Indian Coconut Palm Tree
        ctx.strokeStyle = '#6D4C41';
        ctx.lineWidth = Math.max(2, 7 * ts);
        ctx.lineCap = 'round';
        const leanX = side < 1 ? -10 * ts : 10 * ts;
        ctx.beginPath();
        ctx.moveTo(treeP.x, treeP.y);
        ctx.quadraticCurveTo(treeP.x + leanX * 0.4, treeP.y - 52 * ts, treeP.x + leanX, treeP.y - 98 * ts);
        ctx.stroke();

        const topX = treeP.x + leanX;
        const topY = treeP.y - 98 * ts;
        ctx.fillStyle = isNight ? '#14532D' : '#15803D';
        for (let f = 0; f < 5; f++) {
          const ang = -Math.PI + (f / 4) * Math.PI + (f % 2 === 0 ? 0.15 : -0.15);
          ctx.beginPath();
          ctx.ellipse(
            topX + Math.cos(ang) * 20 * ts,
            topY + Math.sin(ang) * 8 * ts + 6 * ts,
            22 * ts,
            5.5 * ts,
            ang * 0.45,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      } else {
        // Lush Neem / Banyan Tree
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(treeP.x - 4 * ts, treeP.y - 82 * ts, 8 * ts, 82 * ts);
        ctx.fillStyle = isNight ? '#14532D' : '#16A34A';
        ctx.beginPath();
        ctx.arc(treeP.x, treeP.y - 92 * ts, 29 * ts, 0, Math.PI * 2);
        ctx.arc(treeP.x - 18 * ts, treeP.y - 78 * ts, 21 * ts, 0, Math.PI * 2);
        ctx.arc(treeP.x + 18 * ts, treeP.y - 78 * ts, 21 * ts, 0, Math.PI * 2);
        ctx.fill();
        if (!isNight) {
          ctx.fillStyle = '#22C55E';
          ctx.beginPath();
          ctx.arc(treeP.x - 6 * ts, treeP.y - 98 * ts, 14 * ts, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  width: number,
  height: number,
  time: number,
  isNight: boolean
) {
  if (obs.type === 'TRAIN' || obs.type === 'MOVING_TRAIN') {
    drawTrain(ctx, obs, width, height, time, isNight);
  } else if (obs.type === 'LOW_BARRIER') {
    drawLowBarrier(ctx, obs, width, height);
  } else {
    drawHighGantry(ctx, obs, width, height);
  }
}

function drawTrain(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  width: number,
  height: number,
  time: number,
  isNight: boolean
) {
  const zFront = Math.max(-0.14, obs.z);
  const zBack = Math.min(1.02, obs.z + obs.length);
  if (zBack <= zFront) return;

  const frontP = project(obs.lane, zFront, width, height);
  const backP = project(obs.lane, zBack, width, height);
  const fw = getLaneWidthAtZ(zFront, width, height) * 0.86;
  const bw = getLaneWidthAtZ(zBack, width, height) * 0.86;
  const fh = fw * 1.06;
  const bh = bw * 1.06;

  const fl = frontP.x - fw / 2;
  const fr = frontP.x + fw / 2;
  const ft = frontP.y - fh;
  const fb = frontP.y;

  const bl = backP.x - bw / 2;
  const br = backP.x + bw / 2;
  const bt = backP.y - bh;
  const bb = backP.y;

  const isExpress = obs.colorScheme % 2 === 0;
  const bodyMain = isExpress ? '#1D4ED8' : '#B91C1C';
  const bodyStripe = isExpress ? '#FACC15' : '#FDE68A';
  const sideDark = isExpress ? '#1E3A8A' : '#7F1D1D';
  const roofColor = '#CBD5E1';

  // Draw visible side wall toward center lane
  ctx.fillStyle = sideDark;
  if (obs.lane === 0) {
    ctx.beginPath();
    ctx.moveTo(fr, ft);
    ctx.lineTo(br, bt);
    ctx.lineTo(br, bb);
    ctx.lineTo(fr, fb);
    ctx.closePath();
    ctx.fill();
  } else if (obs.lane === 2) {
    ctx.beginPath();
    ctx.moveTo(fl, ft);
    ctx.lineTo(bl, bt);
    ctx.lineTo(bl, bb);
    ctx.lineTo(fl, fb);
    ctx.closePath();
    ctx.fill();
  }

  // Roof
  ctx.fillStyle = roofColor;
  ctx.beginPath();
  ctx.moveTo(fl, ft);
  ctx.lineTo(bl, bt);
  ctx.lineTo(br, bt);
  ctx.lineTo(fr, ft);
  ctx.closePath();
  ctx.fill();

  // Front face
  ctx.fillStyle = bodyMain;
  ctx.beginPath();
  ctx.roundRect(fl, ft, fw, fh, Math.max(3, 10 * frontP.scale));
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, 2 * frontP.scale);
  ctx.stroke();

  // Yellow/Gold front stripe
  ctx.fillStyle = bodyStripe;
  ctx.fillRect(fl + 2 * frontP.scale, ft + fh * 0.56, fw - 4 * frontP.scale, fh * 0.12);

  // Windshield
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.roundRect(
    fl + fw * 0.14,
    ft + fh * 0.18,
    fw * 0.72,
    fh * 0.28,
    Math.max(2, 5 * frontP.scale)
  );
  ctx.fill();

  // Windshield reflection
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(fl + fw * 0.2, ft + fh * 0.2);
  ctx.lineTo(fl + fw * 0.42, ft + fh * 0.2);
  ctx.lineTo(fl + fw * 0.26, ft + fh * 0.44);
  ctx.lineTo(fl + fw * 0.16, ft + fh * 0.44);
  ctx.closePath();
  ctx.fill();

  // Destination board
  if (fw > 38) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(fl + fw * 0.22, ft + fh * 0.05, fw * 0.56, fh * 0.1);
    ctx.fillStyle = '#FFCC00';
    ctx.font = `800 ${Math.max(6, Math.round(10 * frontP.scale))}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      obs.type === 'MOVING_TRAIN' ? 'FAST EXP' : 'SHERU EXP',
      frontP.x,
      ft + fh * 0.125
    );
  }

  // Twin headlights (fast layered glow for 60fps mobile performance)
  const pulse = obs.type === 'MOVING_TRAIN' ? 0.75 + 0.25 * Math.sin(time * 18) : 0.85;
  for (const lx of [fl + fw * 0.22, fr - fw * 0.22]) {
    const ly = ft + fh * 0.77;
    const r = Math.max(2.5, fw * 0.085);
    if (obs.type === 'MOVING_TRAIN' || isNight) {
      ctx.fillStyle = `rgba(254, 240, 138, ${0.22 * pulse})`;
      ctx.beginPath();
      ctx.arc(lx, ly, r * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(254, 240, 138, ${0.42 * pulse})`;
      ctx.beginPath();
      ctx.arc(lx, ly, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = obs.type === 'MOVING_TRAIN' ? '#FEF08A' : '#FDE047';
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cowcatcher / lower bumper
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(fl + fw * 0.08, fb - fh * 0.09, fw * 0.84, fh * 0.09);

  // Sloped Boarding Ramp in front of train (allows running onto train roof!)
  if (obs.hasRamp && obs.rampLength && obs.z > -0.1) {
    const rampStartZ = Math.max(-0.14, obs.z - obs.rampLength);
    const rp = project(obs.lane, rampStartZ, width, height);
    const rw = getLaneWidthAtZ(rampStartZ, width, height) * 0.78;
    const rl = rp.x - rw / 2;
    const rr = rp.x + rw / 2;
    const topL = fl + fw * 0.06;
    const topR = fr - fw * 0.06;

    // Ramp side skirt
    ctx.fillStyle = '#B45309';
    ctx.beginPath();
    ctx.moveTo(rl, rp.y);
    ctx.lineTo(topL, fb);
    ctx.lineTo(topL, ft + 4 * frontP.scale);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(rr, rp.y);
    ctx.lineTo(topR, fb);
    ctx.lineTo(topR, ft + 4 * frontP.scale);
    ctx.closePath();
    ctx.fill();

    // Main yellow sloped ramp deck
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = Math.max(1.5, 2 * frontP.scale);
    ctx.beginPath();
    ctx.moveTo(rl, rp.y);
    ctx.lineTo(rr, rp.y);
    ctx.lineTo(topR, ft + 4 * frontP.scale);
    ctx.lineTo(topL, ft + 4 * frontP.scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Grip rungs + upward arrow cues along the ramp
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = Math.max(1.5, 2.5 * frontP.scale);
    for (let step = 0.25; step <= 0.8; step += 0.25) {
      const lx = lerp(rl, topL, step);
      const rx = lerp(rr, topR, step);
      const sy = lerp(rp.y, ft + 4 * frontP.scale, step);
      ctx.beginPath();
      ctx.moveTo(lx + (rx - lx) * 0.1, sy);
      ctx.lineTo(rx - (rx - lx) * 0.1, sy);
      ctx.stroke();
    }
  }
}

function drawLowBarrier(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  width: number,
  height: number
) {
  const p = project(obs.lane, obs.z, width, height);
  const w = getLaneWidthAtZ(obs.z, width, height) * 0.86;
  const h = w * 0.44;
  const x = p.x - w / 2;
  const y = p.y - h;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 2 * p.scale, w * 0.48, 5 * p.scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Support legs
  ctx.fillStyle = '#FACC15';
  const legW = Math.max(2, w * 0.08);
  ctx.fillRect(x + w * 0.1, y + h * 0.3, legW, h * 0.7);
  ctx.fillRect(x + w - w * 0.1 - legW, y + h * 0.3, legW, h * 0.7);

  // Hazard plank
  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h * 0.55, Math.max(2, 4 * p.scale));
  ctx.fill();

  // White diagonal stripes
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h * 0.55, Math.max(2, 4 * p.scale));
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  const stripeW = w * 0.14;
  for (let sx = x - h; sx < x + w + h; sx += stripeW * 2) {
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + stripeW, y);
    ctx.lineTo(sx + stripeW - h * 0.45, y + h * 0.55);
    ctx.lineTo(sx - h * 0.45, y + h * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Clear "UP" jump arrow cue
  if (w > 34) {
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(p.x, y + h * 0.27, Math.max(6, w * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFCC00';
    ctx.lineWidth = Math.max(1.5, 2.5 * p.scale);
    ctx.beginPath();
    ctx.moveTo(p.x - w * 0.045, y + h * 0.31);
    ctx.lineTo(p.x, y + h * 0.2);
    ctx.lineTo(p.x + w * 0.045, y + h * 0.31);
    ctx.stroke();
  }
}

function drawHighGantry(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  width: number,
  height: number
) {
  const p = project(obs.lane, obs.z, width, height);
  const w = getLaneWidthAtZ(obs.z, width, height) * 0.92;
  const totalH = w * 1.05;
  const barH = totalH * 0.32;
  const x = p.x - w / 2;
  const topY = p.y - totalH;

  // Ground clearance shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + w * 0.06, p.y - 3 * p.scale, w * 0.88, 5 * p.scale);

  // Tall side pillars
  const postW = Math.max(3, w * 0.09);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(x, topY, postW, totalH);
  ctx.fillRect(x + w - postW, topY, postW, totalH);

  // Elevated caution beam
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.roundRect(x - 2 * p.scale, topY, w + 4 * p.scale, barH, Math.max(2, 5 * p.scale));
  ctx.fill();

  // Dark hazard stripes on overhead beam
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - 2 * p.scale, topY, w + 4 * p.scale, barH, Math.max(2, 5 * p.scale));
  ctx.clip();
  ctx.fillStyle = '#111827';
  const sw = w * 0.12;
  for (let sx = x - barH; sx < x + w + barH; sx += sw * 2) {
    ctx.beginPath();
    ctx.moveTo(sx, topY);
    ctx.lineTo(sx + sw, topY);
    ctx.lineTo(sx + sw - barH * 0.5, topY + barH);
    ctx.lineTo(sx - barH * 0.5, topY + barH);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Hanging red caution flaps
  ctx.fillStyle = '#EF4444';
  const flapCount = 5;
  const flapSpan = (w * 0.72) / flapCount;
  for (let i = 0; i < flapCount; i++) {
    const fx = x + w * 0.14 + i * flapSpan;
    ctx.fillRect(fx + flapSpan * 0.2, topY + barH, flapSpan * 0.6, totalH * 0.15);
  }

  // Clear "DOWN" slide arrow cue
  if (w > 34) {
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(p.x, topY + barH * 0.5, Math.max(6, w * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = Math.max(1.5, 2.5 * p.scale);
    ctx.beginPath();
    ctx.moveTo(p.x - w * 0.045, topY + barH * 0.44);
    ctx.lineTo(p.x, topY + barH * 0.62);
    ctx.lineTo(p.x + w * 0.045, topY + barH * 0.44);
    ctx.stroke();
  }
}

function drawCollectible(
  ctx: CanvasRenderingContext2D,
  col: Collectible,
  width: number,
  height: number,
  time: number
) {
  const laneFloat = col.lane + (col.visualXOffset || 0);
  const p = project(laneFloat, col.z, width, height);
  const s = p.scale;
  const bob = Math.sin(time * 6 + col.id) * 5 * s;
  const elev = col.yOffset * 95 * s;
  const cy = p.y - 24 * s - elev + bob;

  // Shadow on track
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 12 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  if (col.type === 'COIN') {
    const spinWidth = Math.max(0.25, Math.abs(Math.cos(time * 5 + col.id * 0.7)));
    const r = Math.max(4, 17 * s);

    ctx.save();
    ctx.translate(p.x, cy);
    ctx.scale(spinWidth, 1);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#F59E0B';
    ctx.fill();
    ctx.lineWidth = Math.max(1, 2.2 * s);
    ctx.strokeStyle = '#FEF08A';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.fillStyle = '#FFCC00';
    ctx.fill();

    if (r > 7) {
      ctx.fillStyle = '#B45309';
      ctx.fillRect(-r * 0.14, -r * 0.42, r * 0.28, r * 0.84);
    }

    ctx.restore();
    return;
  }

  // Power-up Orbs (fast layered halo)
  const r = Math.max(6, 22 * s);
  let orbColor = '#38BDF8';
  let auraColor = 'rgba(56, 189, 248, 0.28)';
  let label = 'K';
  if (col.type === 'MAGNET') {
    orbColor = '#F43F5E';
    auraColor = 'rgba(244, 63, 94, 0.28)';
    label = 'U';
  } else if (col.type === 'SHIELD') {
    orbColor = '#00E676';
    auraColor = 'rgba(0, 230, 118, 0.28)';
    label = 'S';
  } else if (col.type === 'MULTIPLIER') {
    orbColor = '#A855F7';
    auraColor = 'rgba(168, 85, 247, 0.28)';
    label = '2X';
  }

  ctx.fillStyle = auraColor;
  ctx.beginPath();
  ctx.arc(p.x, cy, r * 1.48, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(p.x, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = orbColor;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  if (r > 9) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 ${Math.round(r * 0.85)}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (col.type === 'MAGNET') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(2, 3.2 * s);
      ctx.beginPath();
      ctx.arc(p.x, cy + r * 0.1, r * 0.38, Math.PI, 0, false);
      ctx.stroke();
    } else if (col.type === 'SHIELD') {
      ctx.beginPath();
      ctx.moveTo(p.x, cy - r * 0.45);
      ctx.lineTo(p.x + r * 0.36, cy - r * 0.25);
      ctx.lineTo(p.x + r * 0.28, cy + r * 0.25);
      ctx.lineTo(p.x, cy + r * 0.48);
      ctx.lineTo(p.x - r * 0.28, cy + r * 0.25);
      ctx.lineTo(p.x - r * 0.36, cy - r * 0.25);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    } else {
      ctx.fillText(label, p.x, cy + 1);
    }
    ctx.textBaseline = 'alphabetic';
  }
}

function drawSheruPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  skin: SheruSkin,
  width: number,
  height: number,
  time: number
) {
  const p = project(player.visualLane, 0, width, height);
  const s = p.scale * Math.min(1.25, Math.max(0.82, width / 430));
  const groundY = p.y;
  const jumpHeight = player.y * 120 * s;
  const bodyY = groundY - jumpHeight;
  const isSliding = player.slideTimer > 0 && !player.isJumping;

  if (player.invincibleTimer > 0 && Math.floor(time * 20) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  // Dynamic shadow sits on supporting floor (ground track OR train roof/ramp!)
  const shadowY = groundY - player.floorY * 120 * s;
  const heightAboveFloor = Math.max(0, player.y - player.floorY);
  const shadowScale = Math.max(0.4, 1 - heightAboveFloor * 0.55);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(p.x, shadowY + 4 * s, 32 * s * shadowScale, 10 * s * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  const isSkating = player.skateTimer > 0;
  const hoverOffset = isSkating && !isSliding ? (10 + Math.sin(time * 12) * 2.5) * s : 0;

  ctx.save();
  ctx.translate(p.x, bodyY - hoverOffset);

  const lean = (player.lane - player.visualLane) * (isSkating ? 0.3 : 0.22);
  ctx.rotate(lean);

  // Draw glowing Skate / Hoverboard beneath Sheru's feet
  if (isSkating) {
    ctx.save();
    if (isSliding) {
      ctx.translate(0, 2 * s);
    }

    // Hover thruster glow beneath deck
    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 8 * s, 38 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Skateboard / Hoverboard deck
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.roundRect(-34 * s, -4 * s, 68 * s, 12 * s, 6 * s);
    ctx.fill();
    ctx.stroke();

    // Neon center stripe & gold tips
    ctx.fillStyle = '#FFCC00';
    ctx.fillRect(-24 * s, -1 * s, 48 * s, 5 * s);
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(-20 * s, 7 * s, 4 * s, 0, Math.PI * 2);
    ctx.arc(20 * s, 7 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Turbo/Multiplier flame aura
  if (skin.hasFlameAura || player.multiplierTimer > 0) {
    const auraColor =
      player.multiplierTimer > 0 ? 'rgba(168, 85, 247, 0.34)' : 'rgba(249, 115, 22, 0.34)';
    ctx.fillStyle = auraColor;
    ctx.beginPath();
    ctx.ellipse(0, -48 * s, 42 * s, 58 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isSliding) {
    // Dynamic Low Power-Slide Pose
    ctx.save();
    ctx.translate(0, -18 * s);
    ctx.rotate(-0.48);

    // Fluttering scarf tail
    ctx.fillStyle = skin.accentColor;
    ctx.beginPath();
    ctx.moveTo(-8 * s, -12 * s);
    ctx.quadraticCurveTo(-34 * s, -22 * s + Math.sin(time * 24) * 5 * s, -48 * s, -12 * s);
    ctx.lineTo(-42 * s, -4 * s);
    ctx.closePath();
    ctx.fill();

    // Tail
    ctx.strokeStyle = skin.furColor;
    ctx.lineWidth = 6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22 * s, 6 * s);
    ctx.quadraticCurveTo(-40 * s, -4 * s, -44 * s, 8 * s);
    ctx.stroke();

    // Extended forward sneaker
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(14 * s, 4 * s, 22 * s, 10 * s, 4 * s);
    ctx.fill();
    ctx.fillStyle = skin.accentColor;
    ctx.beginPath();
    ctx.roundRect(24 * s, 2 * s, 16 * s, 11 * s, 4 * s);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(24 * s, 10 * s, 16 * s, 3 * s);

    // Hooded jacket torso
    ctx.fillStyle = skin.jacketColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.roundRect(-24 * s, -16 * s, 44 * s, 28 * s, 11 * s);
    ctx.fill();
    ctx.stroke();

    // Head tucked forward
    drawSheruHead(ctx, 18 * s, -17 * s, s * 0.94, skin);
    ctx.restore();
  } else {
    const stride = isSkating ? 0.22 : player.isJumping ? 0.72 : Math.sin(player.runPhase);
    const bounce =
      isSkating || player.isJumping ? 0 : Math.abs(Math.cos(player.runPhase)) * 5.5 * s;

    ctx.translate(0, -bounce);

    // Fluttering hero scarf / capelet in the wind
    const wave = Math.sin(time * 20) * 6 * s;
    ctx.fillStyle = skin.accentColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.moveTo(-10 * s, -54 * s);
    ctx.quadraticCurveTo(-30 * s, -56 * s + wave, -42 * s, -42 * s + wave);
    ctx.lineTo(-34 * s, -34 * s + wave * 0.6);
    ctx.quadraticCurveTo(-22 * s, -44 * s, -8 * s, -44 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Swishing lion tail
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 8.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12 * s, -30 * s);
    ctx.quadraticCurveTo(-36 * s, -42 * s + Math.sin(time * 14) * 8 * s, -31 * s, -60 * s);
    ctx.stroke();
    ctx.strokeStyle = skin.furColor;
    ctx.lineWidth = 5.5 * s;
    ctx.stroke();

    ctx.fillStyle = skin.maneColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.arc(-31 * s, -60 * s, 6.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Animated legs & sporty sneakers with white soles
    const drawLeg = (hipX: number, phaseOffset: number, darker: boolean) => {
      const lift = phaseOffset * 11 * s;
      const footY = -4 * s + lift;
      ctx.fillStyle = darker ? '#0F172A' : '#1E293B';
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 1.8 * s;
      ctx.beginPath();
      ctx.roundRect(hipX - 5.5 * s, -26 * s, 11 * s, 21 * s + lift * 0.65, 4 * s);
      ctx.fill();
      ctx.stroke();

      // Sneaker upper
      ctx.fillStyle = skin.accentColor;
      ctx.beginPath();
      ctx.roundRect(hipX - 7.5 * s, footY - 2 * s, 16 * s, 9 * s, 4 * s);
      ctx.fill();
      ctx.stroke();

      // Crisp white sneaker sole
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(hipX - 7 * s, footY + 5 * s, 15 * s, 3 * s);
    };

    if (stride > 0) {
      drawLeg(8 * s, -stride, true);
      drawLeg(-8 * s, stride, false);
    } else {
      drawLeg(-8 * s, stride, true);
      drawLeg(8 * s, -stride, false);
    }

    // Back arm
    ctx.fillStyle = skin.furColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.roundRect(-29 * s, -54 * s - stride * 9 * s, 10 * s, 24 * s, 5 * s);
    ctx.fill();
    ctx.stroke();

    // Athletic Hoodie Jacket Torso
    ctx.fillStyle = skin.jacketColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.roundRect(-20 * s, -60 * s, 40 * s, 38 * s, 11 * s);
    ctx.fill();
    ctx.stroke();

    // Jacket zipper & chest emblem
    ctx.fillStyle = skin.accentColor;
    ctx.fillRect(-3.5 * s, -58 * s, 7 * s, 34 * s);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(10 * s, -45 * s, 3.8 * s, 0, Math.PI * 2);
    ctx.fill();

    // Front arm + wrist band
    ctx.fillStyle = skin.furColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.roundRect(19 * s, -54 * s + stride * 9 * s, 10 * s, 24 * s, 5 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.accentColor;
    ctx.fillRect(19.5 * s, -36 * s + stride * 9 * s, 9 * s, 4 * s);

    // Expressive Lion Head
    drawSheruHead(ctx, 0, -79 * s, s * 1.06, skin);
  }

  // Active Kavach Shield bubble
  if (player.hasShield) {
    ctx.strokeStyle = 'rgba(0, 230, 118, 0.92)';
    ctx.fillStyle = 'rgba(0, 230, 118, 0.16)';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(0, isSliding ? -20 * s : -50 * s, 48 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Active Magnet indicator ring
  if (player.magnetTimer > 0) {
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
    ctx.lineWidth = 2.5 * s;
    ctx.setLineDash([6 * s, 6 * s]);
    ctx.beginPath();
    ctx.arc(0, isSliding ? -20 * s : -50 * s, (54 + Math.sin(time * 10) * 4) * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSheruHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  skin: SheruSkin
) {
  ctx.save();
  ctx.translate(cx, cy);

  // Scalloped lion mane with crisp cartoon outline
  const petals = 12;
  ctx.fillStyle = skin.maneColor;
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2 * s;
  for (let i = 0; i < petals; i++) {
    const ang = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * 20.5 * s, Math.sin(ang) * 20.5 * s, 10.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Mane inner volume
  ctx.fillStyle = skin.maneHighlight;
  ctx.beginPath();
  ctx.arc(0, 0, 22 * s, 0, Math.PI * 2);
  ctx.fill();

  // Ears with inner pink
  for (const side of [-1, 1]) {
    ctx.fillStyle = skin.furColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.arc(side * 16 * s, -16 * s, 6.8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FDBA74';
    ctx.beginPath();
    ctx.arc(side * 16 * s, -16 * s, 3.2 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Face circle
  ctx.fillStyle = skin.furColor;
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.arc(0, 1 * s, 17.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Muzzle
  ctx.fillStyle = '#FEF3C7';
  ctx.beginPath();
  ctx.ellipse(0, 7.5 * s, 9.5 * s, 6.8 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.moveTo(-4.2 * s, 3 * s);
  ctx.lineTo(4.2 * s, 3 * s);
  ctx.lineTo(0, 7.5 * s);
  ctx.closePath();
  ctx.fill();

  // Confident grin + whiskers
  ctx.strokeStyle = '#78350F';
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  ctx.arc(-2.6 * s, 8.2 * s, 2.8 * s, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(2.6 * s, 8.2 * s, 2.8 * s, 0, Math.PI);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120, 53, 15, 0.65)';
  ctx.lineWidth = 1.2 * s;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 8 * s, 6 * s);
    ctx.lineTo(side * 15 * s, 4.5 * s);
    ctx.moveTo(side * 8 * s, 8.5 * s);
    ctx.lineTo(side * 15 * s, 9 * s);
    ctx.stroke();
  }

  // Eyes or Shades
  if (skin.hasShades) {
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.roundRect(-14.5 * s, -7.5 * s, 12.5 * s, 8 * s, 2.5 * s);
    ctx.roundRect(2 * s, -7.5 * s, 12.5 * s, 8 * s, 2.5 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-2 * s, -5 * s, 4 * s, 2.2 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-11.5 * s, -5.8 * s, 4.5 * s, 2 * s);
    ctx.fillRect(5 * s, -5.8 * s, 4.5 * s, 2 * s);
  } else {
    // Expressive eyebrows
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-10 * s, -8.5 * s);
    ctx.lineTo(-4 * s, -7 * s);
    ctx.moveTo(10 * s, -8.5 * s);
    ctx.lineTo(4 * s, -7 * s);
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-6.5 * s, -3 * s, 3 * s, 0, Math.PI * 2);
    ctx.arc(6.5 * s, -3 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-7.4 * s, -4.1 * s, 1.15 * s, 0, Math.PI * 2);
    ctx.arc(5.6 * s, -4.1 * s, 1.15 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Optional Royal Crown
  if (skin.hasCrown) {
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.moveTo(-11 * s, -16 * s);
    ctx.lineTo(-13 * s, -29 * s);
    ctx.lineTo(-5 * s, -22 * s);
    ctx.lineTo(0, -32 * s);
    ctx.lineTo(5 * s, -22 * s);
    ctx.lineTo(13 * s, -29 * s);
    ctx.lineTo(11 * s, -16 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}
