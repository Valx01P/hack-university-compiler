"use client";

import { useEffect, useRef, useState } from "react";
import { useStarsAmount, useStarsBrightness, useStarsOn } from "@/lib/theme";

/**
 * The Stars setting (lib/theme.ts): a starry background behind the whole app,
 * off by default. One WebGL fragment shader on a fixed canvas behind the page
 * draws three layers of twinkling stars that drift slowly, and a soft nebula
 * glow. While it's on, the app's large backgrounds are see-through, code
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

  // the nebula: soft clouds in the glow color, brightest at the top
  float pageY = px.y + u_scroll;
  vec2 np = vec2(px.x, px.y + u_scroll * 0.35) / 480.0;
  float n = smoothstep(0.42, 0.95, fbm(np + vec2(u_time * 0.012, 0.0)));
  float near = exp(-pow(pageY / 1000.0, 2.0)) * 0.85 + 0.2;
  float neb = n * 0.17 * near;
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
  };
}

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
  // The sliders, read by the draw loop. 70% brightness and 60% amount are the
  // defaults, the same sky as the homepage of hackuniversity.dev.
  const levels = useRef({ bright: brightness / 70, amount: amount / 60 });
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    levels.current = { bright: brightness / 70, amount: amount / 60 };
    redrawRef.current();
  }, [brightness, amount]);

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
