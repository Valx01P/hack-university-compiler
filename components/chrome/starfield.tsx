"use client";

import { useEffect, useRef, useState } from "react";
import {
  CLOUD_STYLES,
  type CloudPlace,
  useCloudPlace,
  useCloudStyle,
  useCloudsAmount,
  useStarsAmount,
  useStarsBrightness,
  useStarsOn,
} from "@/lib/theme";

/**
 * The Stars setting (lib/theme.ts): a starry background behind the whole app,
 * off by default. One WebGL fragment shader on a fixed canvas behind the page
 * draws three layers of twinkling stars that drift slowly, and soft clouds
 * in one of five versions (wisps, swirl, band, bloom, aurora), as much of
 * them as the Cover slider says, gathered where the Where picker says. While it's on, the app's large backgrounds are see-through, code
 * editors and code blocks included, so the sky shows behind everything
 * (globals.css), and floating menus keep their fills.
 *
 * Every color comes from the theme tokens (--ink for the stars and --gold for
 * the tinted ones and the glow, or the theme's yellow for every star on the
 * light theme), re-read whenever <html>'s theme or contrast changes. The
 * Brightness and Amount sliders set its strength and how many stars there
 * are. It caps at 30fps and a modest resolution, stops while the tab is
 * hidden (requestAnimationFrame does that), and under reduced motion draws
 * one still frame. Without WebGL it renders nothing. The homepage of
 * hackuniversity.dev draws the same sky.
 */

const VERTEX = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 u_res;
uniform float u_scale;
uniform float u_time;
uniform float u_scroll;
uniform vec3 u_star;
uniform vec3 u_glow;
uniform float u_bright;
uniform float u_amount;
uniform float u_cloudStyle;
uniform float u_cloudAmount;
uniform vec2 u_cloudAt;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

// One layer of stars on a grid of cells (css px): at most one star per cell,
// kept away from the cell's edges so its halo never crosses into the next.
// The Amount slider scales how many cells hold one.
vec4 stars(vec2 px, float cell, float density, float size, float seed) {
  vec2 id = floor(px / cell);
  vec2 f = fract(px / cell);
  float h = hash21(id + seed);
  if (h > min(density * u_amount, 0.9)) return vec4(0.0);
  vec2 pos = 0.2 + 0.6 * vec2(hash21(id + seed * 1.7), hash21(id + seed * 2.9));
  float d = length((f - pos) * cell);
  float r = size * (0.5 + 0.9 * hash21(id + seed * 3.3));
  float speed = 0.5 + 1.6 * hash21(id + seed * 4.1);
  float tw = 0.6 + 0.4 * sin(u_time * speed + 6.2831 * hash21(id + seed * 5.3));
  float core = smoothstep(r, 0.0, d);
  float halo = exp(-(d * d) / (r * r * 10.0)) * 0.4;
  float s = (core + halo) * tw;
  float tint = step(0.7, hash21(id + seed * 6.7));
  return vec4(mix(u_star, u_glow, tint * 0.9) * s, s);
}

// The clouds, in the version picked in the theme menu (0 wisps, 1 swirl,
// 2 band, 3 bloom, 4 aurora). d is the distance from where they gather, in
// screen heights, and spread is how far they reach. More cover reaches a
// little further and fills more of the sky, so the spot stays clear.
float clouds(vec2 px, vec2 uv, float aspect) {
  vec2 p = px / 480.0 + vec2(u_time * 0.012, 0.0);
  vec2 d = (uv - u_cloudAt) * vec2(aspect, 1.0);
  float spread = mix(0.35, 0.85, u_cloudAmount);
  float gather = exp(-dot(d, d) / (spread * spread));
  float lo = mix(0.58, 0.3, u_cloudAmount);
  if (u_cloudStyle < 0.5) {
    // wisps: soft drifting streaks over a faint glow at the spot, so the
    // spot always shows wherever the streaks fall
    return (0.35 + smoothstep(lo, lo + 0.5, fbm(p))) * gather * 1.4;
  }
  if (u_cloudStyle < 1.5) {
    // swirl: the same noise folded into itself, so it curls, over the same
    // faint glow at the spot
    vec2 q = vec2(fbm(p + vec2(0.0, u_time * 0.01)), fbm(p + vec2(5.2, 1.3)));
    return (0.3 + smoothstep(lo - 0.05, lo + 0.5, fbm(p + 1.8 * q))) * gather * 1.35;
  }
  if (u_cloudStyle < 2.5) {
    // band: a river of light across the screen through the spot, with dark
    // dust lanes in it
    vec2 dir = normalize(vec2(1.0, -0.45));
    float off = dot(d, vec2(-dir.y, dir.x));
    float width = mix(0.07, 0.22, u_cloudAmount);
    float band = exp(-(off * off) / (width * width));
    float lanes = smoothstep(0.25, 0.75, fbm(p * 2.2 + 3.0));
    return band * (0.45 + 0.75 * fbm(p * 1.4)) * (0.55 + 0.45 * lanes);
  }
  if (u_cloudStyle < 3.5) {
    // bloom: a cluster of soft round glows around the spot, slowly breathing
    float c = 0.0;
    float size = 0.7 + 0.6 * u_cloudAmount;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      vec2 o = vec2(hash21(vec2(fi, 1.3)), hash21(vec2(fi, 7.9))) - 0.5;
      vec2 b = d - o * spread * 0.6 - 0.03 * vec2(sin(u_time * 0.07 + fi), cos(u_time * 0.05 + fi * 2.0));
      float r = (0.09 + 0.1 * hash21(vec2(fi, 4.4))) * size;
      c += exp(-dot(b, b) / (r * r)) * (0.5 + 0.5 * hash21(vec2(fi, 2.2)));
    }
    return c * (0.6 + 0.6 * fbm(p * 1.5));
  }
  // aurora: curtains hung across at the spot's height (kept on screen), with
  // a sharp lower edge that fades upward, and soft shifting rays
  vec2 at = vec2(u_cloudAt.x, clamp(u_cloudAt.y, 0.22, 0.85));
  vec2 e = (uv - at) * vec2(aspect, 1.0);
  float wave = 0.05 * sin(e.x * 4.0 + u_time * 0.15) + 0.06 * (fbm(vec2(e.x * 2.5, u_time * 0.02)) - 0.5);
  float y = e.y + wave;
  float curtain = exp(-(y * y) / (y < 0.0 ? 0.035 : 0.0018));
  float y2 = y + 0.09;
  float upper = 0.55 * exp(-(y2 * y2) / (y2 < 0.0 ? 0.02 : 0.0015));
  float rays = 0.62 + 0.38 * sin(e.x * 36.0 + fbm(p * 2.0 + vec2(u_time * 0.05, 0.0)) * 10.0);
  float reach = smoothstep(0.0, 0.4, 1.0 - abs(e.x) / (spread * 1.7));
  return (curtain + upper) * rays * reach;
}

void main() {
  // css px from the top left of the viewport
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_scale;
  float drift = u_time * 2.5;

  // far, middle, and near layers: the nearer ones are bigger, brighter, and
  // move more with scroll
  vec4 s1 = stars(px + vec2(drift * 0.3, u_scroll * 0.05), 58.0, 0.45, 0.8, 1.0);
  vec4 s2 = stars(px + vec2(drift * 0.6, u_scroll * 0.12), 104.0, 0.4, 1.15, 7.0);
  vec4 s3 = stars(px + vec2(drift, u_scroll * 0.22), 176.0, 0.32, 1.6, 13.0);
  vec3 col = s1.rgb * 0.5 + s2.rgb * 0.75 + s3.rgb;
  float a = s1.a * 0.5 + s2.a * 0.75 + s3.a;

  // the clouds, in the glow color (cover 50% is the homepage's strength)
  vec2 view = u_res / u_scale;
  float neb = clouds(px, px / view, view.x / view.y) * 0.17 * u_cloudAmount * 2.0;
  col += u_glow * neb;
  a += neb;

  a = clamp(a * u_bright, 0.0, 1.0);
  gl_FragColor = vec4(min(col * u_bright, vec3(a)), a);
}
`;

/** A theme token as 0 to 1 sRGB, whatever color syntax the token uses. */
function tokenRgb(name: string): [number, number, number] {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return [1, 1, 1];
  g.fillStyle = resolved;
  g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  return [r / 255, gg / 255, b / 255];
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

/** The program, its full-screen triangle, and its uniforms. */
function build(gl: WebGLRenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // one triangle that covers the whole viewport
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = (n: string) => gl.getUniformLocation(prog, n);
  return {
    free() {
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
    res: u("u_res"),
    scale: u("u_scale"),
    time: u("u_time"),
    scroll: u("u_scroll"),
    star: u("u_star"),
    glow: u("u_glow"),
    bright: u("u_bright"),
    amount: u("u_amount"),
    cloudStyle: u("u_cloudStyle"),
    cloudAmount: u("u_cloudAmount"),
    cloudAt: u("u_cloudAt"),
  };
}

/** Where each Where pick gathers the clouds, as a fraction of the screen. */
const CLOUD_AT: Record<CloudPlace, [number, number]> = {
  "top-left": [0.15, 0.12],
  top: [0.5, 0.06],
  "top-right": [0.85, 0.12],
  left: [0.1, 0.5],
  center: [0.5, 0.5],
  right: [0.9, 0.5],
  "bottom-left": [0.15, 0.88],
  bottom: [0.5, 0.94],
  "bottom-right": [0.85, 0.88],
};

export function Starfield() {
  const on = useStarsOn();
  return on ? <Sky /> : null;
}

function Sky() {
  const ref = useRef<HTMLCanvasElement>(null);
  // Bumped to swap in a fresh canvas when this one's context is already lost
  // (a lost context can't be revived from a fresh run of the effect).
  const [canvasKey, setCanvasKey] = useState(0);
  const brightness = useStarsBrightness();
  const amount = useStarsAmount();
  const cloudStyle = useCloudStyle();
  const cloudPlace = useCloudPlace();
  const cloudCover = useCloudsAmount();
  // The settings, read by the draw loop (this effect runs before the one that
  // starts it). 70% brightness, 60% amount, and wisps at the top at 50% cover
  // are the defaults, the same sky as the homepage of hackuniversity.dev.
  const levels = useRef({ bright: 1, amount: 1, cloudStyle: 0, cloudAt: CLOUD_AT.top, cloudAmount: 0.5 });
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    levels.current = {
      bright: brightness / 70,
      amount: amount / 60,
      cloudStyle: Math.max(0, CLOUD_STYLES.findIndex((c) => c.id === cloudStyle)),
      cloudAt: CLOUD_AT[cloudPlace],
      cloudAmount: cloudCover / 100,
    };
    redrawRef.current();
  }, [brightness, amount, cloudStyle, cloudPlace, cloudCover]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return;
    if (gl.isContextLost()) {
      if (canvasKey < 2) setCanvasKey((k) => k + 1);
      return;
    }

    const root = document.documentElement;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let gpu: ReturnType<typeof build> = null;
    let raf = 0;
    let last = 0;
    let shown = false;

    const readTheme = () => {
      if (!gpu) return;
      if (root.hasAttribute("data-dark")) {
        // light stars, some tinted with the theme's pop color
        gl.uniform3fv(gpu.star, tokenRgb("--ink"));
        gl.uniform3fv(gpu.glow, tokenRgb("--gold"));
      } else {
        // Light stars would vanish on the light theme's page, so every star
        // is yellow, like the dark themes' gold. At high and super contrast
        // --gold darkens for text, so the bright yellow there is
        // --accent-strong.
        const contrast = root.getAttribute("data-contrast");
        const yellow = tokenRgb(contrast === "high" || contrast === "super" ? "--accent-strong" : "--gold");
        gl.uniform3fv(gpu.star, yellow);
        gl.uniform3fv(gpu.glow, yellow);
      }
    };

    const resize = () => {
      if (!gpu) return;
      const scale = Math.min(window.devicePixelRatio || 1, 1.25);
      const w = Math.round(window.innerWidth * scale);
      const h = Math.round(window.innerHeight * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(gpu.res, w, h);
      gl.uniform1f(gpu.scale, scale);
    };

    const draw = (now: number) => {
      if (!gpu) return;
      gl.uniform1f(gpu.time, still ? 0 : (now - start) / 1000);
      gl.uniform1f(gpu.scroll, window.scrollY);
      gl.uniform1f(gpu.bright, levels.current.bright);
      gl.uniform1f(gpu.amount, levels.current.amount);
      gl.uniform1f(gpu.cloudStyle, levels.current.cloudStyle);
      gl.uniform1f(gpu.cloudAmount, levels.current.cloudAmount);
      gl.uniform2f(gpu.cloudAt, levels.current.cloudAt[0], levels.current.cloudAt[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!shown) {
        shown = true;
        canvas.style.opacity = "1";
      }
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      draw(now);
    };
    const redraw = () => {
      if (still) requestAnimationFrame(draw);
    };
    redrawRef.current = redraw;

    const begin = () => {
      gpu = build(gl);
      if (!gpu) return;
      readTheme();
      resize();
      cancelAnimationFrame(raf);
      if (still) requestAnimationFrame(draw);
      else raf = requestAnimationFrame(loop);
    };
    // A context lost while running (a GPU reset) pauses it, and the browser's
    // restore builds everything again.
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      gpu = null;
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", begin);
    begin();

    const themeWatch = new MutationObserver(() => {
      readTheme();
      redraw();
    });
    themeWatch.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-contrast", "data-dark"] });
    const onResize = () => {
      resize();
      redraw();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", redraw, { passive: true });

    // Cleanup frees the GPU side but keeps the context: React may run this
    // effect again on the same canvas (in development it always does, once),
    // and a context thrown away here would come back lost.
    return () => {
      redrawRef.current = () => {};
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", redraw);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", begin);
      if (gpu && !gl.isContextLost()) gpu.free();
      gpu = null;
    };
  }, [canvasKey]);

  return (
    <canvas
      key={canvasKey}
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-0 transition-opacity duration-1000"
    />
  );
}
