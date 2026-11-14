import React, { useEffect, useRef } from 'react';

interface CharacterMotionCanvasProps {
  imageSrc: string;
  onReady?: (aspectRatio: number) => void;
  onFallback?: () => void;
}

const VERTEX_SHADER_SRC = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision highp float;

  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform vec2 u_resolution;
  uniform float u_imgAspect;
  uniform float u_time;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.08;
      a *= 0.5;
    }
    return v;
  }

  vec2 ellipseCoords(vec2 uv, vec2 center, vec2 radii, float tilt) {
    vec2 p = uv - center;
    float c = cos(-tilt);
    float s = sin(-tilt);
    vec2 lp = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    vec2 np = lp / radii;
    float r = length(np);
    float theta = atan(np.y, np.x);
    return vec2(theta, r - 1.0);
  }

  vec2 rotate2D(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }

  void main() {
    float canvasAspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 uv = v_uv;
    if (canvasAspect > u_imgAspect) {
      float scale = u_imgAspect / canvasAspect;
      uv.y = (uv.y - 0.5) * scale + 0.5;
    } else {
      float scale = canvasAspect / u_imgAspect;
      uv.x = (uv.x - 0.5) * scale + 0.5;
    }

    float t = u_time;

    // ---------------------------------------------------------
    // 1. CALM, NATURAL TYPING & CHARACTER ANIMATION (NO SHAKING)
    // ---------------------------------------------------------

    // Relaxed typing cadence: steady typing intervals with brief reading pauses
    float cadence = smoothstep(-0.15, 0.45, sin(t * 1.05) + 0.3 * sin(t * 0.45));

    // Gentle torso breathing (smooth vertical rise/fall, steady posture)
    float breath = sin(t * 1.35);
    vec2 torsoPivot = vec2(0.535, 0.71);
    vec2 torsoRel = (uv - torsoPivot) / vec2(0.115, 0.145);
    float torsoMask = exp(-dot(torsoRel, torsoRel));
    vec2 torsoDisp = vec2(0.0, breath * 0.0048);

    // Subtle organic head reading tilt & nod (smooth low-frequency only)
    vec2 neckPivot = vec2(0.515, 0.57);
    vec2 headRel = (uv - vec2(0.498, 0.492)) / vec2(0.068, 0.090);
    float headMask = exp(-dot(headRel, headRel));
    float headAngle = sin(t * 0.75) * 0.024;
    vec2 rotatedHead = neckPivot + rotate2D(uv - neckPivot, headAngle);
    vec2 headRotDisp = (rotatedHead - uv) * headMask;
    vec2 headBob = vec2(
      sin(t * 0.65) * 0.0028,
      breath * 0.0042 + sin(t * 1.45 + 0.5) * 0.0018
    ) * headMask;

    // Grounded wrists/arms (NO oscillation) + clean downward fingertip keystrokes ONLY
    // Tight fingertip zones so palms & forearms remain rock-steady on the desk
    vec2 lFingerZone = (uv - vec2(0.418, 0.793)) / vec2(0.022, 0.017);
    float lFingerMask = exp(-dot(lFingerZone, lFingerZone));

    vec2 rFingerZone = (uv - vec2(0.483, 0.786)) / vec2(0.023, 0.017);
    float rFingerMask = exp(-dot(rFingerZone, rFingerZone));

    // Smooth isolated downward key-press impulses (0 -> downward dip -> 0, no sideways jitter)
    float lTap1 = pow(max(0.0, sin(t * 5.2)), 6.0);
    float lTap2 = pow(max(0.0, sin(t * 5.2 + 1.85)), 6.0);
    float rTap1 = pow(max(0.0, sin(t * 5.2 + 0.95)), 6.0);
    float rTap2 = pow(max(0.0, sin(t * 5.2 + 2.85)), 6.0);

    // Subtle localized finger press downward toward keys (uv.y increases downward)
    float lKeyPress = (lTap1 * 0.0048 + lTap2 * 0.0036) * cadence;
    float rKeyPress = (rTap1 * 0.0048 + rTap2 * 0.0036) * cadence;

    vec2 fingerDisp =
      lFingerMask * vec2(0.0, lKeyPress) +
      rFingerMask * vec2(0.0, rKeyPress);

    // Yellow lilies gentle breeze sway
    vec2 lFlowerRel = (uv - vec2(0.255, 0.675)) / vec2(0.11, 0.13);
    float lFlowerMask = exp(-dot(lFlowerRel, lFlowerRel));
    vec2 rFlowerRel = (uv - vec2(0.855, 0.645)) / vec2(0.12, 0.15);
    float rFlowerMask = exp(-dot(rFlowerRel, rFlowerRel));

    vec2 flowerDisp =
      lFlowerMask * vec2(sin(t * 1.05) * 0.0052, cos(t * 0.85) * 0.0022) +
      rFlowerMask * vec2(sin(t * 0.98 + 1.3) * 0.0058, cos(t * 0.82 + 0.7) * 0.0025);

    vec2 sampleUv = uv
      - torsoMask * torsoDisp
      - headRotDisp
      - headBob
      - fingerDisp
      - flowerDisp;

    // Periodic natural eye blink (every ~4.2s)
    float blinkCycle = mod(t + 1.3, 4.2);
    float blinkAmt = smoothstep(0.0, 0.08, blinkCycle) * (1.0 - smoothstep(0.08, 0.18, blinkCycle));
    vec2 lEyePos = vec2(0.483, 0.497) + headBob + headRotDisp;
    vec2 rEyePos = vec2(0.506, 0.500) + headBob + headRotDisp;
    vec2 lEyeD = (uv - lEyePos) / vec2(0.0075, 0.0048);
    vec2 rEyeD = (uv - rEyePos) / vec2(0.0075, 0.0048);
    float eyeMask = max(exp(-dot(lEyeD, lEyeD)), exp(-dot(rEyeD, rEyeD)));
    sampleUv.y -= (uv.y - 0.498) * eyeMask * blinkAmt * 0.65;

    sampleUv = clamp(sampleUv, vec2(0.001), vec2(0.999));
    vec3 baseColor = texture2D(u_tex, sampleUv).rgb;

    // ---------------------------------------------------------
    // 2. VOLUMETRIC SWIRLING FLARES (CLEAR OF HANDS & KEYBOARD)
    // ---------------------------------------------------------

    vec2 bodyOccDelta = (uv - vec2(0.525, 0.65)) / vec2(0.072, 0.155);
    float bodyOcc = smoothstep(0.32, 1.12, length(bodyOccDelta));
    vec2 headOccDelta = (uv - vec2(0.500, 0.492)) / vec2(0.048, 0.076);
    float headOcc = smoothstep(0.32, 1.08, length(headOccDelta));

    // Shield hands & laptop keyboard from flare flicker so hands never look jittery
    vec2 handsShieldDelta = (uv - vec2(0.465, 0.79)) / vec2(0.095, 0.055);
    float handsShield = smoothstep(0.45, 1.25, length(handsShieldDelta));

    // Ring 1: Outer sweeping halo
    vec2 outerEC = ellipseCoords(uv, vec2(0.50, 0.695), vec2(0.515, 0.275), -0.05);
    float outerTheta = outerEC.x;
    float outerDist = outerEC.y;

    // Ring 2: Inner tilted ring raised cleanly above wrists/hands (cy = 0.635, ry = 0.072)
    vec2 innerEC = ellipseCoords(uv, vec2(0.50, 0.635), vec2(0.21, 0.072), -0.30);
    float innerTheta = innerEC.x;
    float innerDist = innerEC.y;

    // Ring 3: Mid spiral stream
    vec2 midEC = ellipseCoords(uv, vec2(0.50, 0.665), vec2(0.36, 0.165), -0.16);
    float midTheta = midEC.x;
    float midDist = midEC.y;

    float outerQuiet = exp(-pow(outerDist / 0.09, 2.0));
    float innerQuiet = exp(-pow(innerDist / 0.14, 2.0));
    float baseRingDim = 1.0 - 0.30 * max(outerQuiet, innerQuiet);

    float outerAngleA = t * 1.15;
    float outerAngleB = outerAngleA + 2.65;
    float innerAngleA = t * 1.65 + 0.8;
    float innerAngleB = innerAngleA + 3.14159;

    float oFlow1 = fbm(vec2(outerTheta * 3.0 - outerAngleA * 1.1, outerDist * 13.0 + t * 0.4));
    float oFlow2 = fbm(vec2(outerTheta * 6.0 - outerAngleA * 1.7 + 3.7, outerDist * 22.0 - t * 0.6));
    float oWarp = (oFlow1 - 0.5) * 0.085 + (oFlow2 - 0.5) * 0.032;

    float oCore = exp(-pow((outerDist + oWarp) / 0.032, 2.0));
    float oWisps = exp(-pow((outerDist + oWarp * 1.45) / 0.068, 2.0)) * oFlow2;
    float oAura = exp(-pow((outerDist + oWarp * 0.5) / 0.13, 2.0));

    float oWaveCyan = pow(0.5 + 0.5 * cos(outerTheta - outerAngleA), 3.5);
    float oWaveGold = pow(0.5 + 0.5 * cos(outerTheta - outerAngleB), 4.0);
    float oWaveSpark = pow(0.5 + 0.5 * cos(outerTheta * 2.0 - t * 2.4), 6.0);

    float oBackMask = mix(1.0, headOcc, smoothstep(-0.22, -0.72, sin(outerTheta)));

    float iFlow1 = fbm(vec2(innerTheta * 3.0 - innerAngleA * 1.2 + 2.1, innerDist * 10.0 + t * 0.45));
    float iFlow2 = fbm(vec2(innerTheta * 6.0 - innerAngleA * 1.8 + 5.9, innerDist * 16.0 - t * 0.65));
    float iWarp = (iFlow1 - 0.5) * 0.12 + (iFlow2 - 0.5) * 0.05;

    float iCore = exp(-pow((innerDist + iWarp) / 0.060, 2.0));
    float iWisps = exp(-pow((innerDist + iWarp * 1.35) / 0.12, 2.0)) * iFlow2;
    float iAura = exp(-pow((innerDist + iWarp * 0.5) / 0.20, 2.0));

    float iWaveGold = pow(0.5 + 0.5 * cos(innerTheta - innerAngleA), 2.8);
    float iWaveCyan = pow(0.5 + 0.5 * cos(innerTheta - innerAngleB), 3.2);

    float innerBackOcc = min(bodyOcc, headOcc);
    float iBackMask = mix(1.0, innerBackOcc, smoothstep(0.16, -0.26, sin(innerTheta))) * handsShield;

    float mFlow = fbm(vec2(midTheta * 4.0 - t * 1.45 + 9.2, midDist * 14.0 + t * 0.3));
    float mWarp = (mFlow - 0.5) * 0.09;
    float mRibbon = exp(-pow((midDist + mWarp) / 0.036, 2.0)) * smoothstep(0.42, 0.82, mFlow);
    float mWave = pow(0.5 + 0.5 * cos(midTheta - t * 1.35 + 1.1), 3.0);
    float mBackMask = mix(1.0, min(bodyOcc, headOcc), smoothstep(0.05, -0.45, sin(midTheta))) * handsShield;

    vec3 cyanCol = vec3(0.32, 0.78, 1.0);
    vec3 goldCol = vec3(1.0, 0.72, 0.24);
    vec3 amberCol = vec3(1.0, 0.52, 0.14);
    vec3 whiteHot = vec3(1.0, 0.98, 0.93);

    vec3 outerFlare =
      (cyanCol * (0.18 + 1.25 * oWaveCyan) + goldCol * (0.14 + 1.35 * oWaveGold)) *
        (oCore * (0.55 + 1.1 * oFlow2) + oWisps * 0.85) +
      mix(cyanCol, amberCol, oWaveGold) * oAura * (0.10 + 0.42 * (oWaveCyan + oWaveGold)) +
      whiteHot * oCore * (pow(oWaveCyan, 2.0) * 0.75 + pow(oWaveGold, 2.0) * 0.65 + oWaveSpark * 0.35);
    outerFlare *= oBackMask;

    vec3 innerFlare =
      (goldCol * (0.22 + 1.3 * iWaveGold) + cyanCol * (0.20 + 1.1 * iWaveCyan)) *
        (iCore * (0.5 + 1.1 * iFlow2) + iWisps * 0.85) +
      mix(amberCol, cyanCol, iWaveCyan) * iAura * (0.14 + 0.36 * (iWaveGold + iWaveCyan)) +
      whiteHot * iCore * (pow(iWaveGold, 2.0) * 0.7 + pow(iWaveCyan, 2.0) * 0.5);
    innerFlare *= iBackMask;

    vec3 midFlare =
      mix(amberCol, cyanCol, 0.5 + 0.5 * sin(midTheta + t)) *
      mRibbon * (0.35 + 1.05 * mWave) * mBackMask;

    // Gentle steady laptop screen illumination on face/chest (excluded from hands so hands never flicker)
    float frontGoldEnergy = 0.5 + 0.5 * sin(innerAngleA);
    float frontCyanEnergy = 0.5 + 0.5 * sin(outerAngleA);

    vec2 characterLightArea = (uv - vec2(0.51, 0.59)) / vec2(0.15, 0.16);
    float charMask = exp(-dot(characterLightArea, characterLightArea)) * handsShield;

    vec2 screenGlowDelta = (uv - vec2(0.495, 0.54)) / vec2(0.11, 0.11);
    float screenGlowMask = exp(-dot(screenGlowDelta, screenGlowDelta)) * handsShield;
    float screenGlow = 0.045 + 0.015 * sin(t * 1.4);

    vec3 litBase = baseColor * baseRingDim;
    litBase += baseColor * vec3(0.60, 0.86, 1.2) * screenGlowMask * screenGlow;
    litBase += baseColor * goldCol * charMask * (0.03 + 0.10 * frontGoldEnergy);
    litBase += baseColor * cyanCol * charMask * (0.025 + 0.08 * frontCyanEnergy);
    litBase += baseColor * goldCol * (lFlowerMask + rFlowerMask) * (0.05 + 0.10 * oWaveGold);

    vec3 totalFlare = clamp((outerFlare + innerFlare + midFlare) * 0.92, 0.0, 0.98);
    vec3 finalColor = 1.0 - (1.0 - litBase) * (1.0 - totalFlare);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export const CharacterMotionCanvas: React.FC<CharacterMotionCanvasProps> = ({
  imageSrc,
  onReady,
  onFallback,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onReadyRef = useRef(onReady);
  const onFallbackRef = useRef(onFallback);

  onReadyRef.current = onReady;
  onFallbackRef.current = onFallback;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      onFallbackRef.current?.();
      return;
    }

    const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vertShader || !fragShader) {
      onFallbackRef.current?.();
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      onFallbackRef.current?.();
      return;
    }

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      onFallbackRef.current?.();
      return;
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getUniformLocation(program, 'u_tex');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const aspectLoc = gl.getUniformLocation(program, 'u_imgAspect');
    const timeLoc = gl.getUniformLocation(program, 'u_time');

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let imgAspect = 16 / 9;
    let textureReady = false;
    let disposed = false;
    let rafId: number | null = null;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const updateSize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(canvas);

    const startTime = performance.now();

    const draw = (now: number) => {
      if (disposed) return;
      if (textureReady && canvas.width > 0 && canvas.height > 0) {
        const elapsed = prefersReducedMotion ? 0 : (now - startTime) / 1000;
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(texLoc, 0);
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        gl.uniform1f(aspectLoc, imgAspect);
        gl.uniform1f(timeLoc, elapsed);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(draw);
      }
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (disposed) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        imgAspect = img.naturalWidth / img.naturalHeight;
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      textureReady = true;
      onReadyRef.current?.(imgAspect);
      draw(performance.now());
    };
    img.onerror = () => {
      if (!disposed) {
        onFallbackRef.current?.();
      }
    };
    img.src = imageSrc;

    rafId = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
    };
  }, [imageSrc]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Animated curiosity workspace scene with person typing steadily at laptop surrounded by flowing light flares"
      className="w-full h-full translate-y-[4%] pointer-events-none select-none block"
    />
  );
};
