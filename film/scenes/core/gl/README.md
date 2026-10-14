# scenes/core/gl — shaders, ink, paper light, 3D stage, thought particles

```ts
import {MindSpace, InkReveal, inkBleed, PaperLight, Grain, ShaderLayer,
        Stage3D, Card3D, PaperSheet3D, ThoughtParticles, particleTimeline} from '@ep/scenes/core/gl';
```

Every composition that uses these still needs `useFontsReady()` once at its root (textures and particle glyphs are drawn from the inlined SHS / LXGW fonts, so only characters of the locked script exist).

Demos: `dev/gl.tsx` (compositions `GLMindSpace`, `GLInkLayer`, `GLInkMask`, `GLInkMaskCss`, `GLInkTransition`, `GLPaperLight`, `GLGrain`, `GLTexture`, `GLStage3D`, `GLParticles`, `GLBaseline`, `GLDrawTiming`, `GLProbe`). Clips and stills are in `out/gl/`.

---

## 1. Render flags (measured on this machine: RTX 4080 SUPER, i7-14700KF, Chrome Headless Shell 149)

**Always pass `--gl=angle`.** Remotion 4's default (no `--gl`) gives SwiftShader, the CPU rasteriser, which is about 10x slower on every WebGL scene here.

```bash
cd studio && EPISODE=writing-thinking-v7 TEMP=E:/remotion-tmp/x TMP=E:/remotion-tmp/x \
  npx remotion render <entry> <Comp> out.mp4 --gl=angle --concurrency=8 --timeout=300000
```

(or `Config.setChromiumOpenGlRenderer('angle')` in `remotion.config.ts`).

| `--gl` | what Chrome gets (`UNMASKED_RENDERER`) | still (ms, incl. PNG) | repeat renders |
|---|---|---|---|
| `angle` ✅ | ANGLE → NVIDIA RTX 4080 SUPER, **D3D11** | 490 | bit-identical |
| `vulkan` | ANGLE → NVIDIA RTX 4080 SUPER, **Vulkan 1.4** | 460 | bit-identical |
| *(none, the default)* | ANGLE → **SwiftShader** (CPU) | 805 | bit-identical |
| `swangle` | SwiftShader (CPU) | 800 | bit-identical |
| `angle-egl` | Microsoft Basic Render Driver (**WARP**, CPU) | 700 | bit-identical |

- Pixels differ slightly between backends (angle vs vulkan: PSNR 70 dB on MindSpace, 61–63 dB particles, 55 dB ink mask, 46 dB Stage3D). Invisible, but **don't switch backends in the middle of a shot** if you render in chunks.
- All backends support WebGL2, `HtmlInCanvas` (Remotion enables `CanvasDrawElement`), `texElementImage2D`, `mix-blend-mode: plus-lighter` and `mask-mode: luminance`.

**Throughput.** These are steady-state fps from `renderMedia`, the same path the CLI uses, with 110–180 frames per run and startup excluded. The machine is shared with other agents, so expect ±20% run-to-run.

| composition | angle c4 | angle c8 | vulkan c8 |
|---|---|---|---|
| `GLBaseline`: DOM paper + text only | 44 | 45–50 | 52–57 |
| `GLPaperLight`: baseline + PaperLight | – | 46 | 48 |
| `GLMindSpace` | 32 | 39 | 49 |
| `GLInkLayer`: paper + ink layer + PaperLight | – | 38 | 44 |
| `GLInkMask`: 2 paper scenes + HtmlInCanvas mask + PaperLight | – | 47 | 45 |
| `GLInkMaskCss`: same with the CSS-mask fallback | – | 39 | 40 |
| `GLStage3D`: paper + 3 cards + curled sheet + VSM shadows + PaperLight | – | 37 | 49 |
| `GLParticles`: MindSpace + 16k particles + Grain | 31 | 35 | 40 |
| `GLMindSpace` / `GLParticles` with `swangle` (CPU) | – | 4.1 / 3.9 | – |

A literal CLI `npx remotion render … GLParticles --frames=0-89 --gl=angle` took **9.1 s at `--concurrency=4` and 8.6 s at `--concurrency=8`**, wall time including bundling and about 2 s of tab start-up (font decode).

Conclusions:
- The GL layers are cheap relative to Chrome's capture and encode pipeline: the heaviest demo scene runs at about 70% of the DOM-only baseline.
- c8 beats c4 by 0–25%. Above 8 the GPU and encoder saturate, so **use 8**.
- `vulkan` is 5–35% faster on 3D-heavy scenes and was correct and deterministic in every test here. `angle` is still the recommended default because it is the well-trodden Windows path. Use vulkan only when render time matters, and then for the whole render.

Per-layer CPU submit cost (uniforms plus draw; `gl.finish()` returns immediately in Chrome, so GPU time is folded into the pipeline numbers above):

| layer | angle | vulkan |
|---|---|---|
| MindSpace | ~3.3 ms | ~1.5 ms |
| InkReveal ink | ~2.6 ms | ~1.0 ms |
| PaperLight | ~2.2 ms | ~0.8 ms |
| Grain | ~1.3 ms | ~0.6 ms |

Shader compile happens once per tab on the first frame: MindSpace 166 ms, InkReveal 149 ms, PaperLight 56 ms.

**Determinism checks.**
- The same frame rendered twice is bit-identical for all ShaderLayer components and for ThoughtParticles.
- When text goes through canvas rasterisation (text textures in Stage3D, children captured by HtmlInCanvas), a few dozen glyph pixels can differ by 1–3 levels between page loads. That comes from Chrome's text raster and is invisible.
- Sequence renders (`renderFrames`, 4 tabs) match isolated `renderStill`s exactly for `GLInkMask` and `GLParticles`, so nothing lags a frame or depends on render history.
- Frame-to-frame difference energy of all clips follows the motion envelope with no spikes, so there is no flicker.

---

## 2. `ShaderLayer`: one fragment shader, one WebGL2 canvas

```tsx
<ShaderLayer
  frag={MY_FRAG}                 // GLSL ES 3.00 body: your uniforms + void main(); write PREMULTIPLIED rgba to fragColor
  progress={p}                   // -> u_progress
  uniforms={{u_color: '#1F4E79', u_amount: 0.5, u_dir: [1, 0], u_tex: {source: img, wrap: 'repeat'}}}
  resolution={1}                 // 0.5 = quarter the pixels (fine for soft fog), compositor upscales
  blend="multiply"               // CSS mix-blend-mode of the canvas
/>
```

- The header (`FRAG_HEADER`) is prepended for you:
  - `in vec2 v_uv` (0..1, **top-left origin**, like CSS and DOM images)
  - `out vec4 fragColor`
  - `u_res` (buffer px), `u_time` (s = frame/fps, overridable with `time`), `u_frame`, `u_progress`, `u_seed`, `u_scale`
  - `fragCSS()`: top-left pixel coordinate in comp px, independent of `resolution`
- Uniforms are matched to the GLSL declarations by introspection:
  - number/bool → float/int/bool
  - `number[]` → vecN, or arrays of vecN (`uniform vec4 u_o[4]` takes 16 numbers)
  - `'#rrggbb'` → vec3/vec4 as **sRGB 0..1** (no linearisation; do your maths in display space)
  - `HTMLImageElement` / canvas / `ImageBitmap` / `{source, wrap, filter, version}` → sampler2D
  - Bump `version` to re-upload a canvas whose pixels changed. Texture row 0 is the image top, so `texture(t, v_uv)` is upright.
- `useGLImage(staticFile(...))` decodes an image once per page and holds the frame until it is ready.
- Snippets in `glsl.ts`:
  - `GLSL_HASH`: `pcg3d` integer hash (bit-exact on every GPU), `hashPix`, Hoskins float hashes
  - `GLSL_NOISE`: gradient noise 2D/3D, value noise, `fbm`, `rot`
  - `GLSL_COLOR`: sRGB↔linear, `luma`, `dither8`
  - `GLSL_GRAIN`: `grainAt`
- Drawing happens synchronously in a layout effect every render, i.e. inside the commit Remotion waits for, with `preserveDrawingBuffer: true`.
- The context is created on mount, reused across frames, released on unmount with `WEBGL_lose_context`, and re-created transparently if Chrome drops it.
- `onDraw({ms, gl, canvas})` is a benchmark hook.

## 3. `MindSpace`: the dark mind-world background (opaque, put it first)

```tsx
<MindSpace intensity={1} drift={1} warmth={0.5} dust={1} seed={0} />
```

- The look: a deep #0B0E13 → #151B26 gradient around a faint light pool, two domain-warped haze layers drifting at different speeds (lit by the pool), and three depth-of-field dust layers:
  - far soft motes
  - mid glowing "thought motes"
  - near out-of-focus lens bokeh
- It finishes with a vignette plus baked grain and dither (dark gradients band in H.264 without it).
- Main props:
  - `intensity`: fog, 0 = clear, 1 = default, 2 = heavy
  - `drift`: speed, 0 = frozen
  - `warmth`: share of warm motes and warm fog, 0..1
  - `dust`: density, 0 = none, 2 = busy
  - `seed`
- Extra props: `light: [x, y]`, `glow`, `grain`, `vignette`, `time`, and the colours `top`, `bottom`, `fog`, `warm`, `cool`.

## 4. `InkReveal`: ink bleeding into wet paper

The model:
- A dense core grows from 1–4 origins. The front has radial "fingers" and paper-absorbency variation, and its outline is ragged, never a vector curve.
- The front is feathered by **short curly paper fibres** (capillary flow).
- Ahead of the core runs a diluted ragged wash with a darker tide line.
- The paper field is static and only the radius grows, so edges never "boil".
- `progress` 0 → 1 = nothing → frame fully covered. The radius is mildly eased (`ease` 0 = linear radius, 1 = ink-like fast start).

```tsx
// (i) ink layer: blot / flood the page into the dark world
<InkReveal mode="ink" progress={p} origin={[{x: 0.63, y: 0.58}, {x: 0.3, y: 0.3, delay: 0.25, size: 0.5}]} />

// (ii) mask: reveal children inside the ink, with a wet dark band at the front and the wash/fibres bleeding over what's below
<InkReveal mode="mask" progress={p} origin={[0.28, 0.62]}>
  <SceneB />
</InkReveal>

// (iii) TransitionSeries presentation (entering scene bleeds in over the exiting one)
<TransitionSeries.Transition presentation={inkBleed({origin: [0.72, 0.4]})}
  timing={linearTiming({durationInFrames: 50, easing: Easing.inOut(Easing.quad)})} />
```

Props: `origin` (`[x, y]` or up to 4 `{x, y, delay, size}` in CSS fractions), `color` (#1B1D1C), `thinColor` (#1F4E79), `rough`, `fiber`, `bleed`, `rim` (mask band, 0 = pure mask), `edge` (pooled edge in ink mode), `ease`, `seed`, `opacity`, `width`/`height`, `backend`.

Mask backends (`backend="auto"` picks for you):
- **`html-in-canvas`** (renders): children are laid out inside Remotion's `<HtmlInCanvas>`, captured with `texElementImage2D` into a WebGL texture and composited with the ink in one pass. It is cheap (≈ free vs DOM) and verified frame-accurate in sequence renders.
- **`css-mask`** (automatic fallback, e.g. **Studio preview in a normal Chrome** without `chrome://flags/#canvas-draw-element`): a shared hidden WebGL canvas → JPEG data URL → `mask-image` with `mask-mode: luminance`, plus an ink overlay layer.
  - It holds the frame until the mask is decoded.
  - It runs at half resolution in preview and full resolution when rendering, costing about 6 ms/frame more.

`progress <= 0` renders nothing; `progress >= 1` renders the children plainly (no GPU work). The children therefore **remount when progress crosses 0 or 1**. For stateful or heavy children (a `Stage3D`, video), wrap the whole scene, or keep progress inside (0, 1) until the scene ends.

## 5. `PaperLight` and `Grain`: overlays, put them last

```tsx
<PaperLight />                       // light 0.6, vignette 0.55, fiber 0.5, mottle 0.6, grain 0.6, grainFps 15, lightPos [0.12,-0.05]
<Grain intensity={0.35} />           // size 1.3, fps 15, chroma 0.15, mode 'signed' | 'overlay'
```

- `PaperLight` is **one light-map pass composited with `mix-blend-mode: multiply`**: paper albedo × irradiance. Ink stays black and the paper gets a warm top-left key falloff, warm-dark corners, short curly fibres, cloudiness and grain. Use it on paper scenes only; on dark scenes it would just darken.
- `Grain` is animated film grain that works on both worlds:
  - `signed` (default): lightens toward white or darkens toward black with normal blending, so it is visible even on near-black.
  - `overlay`: grey noise with `mix-blend-mode: overlay`, which is invisible in deep blacks.
- Grain refresh: **15 fps (default, even 2-frame hold) or 30.** Avoid 24 on a 30 fps timeline (uneven 4-in-5 cadence, visible in frame-diff analysis).

## 6. 3D: `Stage3D`, `Card3D`, `PaperSheet3D`, `textTexture`

```tsx
<AbsoluteFill>
  <PaperBackground />                                   {/* DOM paper, crisp and cheap */}
  <Stage3D
    camera={{position: lerp3([1.2, -0.6, 11.5], [-0.4, 0.3, 9.6], k), target: [0.3, 0, 0], fov: 35}}
    shadowCatcher={{position: [0, 0, -0.9], opacity: 0.24}}   // invisible backdrop that only shows shadows on the DOM paper
  >
    <PaperSheet3D position={[-2.7, 0, 0]} rotation={[-0.12, 0.28, -0.07]} curl={0.35} cornerLift={0.22} wave={0.35}
      text={{text: '写作就是\n思考本身', fontFamily: 'LXGW WK', fontSize: 120, color: '#1F4E79'}} contentScale={0.72} />
    <Card3D position={[2.3, 1.35, 0.7]} rotation={[0.08, -0.36, 0.06]} width={3.3} height={1.7}
      text={{text: '工作记忆', fontSize: 140, color: '#1B1D1C'}} />
  </Stage3D>
  <PaperLight />
</AbsoluteFill>
```

**`Stage3D`** wraps `ThreeCanvas`:
- Output and tone mapping: sRGB output; `toneMapping` `'neutral'` (default: Khronos PBR Neutral keeps #C8402E red and the paper tones true) | `'aces'` | `'agx'` | `'none'`; `exposure`.
- Lights and environment: warm key top-left-front plus cool fill (`keyLight`, `fillLight`, `rimLight`: `{position, intensity, color}` or `false`); hemisphere `ambient`; RoomEnvironment reflections (`environment`, `envIntensity`).
- Shadows: `shadows` is `'vsm'` (default, smooth soft shadows via `shadowRadius`), `'pcf'` or `false`. In three r186, PCFSoft was removed and PCF is 5 Vogel taps, which is dithery at large radii. Tune with `shadowMapSize` and `shadowExtent`.
- `transparent` (default true) overlays the DOM. `dpr` is 1.
- `camera`: `{position, target, fov, near, far, up, roll}` is applied every frame. Compute it from `useCurrentFrame()`.

**`Card3D`**:
- A thin rounded card: an extruded rounded rect with a bevel, paper-textured faces and a slightly darker edge.
- Face content is `text` (a `TextTextureOptions`), `image` (a staticFile path) or `map` (any `THREE.Texture`, which wins), sized by `contentScale`/`contentOffset`.
- Other props: `width`, `height`, `depth`, `radius`, `color`, `paper`, `roughness`, `opacity`, `castShadow`, `receiveShadow`, `children`.

**`PaperSheet3D`**:
- A plane displaced on the CPU every frame (deterministic from `time` and `seed`).
- Deformation: `curl` (cupping), `cornerLift` (bottom-right page lift), `wave` (slow ripple). Normals are recomputed, so the shadows follow the shape.
- The content (`text` / `image` / `map`) lies *on* the curved surface: a UV window, clipped outside with no edge smearing.

**`loadTextTexture(opts)` / `useTextTexture(opts)`**:
- Chinese text → `CanvasTexture` at 2x (`scale`), with sRGB, mipmaps and anisotropy 8.
- The drawing waits for `document.fonts.load()` and verifies with `fonts.check`, and results are cached per options.
- Options: `text` (`\n` breaks), `fontFamily` ('SHS Heavy' | 'SHS Bold' | 'LXGW WK'), `fontSize`, `color`, `lineHeight`, `align`, `maxWidth` (per-character CJK wrap), `padding`, `letterSpacing`, `background`.

## 7. `ThoughtParticles`: the signature effect

```tsx
const ph = particleTimeline(frame, 'cloud', [
  {state: 'text', at: 30, dur: 70},        // cloud -> 工作记忆
  {state: 'disperse', at: 125, dur: 55},   // blown away
]);
<AbsoluteFill>
  <MindSpace />
  <Stage3D camera={{position: [0.8, 0.3, 11.2], fov: 35}} environment="none" keyLight={false} fillLight={false} ambient={0} shadows={false}>
    <ThoughtParticles text="工作记忆" count={16000} {...ph} />
  </Stage3D>
  <Grain intensity={0.35} />
</AbsoluteFill>
```

The three states:
- `cloud`: a seeded nebula whose density is thinned by an fbm field (clumps and wisps, not a starfield). It flows with 3D curl noise plus a slow rotation, both as functions of time, with no simulation state. About 4% of the particles are bright "motes" and the rest faint dust.
- `text`: points sampled from the string rendered in SHS Heavy. About 28% of them trace the glyph outlines, which gives crisp, light-drawn edges, and the rest fill the strokes. The glyphs sparkle and shimmer faintly.
- `disperse`: blown along `wind` with turbulence, then faded out.

How the morph and the rendering work:
- The morph uses per-particle staggered easing: left-to-right when text is involved, plus randomness (`stagger`), along sideways arcs (`swirl`).
- Particles are drawn as additive light **that leaves the canvas alpha at 0**, so on a transparent Stage3D they add onto whatever DOM or shader layer is below.
- Each particle is a tight core plus a faint wide warm halo (`bloom`). The halos sum into a soft glow around dense glyphs.
- Depth of field: point size ∝ 1/distance; defocused particles become energy-normalised lens discs (`aperture`). Focus defaults to the camera → text distance and is updated every frame.

Props: `text`, `font`, `from` ('cloud' | 'text'), `to` ('cloud' | 'text' | 'disperse'), `progress`, `count` (6k–20k, default 16k), `color` (#F3EEE2), `accent`/`accentRatio`, `haloColor`, `size` (px at distance 10), `bloom`, `textBrightness`, `motes`, `dust`, `seed`, `textWidth` (world units, default 7), `textPosition`, `cloudRadius`, `cloudCenter`, `drift`, `stagger`, `swirl`, `wind`, `focus`, `aperture`, `intensity`, `opacity`, `time`, `position`, `rotation`.

---

## 8. Gotchas

1. **`--gl=angle` or it's ~10x slower** (the default is SwiftShader). `dev/still.mjs` already defaults to angle.
2. **No `useFrame`, no rAF loops, no Math.random, no Date.** Everything is a function of `useCurrentFrame()` and props: seeded `mulberry32`, and a JS `makeNoise3` for distributions.
3. **Inside `<Stage3D>`, mutate three objects in `useLayoutEffect` (or via JSX props), never in `useEffect`.** `@remotion/three` draws the frame (`advance()`) in a *passive* effect of the same commit, so passive effects of your components may run too late for the capture.
4. **Async resources inside r3f must trigger a redraw.** With `frameloop='never'` nothing redraws when a texture arrives mid-frame. `useThreeTexture` / `useTextTexture` / `useAsync3D` hold the frame, then queue `advance()` as a **microtask**: it runs after *all* layout effects of the commit (e.g. copying glyph points into a BufferAttribute) and before any capture. Calling `advance()` directly in the hook's layout effect produced frames with all particles collapsed at the origin.
5. **Canvas text must await `document.fonts.load()`**, otherwise it silently falls back to a system font (the first `GLTexture` still showed a thin fallback face). `textTexture` and `sampleTextPoints` do this for you.
6. **WebGL context budget.** Each `ShaderLayer`-based component, each `Stage3D`, each HtmlInCanvas `InkReveal` mask and the shared CSS-mask canvas is one context. Chrome drops the oldest beyond ~16 per page. Keep ≤ 12 mounted at once, and remember that `premountFor` keeps sequences mounted. Unmounting releases contexts immediately, and `liveContexts()` / a console warning above 12 help while debugging.
7. **Shaders output premultiplied alpha** (`fragColor = vec4(rgb * a, a)`).
8. **HtmlInCanvas availability.** It works in Remotion's Headless Shell (renders). In a normal Chrome (Studio preview) it needs `chrome://flags/#canvas-draw-element`, otherwise InkReveal falls back to the CSS mask automatically. Remotion's own `@remotion/transitions` HtmlInCanvas presentations (`dissolve`, `ripple`…) would throw there, but `inkBleed` does not.
9. The InkReveal mask passes a fresh `onPaint` to `HtmlInCanvas` every render. That is deliberate: HtmlInCanvas only repaints when children or `onPaint` change, and the progress changes every frame.
10. **Additive particles and opaque 3D.** The particle blending keeps canvas alpha 0 (pure additive over the DOM). If you add opaque meshes to the same Stage3D they composite normally; particles *behind* them are hidden by the depth test.
11. `THREE.Clock: This module has been deprecated` in logs comes from r3f 8 with three r186 and is harmless.
12. Don't put more than one `Stage3D` over another for the same shot unless needed: every canvas is composited full-frame.

### When CSS 3D transforms are the better choice for crisp text

DOM text with CSS `perspective` + `rotateX/Y` + `translateZ` is rasterised by Chrome at the final on-screen size (real glyph outlines, correct AA). It stays razor sharp at any zoom and is also the cheapest option.

WebGL text is a bitmap: `textTexture` renders at 2x, which is crisp until a card fills more than about half the frame, or is seen at grazing angles where mip and anisotropic filtering soften it.

- **Use CSS 3D for** title and quote cards, anything read at large size, simple tilts/flips/parallax, and text you'll iterate on. Don't set `will-change: transform` on elements whose *scale* animates: Chrome then caches a bitmap at the start scale and it blurs.
- **Use `Stage3D` for** real lighting and soft shadows onto the page, curled or deformed paper, many objects with true depth and occlusion, camera moves with parallax and DOF, and particles.
- **Hybrid:** 3D objects and shadows in `Stage3D`, with the large readable text as a DOM layer placed on top of them (project the 3D anchor with the same camera numbers).

### Scratch and temp

The bench tools (`dev/gl.bench.mjs`, `dev/gl.throughput.mjs`) keep bundles, browser profiles and Remotion scratch under `E:/remotion-tmp/gl/<run>` and delete them on exit. The throughput tool bundles with a slim public dir (`assets/` only). Pass the same `TEMP`/`TMP` for CLI renders.

```bash
node episodes/writing-thinking-v7/dev/gl.bench.mjs episodes/writing-thinking-v7/dev/gl.tsx GLParticles 15,85 --gl=angle,vulkan   # GPU string, ms, repeat + cross-backend pixel diffs
node episodes/writing-thinking-v7/dev/gl.throughput.mjs episodes/writing-thinking-v7/dev/gl.tsx --comps=GLParticles --gl=angle --conc=4,8 --frames=0-179
```
