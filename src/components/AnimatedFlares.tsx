import React, { useEffect, useRef } from 'react';

interface AnimatedFlaresProps {
  imageAspectRatio?: number;
  isThinking?: boolean;
  replyPulseCount?: number;
}

interface ExpandingStream {
  phaseOffset: number;
  baseAngle: number;
  arcSpan: number;
  hue: 'ice' | 'cyan' | 'gold' | 'amber';
  speed: number;
}

interface ExpandingSpark {
  phaseOffset: number;
  baseAngle: number;
  speedMultiplier: number;
  radialJitter: number;
  waveFreq: number;
  phase: number;
  hue: 'ice' | 'cyan' | 'gold' | 'amber';
  alpha: number;
}

interface InteractiveSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: 'ice' | 'cyan' | 'gold' | 'amber';
}

const CYCLE_RATE = 0.135;

const STREAMS: ExpandingStream[] = [
  { phaseOffset: 0.0, baseAngle: 0.2, arcSpan: 1.45, hue: 'cyan', speed: 1.35 },
  { phaseOffset: 0.0, baseAngle: 3.34, arcSpan: 1.35, hue: 'gold', speed: 1.35 },
  { phaseOffset: 0.33, baseAngle: 1.4, arcSpan: 1.4, hue: 'ice', speed: 1.35 },
  { phaseOffset: 0.33, baseAngle: 4.54, arcSpan: 1.35, hue: 'amber', speed: 1.35 },
  { phaseOffset: 0.67, baseAngle: 2.3, arcSpan: 1.45, hue: 'gold', speed: 1.35 },
  { phaseOffset: 0.67, baseAngle: 5.44, arcSpan: 1.3, hue: 'cyan', speed: 1.35 },
];

function createSparks(): ExpandingSpark[] {
  const sparks: ExpandingSpark[] = [];
  const total = 180;
  for (let i = 0; i < total; i++) {
    const seed = (i * 9301 + 49297) % 233280;
    const r1 = seed / 233280;
    const r2 = ((seed * 7 + 13) % 233280) / 233280;
    const r3 = ((seed * 19 + 31) % 233280) / 233280;

    const hueChoice =
      r3 > 0.72 ? 'amber' : r3 > 0.42 ? 'gold' : r3 > 0.16 ? 'cyan' : 'ice';

    sparks.push({
      phaseOffset: (i % 3) * 0.33 + r1 * 0.15,
      baseAngle: r2 * Math.PI * 2,
      speedMultiplier: 0.8 + r3 * 0.55,
      radialJitter: (r2 - 0.5) * 0.04,
      waveFreq: 1.8 + r1 * 2.4,
      phase: r3 * Math.PI * 2,
      hue: hueChoice,
      alpha: 0.45 + r2 * 0.55,
    });
  }
  return sparks;
}

const SPARKS = createSparks();
const HUE_POOL: Array<'ice' | 'cyan' | 'gold' | 'amber'> = ['cyan', 'gold', 'ice', 'amber'];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function getColorRgba(hue: 'ice' | 'cyan' | 'gold' | 'amber', alpha: number): string {
  if (hue === 'amber') return `rgba(255, 148, 42, ${alpha})`;
  if (hue === 'gold') return `rgba(255, 208, 92, ${alpha})`;
  if (hue === 'cyan') return `rgba(92, 198, 255, ${alpha})`;
  return `rgba(240, 250, 255, ${alpha})`;
}

function getVisibility(u: number, v: number, theta: number): number {
  const dxFace = (u - 0.498) / 0.068;
  const dyFace = (v - 0.498) / 0.105;
  const faceDist = Math.sqrt(dxFace * dxFace + dyFace * dyFace);
  const faceSafe = smoothstep(0.78, 1.28, faceDist);

  const dxHand = (u - 0.46) / 0.095;
  const dyHand = (v - 0.79) / 0.055;
  const handDist = Math.sqrt(dxHand * dxHand + dyHand * dyHand);
  const handShield = smoothstep(0.45, 1.25, handDist);

  const sinTheta = Math.sin(theta);
  if (sinTheta < 0.18) {
    const dxBody = (u - 0.515) / 0.105;
    const dyBody = (v - 0.65) / 0.21;
    const bodyDist = Math.sqrt(dxBody * dxBody + dyBody * dyBody);
    const bodyOcc = smoothstep(0.5, 1.15, bodyDist);
    const backFactor = smoothstep(0.18, -0.25, sinTheta);
    const occ = 1 - backFactor * (1 - bodyOcc);
    return occ * faceSafe * handShield;
  }

  return faceSafe * handShield;
}

export const AnimatedFlares: React.FC<AnimatedFlaresProps> = ({
  imageAspectRatio = 16 / 9,
  isThinking = false,
  replyPulseCount = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activityRef = useRef({ isThinking, replyPulseCount });
  activityRef.current = { isThinking, replyPulseCount };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId: number | null = null;

    const interactiveSparks: InteractiveSpark[] = [];
    let lastSpawnX = -999;
    let lastSpawnY = -999;
    let sparkHueCounter = 0;
    let thinkingSmooth = 0;
    let replyBoost = 0;
    let lastReplySeen = activityRef.current.replyPulseCount;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(canvas);

    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      const dx = x - lastSpawnX;
      const dy = y - lastSpawnY;
      if (dx * dx + dy * dy < 140) return;

      lastSpawnX = x;
      lastSpawnY = y;

      if (interactiveSparks.length < 70) {
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.4;
        const speed = 18 + Math.random() * 28;
        interactiveSparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed * 0.4 + (Math.random() - 0.5) * 14,
          vy: Math.sin(angle) * speed * 0.4 - 8 - Math.random() * 14,
          life: 0,
          maxLife: 0.65 + Math.random() * 0.55,
          size: 1.1 + Math.random() * 1.8,
          hue: HUE_POOL[sparkHueCounter++ % HUE_POOL.length],
        });
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, input, textarea, form')) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      const count = 20;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
        const speed = 35 + Math.random() * 75;
        interactiveSparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 0.75 + Math.random() * 0.5,
          size: 1.4 + Math.random() * 2.2,
          hue: HUE_POOL[(sparkHueCounter + i) % HUE_POOL.length],
        });
      }
      sparkHueCounter += count;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });

    const projectExpandingPoint = (
      grow: number,
      theta: number,
      radialDelta = 0,
      verticalDelta = 0
    ) => {
      const canvasAspect = width / Math.max(height, 1);
      let drawW = width;
      let drawH = height;
      let offsetX = 0;
      let offsetY = 0;

      if (canvasAspect > imageAspectRatio) {
        drawW = width;
        drawH = width / imageAspectRatio;
        offsetY = (height - drawH) / 2;
      } else {
        drawH = height;
        drawW = height * imageAspectRatio;
        offsetX = (width - drawW) / 2;
      }

      const rx = 0.24 + (0.54 - 0.24) * grow + radialDelta;
      const ry = 0.18 + (0.30 - 0.18) * grow + radialDelta * 0.55;
      const cx = 0.5;
      const cy = 0.67 + (0.70 - 0.67) * grow;
      const tilt = -0.18 + (-0.05 - -0.18) * grow;

      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const lx = rx * cosT;
      const ly = ry * sinT;

      const cosRot = Math.cos(tilt);
      const sinRot = Math.sin(tilt);

      const u = cx + lx * cosRot - ly * sinRot;
      const v = cy + lx * sinRot + ly * cosRot + verticalDelta;

      const x = offsetX + u * drawW;
      const y = offsetY + v * drawH;

      return { x, y, u, v, scale: drawW / 1440 };
    };

    const drawCrestFlare = (
      x: number,
      y: number,
      radius: number,
      hue: 'ice' | 'cyan' | 'gold' | 'amber',
      alpha: number
    ) => {
      if (alpha <= 0.02 || radius <= 0.8) return;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
      grad.addColorStop(0.22, getColorRgba(hue, alpha * 0.7));
      grad.addColorStop(0.58, getColorRgba(hue, alpha * 0.2));
      grad.addColorStop(1, getColorRgba(hue, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      const streakW = radius * 3.5;
      const streakH = Math.max(1.0, radius * 0.085);
      const hGrad = ctx.createLinearGradient(x - streakW, y, x + streakW, y);
      hGrad.addColorStop(0, getColorRgba(hue, 0));
      hGrad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.85})`);
      hGrad.addColorStop(1, getColorRgba(hue, 0));
      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.ellipse(x, y, streakW, streakH, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    const startTime = performance.now();
    let prevTime = startTime;

    const renderFrame = (now: number) => {
      const dt = Math.min((now - prevTime) / 1000, 0.05);
      prevTime = now;

      const targetThinking = activityRef.current.isThinking ? 1 : 0;
      thinkingSmooth += (targetThinking - thinkingSmooth) * 0.06;

      if (activityRef.current.replyPulseCount !== lastReplySeen) {
        lastReplySeen = activityRef.current.replyPulseCount;
        replyBoost = 1;
      } else {
        replyBoost *= 0.965;
      }

      if (width > 0 && height > 0) {
        const rawSec = prefersReducedMotion ? 0.35 / CYCLE_RATE : (now - startTime) / 1000;
        const elapsedSec = rawSec * (1 + 0.12 * thinkingSmooth);

        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';

        const brightnessBoost = 1 + 0.28 * thinkingSmooth + 0.38 * replyBoost;

        for (const stream of STREAMS) {
          const cycle = (elapsedSec * CYCLE_RATE + stream.phaseOffset) % 1;
          const grow = smoothstep(0.0, 0.92, cycle);
          const lifeAlpha = smoothstep(0.0, 0.14, cycle) * (1 - smoothstep(0.74, 1.0, cycle));

          const widthBase = (1.4 + 4.8 * grow) * (1 + 0.2 * thinkingSmooth + 0.25 * replyBoost);
          const headAngle = stream.baseAngle + elapsedSec * stream.speed;
          const steps = 34;

          let prevPt = projectExpandingPoint(grow, headAngle - stream.arcSpan);

          for (let s = 1; s <= steps; s++) {
            const frac = s / steps;
            const segAngle = headAngle - (1 - frac) * stream.arcSpan;
            const radialRipple =
              Math.sin(segAngle * 4.0 - elapsedSec * 2.4) * (0.003 + 0.006 * grow);
            const pt = projectExpandingPoint(grow, segAngle, radialRipple);

            const vis = getVisibility(pt.u, pt.v, segAngle) * lifeAlpha;
            const segAlpha = Math.min(1, Math.pow(frac, 1.7) * 0.64 * vis * brightnessBoost);

            if (segAlpha > 0.015) {
              ctx.strokeStyle = getColorRgba(stream.hue, segAlpha);
              ctx.lineWidth = Math.max(0.6, widthBase * pt.scale * (0.15 + 0.9 * frac));
              ctx.beginPath();
              ctx.moveTo(prevPt.x, prevPt.y);
              ctx.lineTo(pt.x, pt.y);
              ctx.stroke();

              if (frac > 0.45) {
                ctx.strokeStyle = `rgba(255, 252, 245, ${Math.min(1, (frac - 0.45) * 0.72 * vis * brightnessBoost)})`;
                ctx.lineWidth = Math.max(0.4, widthBase * 0.32 * pt.scale * frac);
                ctx.beginPath();
                ctx.moveTo(prevPt.x, prevPt.y);
                ctx.lineTo(pt.x, pt.y);
                ctx.stroke();
              }
            }

            prevPt = pt;
          }

          const headPt = projectExpandingPoint(grow, headAngle);
          const headVis = getVisibility(headPt.u, headPt.v, headAngle) * lifeAlpha;
          const crestRadius = (6 + 22 * grow) * headPt.scale * (1 + 0.25 * replyBoost);
          drawCrestFlare(
            headPt.x,
            headPt.y,
            crestRadius,
            stream.hue,
            Math.min(1, 0.8 * headVis * brightnessBoost)
          );
        }

        for (const p of SPARKS) {
          const cycle = (elapsedSec * CYCLE_RATE + p.phaseOffset) % 1;
          const grow = smoothstep(0.0, 0.92, cycle);
          const lifeAlpha = smoothstep(0.0, 0.16, cycle) * (1 - smoothstep(0.74, 1.0, cycle));

          const theta = p.baseAngle + elapsedSec * 1.35 * p.speedMultiplier;
          const wave = Math.sin(elapsedSec * p.waveFreq + p.phase) * (0.003 + 0.008 * grow);
          const streakLen = 0.012 + 0.048 * grow;

          const headPt = projectExpandingPoint(grow, theta, p.radialJitter * (0.4 + 0.8 * grow), wave);
          const tailPt = projectExpandingPoint(
            grow,
            theta - streakLen,
            p.radialJitter * (0.4 + 0.8 * grow),
            wave
          );

          const vis = getVisibility(headPt.u, headPt.v, theta) * lifeAlpha;
          const twinkle = 0.35 + 0.65 * Math.sin(elapsedSec * 4.0 + p.phase * 2.0);
          const alpha = Math.min(1, p.alpha * twinkle * vis * brightnessBoost);
          const sparkSize = (0.55 + 2.1 * grow) * Math.max(0.75, headPt.scale);

          if (alpha > 0.05) {
            ctx.strokeStyle = getColorRgba(p.hue, alpha * 0.85);
            ctx.lineWidth = Math.max(0.5, sparkSize);
            ctx.beginPath();
            ctx.moveTo(tailPt.x, tailPt.y);
            ctx.lineTo(headPt.x, headPt.y);
            ctx.stroke();

            ctx.fillStyle = `rgba(255, 252, 240, ${Math.min(1, alpha * 0.95)})`;
            ctx.beginPath();
            ctx.arc(headPt.x, headPt.y, Math.max(0.5, sparkSize * 0.6), 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Interactive cursor trail & click burst sparks
        for (let i = interactiveSparks.length - 1; i >= 0; i--) {
          const sp = interactiveSparks[i];
          sp.life += dt;
          if (sp.life >= sp.maxLife) {
            interactiveSparks.splice(i, 1);
            continue;
          }

          const prevX = sp.x;
          const prevY = sp.y;
          sp.vx *= 0.97;
          sp.vy *= 0.97;
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;

          const progress = sp.life / sp.maxLife;
          const alpha = (1 - progress) * (1 - progress) * 0.88;

          ctx.strokeStyle = getColorRgba(sp.hue, alpha);
          ctx.lineWidth = sp.size * (1 - progress * 0.4);
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(sp.x, sp.y);
          ctx.stroke();

          ctx.fillStyle = `rgba(255, 252, 245, ${alpha})`;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      resizeObserver.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [imageAspectRatio]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full translate-y-[4%] mix-blend-screen pointer-events-none select-none"
    />
  );
};
