import { NOISE_GLSL } from '../landing/hero/shaders';

// MIRROR shader — три източника на позиция:
//  1. Живо лице: barycentric семплиране на MediaPipe mesh-а (uAvatarMode→0)
//  2. Character/Drawn: aCharPos в head-локални координати, rigged от живите
//     blendshapes (uJaw/uBlink/uSmile по aRegion) + head pose (uAvatarMode→1)
//  3. Direct блокове (aDirect=1): accessories/emitter/hands/trail — CPU-писани
//     световни координати в position атрибута
//
// region: 0 skin · 1 mouth · 2 eyeL · 3 eyeR
// ВАЖНО: three r163+ компилира като #version 300 es — texelFetch е ОК.

export const moodVertex = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D uLandmarks;
uniform float uTime;
uniform float uPresence;
uniform float uSize;
uniform float uSizeMul;
uniform float uPixelRatio;
uniform float uAvatarMode;   // 0 живо лице · 1 character/drawn (damped)
uniform vec3 uHeadPos;
uniform vec3 uHeadR;
uniform vec3 uHeadU;
uniform vec3 uHeadF;
uniform float uHeadScale;
uniform float uJaw;
uniform float uBlinkL;
uniform float uBlinkR;
uniform float uSmile;
uniform vec2 uEyeLC;
uniform vec2 uEyeRC;
uniform vec2 uMouthC;
attribute vec3 aAmbient;
attribute vec3 aJitter;
attribute vec3 aTri;
attribute vec3 aBary;
attribute vec3 aCharPos;     // head-локална позиция за character/drawn
attribute float aRegion;     // 0 skin / 1 mouth / 2 eyeL / 3 eyeR
attribute float aSeed;
attribute float aDirect;     // 1 = position е директна световна координата
varying float vAlpha;
varying float vDirect;

void main() {
  // ── Живо лице (mirror) ──
  vec3 lmA = texelFetch(uLandmarks, ivec2(int(aTri.x + 0.5), 0), 0).xyz;
  vec3 lmB = texelFetch(uLandmarks, ivec2(int(aTri.y + 0.5), 0), 0).xyz;
  vec3 lmC = texelFetch(uLandmarks, ivec2(int(aTri.z + 0.5), 0), 0).xyz;
  vec3 mirrorPos = lmA * aBary.x + lmB * aBary.y + lmC * aBary.z + aJitter;

  // ── Character/Drawn: rig в head-локални координати ──
  vec3 cp = aCharPos;
  // Мигане: очният регион се свива вертикално към центъра на окото
  if (aRegion > 1.5 && aRegion < 2.5) {
    cp.y = uEyeLC.y + (cp.y - uEyeLC.y) * (1.0 - uBlinkL * 0.9);
  } else if (aRegion > 2.5) {
    cp.y = uEyeRC.y + (cp.y - uEyeRC.y) * (1.0 - uBlinkR * 0.9);
  } else if (aRegion > 0.5) {
    // Уста: долната половина пада с jawOpen; ъглите се вдигат при усмивка
    float lower = step(cp.y, uMouthC.y);
    cp.y -= uJaw * 0.55 * lower;
    float xr = clamp(abs(cp.x - uMouthC.x) / 0.6, 0.0, 1.0);
    cp.y += uSmile * 0.28 * xr * xr;
  }
  // Head pose: локално → световно (basis от живите очи)
  vec3 charWorld = uHeadPos + (uHeadR * cp.x + uHeadU * cp.y + uHeadF * cp.z) * uHeadScale;

  vec3 facePos = mix(mirrorPos, charWorld, uAvatarMode);
  // Direct блокове ползват position директно
  vec3 basePos = mix(facePos, position, aDirect);
  vec3 p = mix(aAmbient, basePos, uPresence);

  float amp = mix(0.35, 0.012 + aDirect * 0.01, uPresence);
  p += flowNoise(p * 0.6 + aSeed * 10.0, uTime * 0.08) * amp;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float sizeScale = 0.55 + 0.25 * aSeed + aDirect * 0.35;
  gl_PointSize = clamp(uSize * sizeScale * uSizeMul * uPixelRatio * (1.0 / -mv.z), 1.0, 18.0);

  float twinkle = mix(0.8 + 0.2 * sin(uTime * 0.9 + aSeed * 6.2831), 0.95, uPresence);
  vAlpha = twinkle * smoothstep(15.0, 7.0, -mv.z);
  vDirect = aDirect;
}
`;

export const moodFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uGlow;
varying float vAlpha;
varying float vDirect;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  core *= core;

  float glowMix = 0.2 + uGlow * 0.6 + vDirect * 0.2;
  vec3 col = mix(uColor * 0.7, mix(uColor, vec3(1.0), glowMix), core);
  float a = core * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;
