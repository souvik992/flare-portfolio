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

  // Evaluates one expanding flare wave that starts small/tight around the character
  // and gradually grows bigger as it orbits outward, never cutting the face.
  vec3 evalExpandingFlareWave(
    vec2 uv,
    float t,
    float phaseOffset,
    float headOcc,
    float bodyOcc,
    float faceSafe,
    float handsShield
  ) {
    // Smooth 7.5-second expansion cycle [0..1)
    float cycle = fract(t * 0.135 + phaseOffset);
    float grow = smoothstep(0.0, 0.92, cycle);
    float lifeAlpha = smoothstep(0.0, 0.14, cycle) * (1.0 - smoothstep(0.74, 1.0, cycle));

    // Orbit grows from compact around character -> wide sweeping workspace halo
    vec2 radii = mix(vec2(0.24, 0.18), vec2(0.54, 0.30), grow);
    vec2 center = mix(vec2(0.50, 0.67), vec2(0.50, 0.70), grow);
    float tilt = mix(-0.18, -0.05, grow);

    vec2 ec = ellipseCoords(uv, center, radii, tilt);
    float theta = ec.x;
    float dist = ec.y;

    float flowA = fbm(vec2(theta * 3.0 - t * 1.25 + phaseOffset * 6.0, dist * 12.0 + t * 0.35));
    float flowB = fbm(vec2(theta * 6.0 - t * 1.85 + phaseOffset * 11.0, dist * 20.0 - t * 0.55));
    float warp = (flowA - 0.5) * mix(0.045, 0.095, grow) + (flowB - 0.5) * mix(0.015, 0.038, grow);

    // Thickness & bloom start small and gradually become bigger
    float coreWidth = mix(0.014, 0.036, grow);
    float auraWidth = mix(0.045, 0.135, grow);

    float core = exp(-pow((dist + warp) / coreWidth, 2.0));
    float wisps = exp(-pow((dist + warp * 1.4) / (coreWidth * 2.2), 2.0)) * flowB;
    float aura = exp(-pow((dist + warp * 0.5) / auraWidth, 2.0));

    float waveCyan = pow(0.5 + 0.5 * cos(theta - t * 1.35 - phaseOffset * 6.283), 3.4);
    float waveGold = pow(0.5 + 0.5 * cos(theta + 2.5 - t * 1.35 - phaseOffset * 6.283), 3.8);

    // Character sits INSIDE the 3D ellipse:
    // Top/back arc (sin(theta) < 0) passes cleanly behind head & upper body;
    // Front arc (sin(theta) > 0) sweeps below face & clear of hands.
    float personOcc = min(headOcc, bodyOcc);
    float backOcclusion = mix(1.0, personOcc, smoothstep(0.18, -0.25, sin(theta)));
    float visibility = lifeAlpha * backOcclusion * faceSafe * handsShield;

    vec3 cyanCol = vec3(0.32, 0.80, 1.0);
    vec3 goldCol = vec3(1.0, 0.72, 0.25);
    vec3 amberCol = vec3(1.0, 0.50, 0.14);
    vec3 whiteHot = vec3(1.0, 0.98, 0.94);

    float intensityScale = mix(0.55, 1.15, grow);

    vec3 col =
      (cyanCol * (0.22 + 1.15 * waveCyan) + goldCol * (0.18 + 1.25 * waveGold)) *
        (core * (0.55 + 1.05 * flowB) + wisps * 0.8) +
      mix(cyanCol, amberCol, waveGold) * aura * (0.12 + 0.38 * (waveCyan + waveGold)) +
      whiteHot * core * (pow(waveCyan, 2.0) * 0.65 + pow(waveGold, 2.0) * 0.60);

    return col * visibility * intensityScale;
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
    // 1. CALM, STEADY CHARACTER TYPING ANIMATION (NO SHAKING)
    // ---------------------------------------------------------
    float cadence = smoothstep(-0.15, 0.45, sin(t * 1.05) + 0.3 * sin(t * 0.45));

    float breath = sin(t * 1.35);
    vec2 torsoPivot = vec2(0.535, 0.71);
    vec2 torsoRel = (uv - torsoPivot) / vec2(0.115, 0.145);
    float torsoMask = exp(-dot(torsoRel, torsoRel));
    vec2 torsoDisp = vec2(0.0, breath * 0.0046);

    vec2 neckPivot = vec2(0.515, 0.57);
    vec2 headRel = (uv - vec2(0.498, 0.492)) / vec2(0.068, 0.090);
    float headMask = exp(-dot(headRel, headRel));
    float headAngle = sin(t * 0.75) * 0.022;
    vec2 rotatedHead = neckPivot + rotate2D(uv - neckPivot, headAngle);
    vec2 headRotDisp = (rotatedHead - uv) * headMask;
    vec2 headBob = vec2(
      sin(t * 0.65) * 0.0025,
      breath * 0.0040 + sin(t * 1.45 + 0.5) * 0.0016
    ) * headMask;

    // Grounded wrists/arms + clean downward fingertip key-presses only
    vec2 lFingerZone = (uv - vec2(0.418, 0.793)) / vec2(0.022, 0.017);
    float lFingerMask = exp(-dot(lFingerZone, lFingerZone));
    vec2 rFingerZone = (uv - vec2(0.483, 0.786)) / vec2(0.023, 0.017);
    float rFingerMask = exp(-dot(rFingerZone, rFingerZone));

    float lTap1 = pow(max(0.0, sin(t * 5.2)), 6.0);
    float lTap2 = pow(max(0.0, sin(t * 5.2 + 1.85)), 6.0);
    float rTap1 = pow(max(0.0, sin(t * 5.2 + 0.95)), 6.0);
    float rTap2 = pow(max(0.0, sin(t * 5.2 + 2.85)), 6.0);

    vec2 fingerDisp =
      lFingerMask * vec2(0.0, (lTap1 * 0.0046 + lTap2 * 0.0034) * cadence) +
      rFingerMask * vec2(0.0, (rTap1 * 0.0046 + rTap2 * 0.0034) * cadence);

    // Yellow lilies gentle breeze sway
    vec2 lFlowerRel = (uv - vec2(0.255, 0.675)) / vec2(0.11, 0.13);
    float lFlowerMask = exp(-dot(lFlowerRel, lFlowerRel));
    vec2 rFlowerRel = (uv - vec2(0.855, 0.645)) / vec2(0.12, 0.15);
    float rFlowerMask = exp(-dot(rFlowerRel, rFlowerRel));

    vec2 flowerDisp =
      lFlowerMask * vec2(sin(t * 1.05) * 0.0050, cos(t * 0.85) * 0.0020) +
      rFlowerMask * vec2(sin(t * 0.98 + 1.3) * 0.0055, cos(t * 0.82 + 0.7) * 0.0024);

    vec2 sampleUv = uv
      - torsoMask * torsoDisp
      - headRotDisp
      - headBob
      - fingerDisp
      - flowerDisp;

    // Natural eye blink
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
    // 2. ANIMATED EXPANDING FLARES AROUND CHARACTER (INSIDE FLARE)
    // ---------------------------------------------------------

    // Occlusion & protection masks so character stays clearly inside the flare
    vec2 headOccDelta = (uv - vec2(0.498, 0.495)) / vec2(0.056, 0.095);
    float headOcc = smoothstep(0.55, 1.18, length(headOccDelta));

    vec2 bodyOccDelta = (uv - vec2(0.525, 0.695)) / vec2(0.105, 0.185);
    float bodyOcc = smoothstep(0.45, 1.15, length(bodyOccDelta));

    // Strict face-safe mask so NO flare ever cuts across the face
    vec2 faceSafeDelta = (uv - vec2(0.498, 0.498)) / vec2(0.068, 0.105);
    float faceSafe = smoothstep(0.78, 1.28, length(faceSafeDelta));

    // Keep hands/keyboard free of distortion
    vec2 handsShieldDelta = (uv - vec2(0.46, 0.79)) / vec2(0.095, 0.055);
    float handsShield = smoothstep(0.45, 1.25, length(handsShieldDelta));

    // Three staggered expanding waves: small near character -> grow larger outward
    vec3 flareW1 = evalExpandingFlareWave(uv, t, 0.00, headOcc, bodyOcc, faceSafe, handsShield);
    vec3 flareW2 = evalExpandingFlareWave(uv, t, 0.33, headOcc, bodyOcc, faceSafe, handsShield);
    vec3 flareW3 = evalExpandingFlareWave(uv, t, 0.67, headOcc, bodyOcc, faceSafe, handsShield);

    vec3 totalFlare = clamp((flareW1 + flareW2 + flareW3) * 0.92, 0.0, 0.98);

    // Subtle dynamic rim & bounce light from the orbiting flares
    vec3 goldCol = vec3(1.0, 0.72, 0.25);
    vec3 cyanCol = vec3(0.32, 0.80, 1.0);

    vec2 screenGlowDelta = (uv - vec2(0.495, 0.54)) / vec2(0.11, 0.11);
    float screenGlowMask = exp(-dot(screenGlowDelta, screenGlowDelta)) * handsShield;
    float screenGlow = 0.04 + 0.015 * sin(t * 1.4);

    vec3 litBase = baseColor;
    litBase += baseColor * vec3(0.60, 0.86, 1.2) * screenGlowMask * screenGlow;
    litBase += baseColor * goldCol * (lFlowerMask + rFlowerMask) * (0.04 + 0.08 * (0.5 + 0.5 * sin(t * 1.35)));
    litBase += baseColor * cyanCol * torsoMask * handsShield * (0.02 + 0.05 * (0.5 + 0.5 * cos(t * 1.35)));

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
      aria-label="Animated scene with Souvik typing calmly at laptop inside expanding luminous flares"
      className="w-full h-full translate-y-[4%] pointer-events-none select-none block"
    />
  );
};
