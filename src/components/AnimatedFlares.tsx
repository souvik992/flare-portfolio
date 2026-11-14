import React, { useEffect, useRef } from 'react';

interface AnimatedFlaresProps {
  imageAspectRatio?: number;
}

interface OrbitSpec {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tilt: number;
  speed: number;
  direction: 1 | -1;
}

interface RibbonStream {
  orbitIndex: number;
  baseAngle: number;
  arcSpan: number;
  widthPx: number;
  hue: 'ice' | 'cyan' | 'gold' | 'amber';
  waveOffset: number;
}

interface SparkParticle {
  orbitIndex: number;
  baseAngle: number;
  speedMultiplier: number;
  radialOffset: number;
  waveAmp: number;
  waveFreq: number;
  phase: number;
  size: number;
  streakLen: number;
  hue: 'ice' | 'cyan' | 'gold' | 'amber';
  alpha: number;
}

// Orbit coordinates match CharacterMotionCanvas (inner ring elevated cleanly above hands)
const ORBITS: OrbitSpec[] = [
  {
    cx: 0.5,
    cy: 0.695,
    rx: 0.515,
    ry: 0.275,
    tilt: -0.05,
    speed: 1.15,
    direction: 1,
  },
  {
    cx: 0.5,
    cy: 0.635,
    rx: 0.21,
    ry: 0.072,
    tilt: -0.3,
    speed: 1.65,
    direction: 1,
  },
  {
    cx: 0.5,
    cy: 0.665,
    rx: 0.36,
    ry: 0.165,
    tilt: -0.16,
    speed: 1.35,
    direction: 1,
  },
];

const RIBBON_STREAMS: RibbonStream[] = [
  { orbitIndex: 0, baseAngle: 0.0, arcSpan: 1.55, widthPx: 5.5, hue: 'cyan', waveOffset: 0.0 },
  { orbitIndex: 0, baseAngle: 0.08, arcSpan: 1.05, widthPx: 2.6, hue: 'ice', waveOffset: 0.008 },
  { orbitIndex: 0, baseAngle: 2.65, arcSpan: 1.5, widthPx: 5.5, hue: 'gold', waveOffset: -0.006 },
  { orbitIndex: 0, baseAngle: 2.75, arcSpan: 0.95, widthPx: 2.4, hue: 'amber', waveOffset: 0.005 },
  { orbitIndex: 1, baseAngle: 0.8, arcSpan: 1.8, widthPx: 4.5, hue: 'gold', waveOffset: 0.0 },
  { orbitIndex: 1, baseAngle: 3.94, arcSpan: 1.65, widthPx: 4.2, hue: 'cyan', waveOffset: 0.004 },
  { orbitIndex: 2, baseAngle: 1.1, arcSpan: 1.4, widthPx: 3.4, hue: 'amber', waveOffset: 0.0 },
  { orbitIndex: 2, baseAngle: 4.2, arcSpan: 1.25, widthPx: 3.0, hue: 'cyan', waveOffset: -0.005 },
];

function createSparks(): SparkParticle[] {
  const sparks: SparkParticle[] = [];
  const total = 210;
  for (let i = 0; i < total; i++) {
    const orbitIndex = i < 105 ? 0 : i < 165 ? 1 : 2;
    const seed = (i * 9301 + 49297) % 233280;
    const r1 = seed / 233280;
    const r2 = ((seed * 7 + 13) % 233280) / 233280;
    const r3 = ((seed * 19 + 31) % 233280) / 233280;

    const hueChoice =
      r3 > 0.72 ? 'amber' : r3 > 0.42 ? 'gold' : r3 > 0.16 ? 'cyan' : 'ice';

    sparks.push({
      orbitIndex,
      baseAngle: r1 * Math.PI * 2,
      speedMultiplier: 0.65 + r2 * 0.7,
      radialOffset: (r2 - 0.5) * (orbitIndex === 0 ? 0.055 : orbitIndex === 2 ? 0.042 : 0.028),
      waveAmp: 0.005 + r3 * 0.011,
      waveFreq: 1.8 + r1 * 2.8,
      phase: r2 * Math.PI * 2,
      size: 0.85 + r3 * 1.9,
      streakLen: 0.028 + r2 * 0.055,
      hue: hueChoice,
      alpha: 0.45 + r2 * 0.55,
    });
  }
  return sparks;
}

const SPARKS = createSparks();

function getColorRgba(hue: 'ice' | 'cyan' | 'gold' | 'amber', alpha: number): string {
  if (hue === 'amber') return `rgba(255, 148, 42, ${alpha})`;
  if (hue === 'gold') return `rgba(255, 208, 92, ${alpha})`;
  if (hue === 'cyan') return `rgba(92, 198, 255, ${alpha})`;
  return `rgba(240, 250, 255, ${alpha})`;
}

function getDepthVisibility(orbitIndex: number, u: number, v: number, theta: number): number {
  // Shield hands & keyboard zone from bright overlapping flares
  const dxH = (u - 0.465) / 0.095;
  const dyH = (v - 0.79) / 0.055;
  const handDistSq = dxH * dxH + dyH * dyH;
  const handShield = Math.min(Math.max((Math.sqrt(handDistSq) - 0.45) / 0.8, 0), 1);

  const sinTheta = Math.sin(theta);
  if (orbitIndex === 1 || orbitIndex === 2) {
    if (sinTheta < 0.16 && u > 0.42 && u < 0.63 && v > 0.44 && v < 0.85) {
      const horizFactor = Math.min(Math.abs(u - 0.525) / 0.105, 1);
      const backDepth = Math.min(Math.max((-sinTheta + 0.16) / 0.35, 0), 1);
      return (1 - backDepth * (1 - horizFactor * horizFactor) * 0.94) * handShield;
    }
    return handShield;
  }

  if (sinTheta < -0.28 && u > 0.44 && u < 0.56 && v > 0.38 && v < 0.55) {
    const horizFactor = Math.min(Math.abs(u - 0.50) / 0.06, 1);
    return (0.18 + 0.82 * horizFactor) * handShield;
  }
  return handShield;
}

export const AnimatedFlares: React.FC<AnimatedFlaresProps> = ({
  imageAspectRatio = 16 / 9,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    const projectPoint = (
      orbit: OrbitSpec,
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

      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const lx = (orbit.rx + radialDelta) * cosT;
      const ly = (orbit.ry + radialDelta * 0.55) * sinT;

      const cosRot = Math.cos(orbit.tilt);
      const sinRot = Math.sin(orbit.tilt);

      const u = orbit.cx + lx * cosRot - ly * sinRot;
      const v = orbit.cy + lx * sinRot + ly * cosRot + verticalDelta;

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
      if (alpha <= 0.02 || radius <= 1) return;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
      grad.addColorStop(0.2, getColorRgba(hue, alpha * 0.7));
      grad.addColorStop(0.55, getColorRgba(hue, alpha * 0.2));
      grad.addColorStop(1, getColorRgba(hue, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      const streakW = radius * 3.8;
      const streakH = Math.max(1.2, radius * 0.08);
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

    const renderFrame = (now: number) => {
      if (width > 0 && height > 0) {
        const elapsedSec = prefersReducedMotion ? 0 : (now - startTime) / 1000;

        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';

        for (const stream of RIBBON_STREAMS) {
          const orbit = ORBITS[stream.orbitIndex];
          const headAngle = stream.baseAngle + elapsedSec * orbit.speed * orbit.direction;
          const steps = 36;

          let prevPt = projectPoint(
            orbit,
            headAngle - stream.arcSpan * orbit.direction,
            stream.waveOffset
          );

          for (let s = 1; s <= steps; s++) {
            const frac = s / steps;
            const segAngle = headAngle - (1 - frac) * stream.arcSpan * orbit.direction;
            const radialRipple =
              stream.waveOffset +
              Math.sin(segAngle * 4.0 - elapsedSec * 2.5) * 0.007 * (1 - frac * 0.5);
            const pt = projectPoint(orbit, segAngle, radialRipple);

            const depthVis = getDepthVisibility(stream.orbitIndex, pt.u, pt.v, segAngle);
            const segAlpha = Math.pow(frac, 1.8) * 0.62 * depthVis;

            if (segAlpha > 0.015) {
              ctx.strokeStyle = getColorRgba(stream.hue, segAlpha);
              ctx.lineWidth = Math.max(0.8, stream.widthPx * pt.scale * (0.2 + 0.9 * frac));
              ctx.beginPath();
              ctx.moveTo(prevPt.x, prevPt.y);
              ctx.lineTo(pt.x, pt.y);
              ctx.stroke();

              if (frac > 0.45) {
                ctx.strokeStyle = `rgba(255, 252, 245, ${(frac - 0.45) * 0.7 * depthVis})`;
                ctx.lineWidth = Math.max(0.5, stream.widthPx * 0.35 * pt.scale * frac);
                ctx.beginPath();
                ctx.moveTo(prevPt.x, prevPt.y);
                ctx.lineTo(pt.x, pt.y);
                ctx.stroke();
              }
            }

            prevPt = pt;
          }

          const headPt = projectPoint(orbit, headAngle, stream.waveOffset);
          const headVis = getDepthVisibility(stream.orbitIndex, headPt.u, headPt.v, headAngle);
          drawCrestFlare(
            headPt.x,
            headPt.y,
            stream.widthPx * 4.6 * headPt.scale,
            stream.hue,
            0.78 * headVis
          );
        }

        for (const p of SPARKS) {
          const orbit = ORBITS[p.orbitIndex];
          const theta =
            p.baseAngle + elapsedSec * orbit.speed * p.speedMultiplier * orbit.direction;
          const wave = Math.sin(elapsedSec * p.waveFreq + p.phase) * p.waveAmp;

          const headPt = projectPoint(orbit, theta, p.radialOffset, wave);
          const tailPt = projectPoint(
            orbit,
            theta - p.streakLen * orbit.direction,
            p.radialOffset,
            wave
          );

          const depthVis = getDepthVisibility(p.orbitIndex, headPt.u, headPt.v, theta);
          const twinkle = 0.35 + 0.65 * Math.sin(elapsedSec * 4.2 + p.phase * 2.0);
          const alpha = p.alpha * twinkle * depthVis;

          if (alpha > 0.06) {
            ctx.strokeStyle = getColorRgba(p.hue, alpha * 0.85);
            ctx.lineWidth = Math.max(0.7, p.size * Math.max(0.75, headPt.scale));
            ctx.beginPath();
            ctx.moveTo(tailPt.x, tailPt.y);
            ctx.lineTo(headPt.x, headPt.y);
            ctx.stroke();

            ctx.fillStyle = `rgba(255, 252, 240, ${Math.min(1, alpha * 0.95)})`;
            ctx.beginPath();
            ctx.arc(headPt.x, headPt.y, Math.max(0.6, p.size * 0.65 * headPt.scale), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
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
