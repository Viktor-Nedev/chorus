import { NOISE_GLSL } from '../landing/hero/shaders';

// Mirror shader: живото лице (barycentric семплиране на MediaPipe mesh-а) +
// аксесоарни частици (aAccessory=1 ползват position директно в world space).
// Цветът идва от uColor (емоция ИЛИ фиксиран цвят на аватара — решава се на CPU).
//
// ВАЖНО: three r163+ компилира като #version 300 es — texelFetch е ОК; НЕ
// задавай glslVersion GLSL3 и НЕ пиши #version ръчно.

export const moodVertex = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D uLandmarks;
uniform float uTime;
uniform float uMode;
uniform float uBlend;
uniform float uPresence;
uniform float uSize;
uniform float uSizeMul;
uniform float uPixelRatio;
attribute vec3 aPosTo;
attribute vec3 aAmbient;
attribute vec3 aJitter;
attribute vec3 aTri;
attribute vec3 aBary;
attribute float aSeed;
attribute float aAccessory;   // 0 = частица от лицето, 1 = аксесоар (герой)
varying float vAlpha;
varying float vAccessory;

void main() {
  float b = uBlend * uBlend * (3.0 - 2.0 * uBlend);
  vec3 auraPos = mix(position, aPosTo, b);

  vec3 lmA = texelFetch(uLandmarks, ivec2(int(aTri.x + 0.5), 0), 0).xyz;
  vec3 lmB = texelFetch(uLandmarks, ivec2(int(aTri.y + 0.5), 0), 0).xyz;
  vec3 lmC = texelFetch(uLandmarks, ivec2(int(aTri.z + 0.5), 0), 0).xyz;
  vec3 mirrorPos = lmA * aBary.x + lmB * aBary.y + lmC * aBary.z + aJitter;

  vec3 facePos = mix(auraPos, mirrorPos, uMode);
  // Аксесоарите ползват position директно (world coords, писани всеки кадър)
  vec3 basePos = mix(facePos, position, aAccessory);
  vec3 p = mix(aAmbient, basePos, uPresence);

  float faceAmp = mix(0.05, 0.012, uMode);
  float amp = mix(0.35, faceAmp, uPresence);
  p += flowNoise(p * 0.6 + aSeed * 10.0, uTime * 0.08) * amp;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float sizeScale = mix(0.7 + 0.6 * aSeed, 0.55 + 0.25 * aSeed, uMode);
  float accBoost = 1.0 + aAccessory * 0.6;
  gl_PointSize = clamp(uSize * sizeScale * uSizeMul * accBoost * uPixelRatio * (1.0 / -mv.z), 1.0, 18.0);

  float twinkle = mix(0.75 + 0.25 * sin(uTime * 0.9 + aSeed * 6.2831), 0.95, uMode * uPresence);
  vAlpha = twinkle * smoothstep(15.0, 7.0, -mv.z);
  vAccessory = aAccessory;
}
`;

export const moodFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uGlow;
varying float vAlpha;
varying float vAccessory;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  core *= core;

  // Аксесоарите са малко по-ярки/белезникави, за да "изпъкват" като герой
  float glowMix = 0.2 + uGlow * 0.6 + vAccessory * 0.2;
  vec3 col = mix(uColor * 0.7, mix(uColor, vec3(1.0), glowMix), core);
  float a = core * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;
