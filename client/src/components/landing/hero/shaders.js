// GLSL шейдъри за hero сцената. NOISE_GLSL е Ashima Arts / Ian McEwan
// simplex noise (stegu/webgl-noise, MIT) — prepend-ва се към шейдърите,
// които го ползват.

export const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

vec3 flowNoise(vec3 p, float t) {
  return vec3(
    snoise(p + vec3(0.0, t, 0.0)),
    snoise(p + vec3(43.7, t, 17.3)),
    snoise(p + vec3(-17.9, -31.2, t))
  );
}
`;

export const sculptureVertex = /* glsl */ `
${NOISE_GLSL}
attribute vec3 aPosB;
attribute vec3 aPosC;
attribute vec3 aPosD;
attribute vec3 aPosE;
attribute vec3 aPosF;
attribute vec4 aRand;
attribute vec3 aDir;
uniform float uTime;
uniform float uMorph;
uniform float uScatter;
uniform float uSize;
uniform float uPixelRatio;
uniform float uMouseForce;
uniform vec3 uMouse;
varying float vAlpha;
varying float vAccent;

void main() {
  // 1. цикличен морф между 6-те формации, десинхронизиран на частица
  float m = mod(uMorph + aRand.w * 0.18, 6.0);
  vec3 base;
  if (m < 1.0)      base = mix(position, aPosB, smoothstep(0.0, 1.0, m));
  else if (m < 2.0) base = mix(aPosB, aPosC, smoothstep(0.0, 1.0, m - 1.0));
  else if (m < 3.0) base = mix(aPosC, aPosD, smoothstep(0.0, 1.0, m - 2.0));
  else if (m < 4.0) base = mix(aPosD, aPosE, smoothstep(0.0, 1.0, m - 3.0));
  else if (m < 5.0) base = mix(aPosE, aPosF, smoothstep(0.0, 1.0, m - 4.0));
  else              base = mix(aPosF, position, smoothstep(0.0, 1.0, m - 5.0));

  // 2. живо "дишащо" течение
  float t = uTime * 0.08;
  float breathe = 1.0 + 0.25 * sin(uTime * 0.3 + aRand.y);
  vec3 drift = flowNoise(base * 0.55 + aRand.z, t) * (0.16 * breathe + 0.9 * uScatter);

  // 3. scroll разпръскване — квадратично, задържа формата в началото
  vec3 p = base + drift + aDir * (uScatter * uScatter) * (2.5 + 2.0 * aRand.x);

  // 4. отблъскване от мишката (xy равнина)
  vec2 toMouse = p.xy - uMouse.xy;
  float d = length(toMouse);
  float infl = smoothstep(1.6, 0.0, d);
  p.xy += normalize(toMouse + 1e-4) * infl * infl * 0.45 * uMouseForce;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * aRand.x * uPixelRatio * (1.0 / -mv.z), 1.5, 18.0);

  float twinkle = 0.75 + 0.25 * sin(uTime * 0.9 + aRand.y * 6.2831);
  vAlpha = twinkle
         * smoothstep(15.0, 7.0, -mv.z)
         * (1.0 - 0.85 * uScatter);
  vAccent = aRand.w + infl * 1.5;
}
`;

export const sculptureFragment = /* glsl */ `
uniform vec3 uColorBase;
uniform vec3 uColorDim;
uniform vec3 uColorCyan;
uniform vec3 uColorViolet;
uniform vec3 uColorGold;
varying float vAlpha;
varying float vAccent;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  core *= core;
  vec3 col = mix(uColorDim, uColorBase, core);
  col = mix(col, uColorCyan,   smoothstep(0.72, 1.05, fract(vAccent * 7.31)) * 0.6);
  col = mix(col, uColorViolet, smoothstep(0.75, 1.05, fract(vAccent * 3.17)) * 0.55);
  col = mix(col, uColorGold,   smoothstep(0.78, 1.05, fract(vAccent * 5.13)) * 0.5);
  float a = core * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

export const linesVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const linesFragment = /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
uniform float uScatter;
uniform float uAspect;
uniform vec3 uColorDim;
uniform vec3 uColorBase;
uniform vec3 uColorCyan;
uniform vec3 uColorViolet;
varying vec2 vUv;

float fbm(vec2 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    f += a * snoise(vec3(p, 7.0));
    p *= 2.1;
    a *= 0.5;
  }
  return f;
}

void main() {
  vec2 uv = vec2(vUv.x * uAspect, vUv.y);
  float t = uTime * 0.03;
  float w1 = fbm(uv * 1.2 + vec2(0.0, t));
  float w2 = fbm(uv * 2.3 + vec2(-t * 0.7, 0.0) + w1);
  float y = vUv.y + 0.35 * w1 + 0.15 * w2;

  float bands = y * 42.0;
  float f = abs(fract(bands) - 0.5);
  float aa = fwidth(bands);
  float line = 1.0 - smoothstep(0.0, aa * 1.5 + 0.02, f);

  float mask = smoothstep(1.0, 0.35, abs(vUv.y - 0.5) * 2.0) * (0.45 + 0.55 * (w1 * 0.5 + 0.5));

  vec3 col = mix(uColorDim, uColorBase, w2 * 0.5 + 0.5);
  col = mix(col, uColorCyan,   smoothstep(0.55, 0.90, fbm(uv * 0.8 + 5.0 + t)) * 0.35);
  col = mix(col, uColorViolet, smoothstep(0.60, 0.95, w1) * 0.25);

  float alpha = line * mask * 0.10 * (1.0 - 0.5 * uScatter);
  gl_FragColor = vec4(col * alpha, 1.0);
}
`;

export const dustVertex = /* glsl */ `
attribute float aScale;
attribute float aPhase;
uniform float uTime;
uniform float uScatter;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  vec3 p = position;
  float speed = 1.0 + 0.3 * uScatter;
  p.x += sin(uTime * 0.12 * speed + aPhase) * 0.4;
  p.y += cos(uTime * 0.09 * speed + aPhase * 1.7) * 0.3;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aScale * uPixelRatio * (14.0 / -mv.z), 1.0, 3.0);
  vAlpha = 0.25 * (0.6 + 0.4 * sin(uTime * 0.5 + aPhase * 3.0));
}
`;

export const dustFragment = /* glsl */ `
uniform vec3 uColorDim;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.1, d);
  float a = core * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColorDim, a);
}
`;

// ── Декоративни партикъл акценти (други секции на сайта) — единична
// статична формация, лек "дишащ" дрейф, без morph/scroll/mouse.
export const accentVertex = /* glsl */ `
${NOISE_GLSL}
attribute vec4 aRand;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  float t = uTime * 0.08;
  float breathe = 1.0 + 0.2 * sin(uTime * 0.25 + aRand.y);
  vec3 drift = flowNoise(position * 0.5 + aRand.z, t) * 0.1 * breathe;
  vec3 p = position + drift;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * aRand.x * uPixelRatio * (1.0 / -mv.z), 1.0, 14.0);

  float twinkle = 0.7 + 0.3 * sin(uTime * 0.8 + aRand.y * 6.2831);
  vAlpha = twinkle * smoothstep(15.0, 7.0, -mv.z);
}
`;

export const accentFragment = /* glsl */ `
uniform vec3 uColorBase;
uniform vec3 uColorDim;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  core *= core;
  vec3 col = mix(uColorDim, uColorBase, core);
  float a = core * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;
