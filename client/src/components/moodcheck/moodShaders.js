import { NOISE_GLSL } from '../landing/hero/shaders';

// Дуален шейдър за Mood Check: Aura (baked формации + blend) и Mirror
// (landmark DataTexture + texelFetch), избирани чрез damped uMode float —
// превключването е плавен морф между стилизираното и живото лице.
//
// ВАЖНО: three r163+ компилира всеки ShaderMaterial като #version 300 es —
// texelFetch работи директно в GLSL1-стил код. НЕ задавай glslVersion: GLSL3
// и НЕ пиши #version ръчно.

export const moodVertex = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D uLandmarks;
uniform float uTime;
uniform float uMode;      // 0 = aura, 1 = mirror (damped)
uniform float uBlend;     // 0..1 преход между from/to формации (aura)
uniform float uPresence;  // 0 = ambient облак, 1 = лице (damped)
uniform float uSize;
uniform float uPixelRatio;
attribute vec3 aPosTo;
attribute vec3 aAmbient;
attribute vec3 aJitter;
attribute vec3 aTri;      // 3 landmark индекса на триъгълника (barycentric binding)
attribute vec3 aBary;     // барицентрични тегла (сумират до 1)
attribute float aSeed;
varying float vAlpha;
varying float vCore;

void main() {
  // Aura: eased blend между двете формации (position играе ролята на aPosFrom)
  float b = uBlend * uBlend * (3.0 - 2.0 * uBlend);
  vec3 auraPos = mix(position, aPosTo, b);

  // Mirror: барицентрична интерполация върху триъгълник от живия face mesh —
  // частиците покриват ПОВЪРХНОСТТА на лицето, не клъстери около точки
  vec3 lmA = texelFetch(uLandmarks, ivec2(int(aTri.x + 0.5), 0), 0).xyz;
  vec3 lmB = texelFetch(uLandmarks, ivec2(int(aTri.y + 0.5), 0), 0).xyz;
  vec3 lmC = texelFetch(uLandmarks, ivec2(int(aTri.z + 0.5), 0), 0).xyz;
  vec3 mirrorPos = lmA * aBary.x + lmB * aBary.y + lmC * aBary.z + aJitter;

  vec3 facePos = mix(auraPos, mirrorPos, uMode);
  vec3 p = mix(aAmbient, facePos, uPresence);

  // Дрейф: жив в ambient, почти нулев върху лицето в mirror (1:1 точност)
  float faceAmp = mix(0.05, 0.012, uMode);
  float amp = mix(0.35, faceAmp, uPresence);
  p += flowNoise(p * 0.6 + aSeed * 10.0, uTime * 0.08) * amp;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // В mirror режим точките са по-дребни и по-равномерни — повече детайл
  float sizeScale = mix(0.7 + 0.6 * aSeed, 0.55 + 0.25 * aSeed, uMode);
  gl_PointSize = clamp(uSize * sizeScale * uPixelRatio * (1.0 / -mv.z), 1.0, 14.0);

  float twinkle = mix(0.75 + 0.25 * sin(uTime * 0.9 + aSeed * 6.2831), 0.95, uMode * uPresence);
  vAlpha = twinkle * smoothstep(15.0, 7.0, -mv.z);
  vCore = aSeed;
}
`;

export const moodFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
varying float vCore;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  core *= core;
  vec3 col = mix(uColor * 0.7, mix(uColor, vec3(1.0), 0.35), core);
  float a = core * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;
