<template>
  <div ref="containerRef" class="aurora-canvas" :class="{ 'is-ready': isReady }">
    <canvas ref="canvasRef" class="aurora-canvas__surface"></canvas>
    <div class="aurora-canvas__veil aurora-canvas__veil--primary"></div>
    <div class="aurora-canvas__veil aurora-canvas__veil--secondary"></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl'

const props = defineProps({
  dark: {
    type: Boolean,
    default: false,
  },
})

const containerRef = ref(null)
const canvasRef = ref(null)
const isReady = ref(false)

let renderer
let gl
let mesh
let frameId = 0
let resizeObserver

const THEME_PRESETS = {
  dark: {
    color: '#8ed8ff',
    speed: 0.52,
    intensity: 0.96,
    opacity: 0.68,
    bias: [0.12, 0.16, 0.26],
  },
  light: {
    color: '#f08cff',
    speed: 0.4,
    intensity: 1.0,
    opacity: 0.92,
    bias: [0.97, 0.97, 0.985],
  },
}

const vertexShader = `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const fragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uResolution;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3 uBias;

  varying vec2 vUv;

  vec3 palette(float t, vec3 accent) {
    vec3 pink = vec3(0.98, 0.46, 0.82);
    vec3 cyan = vec3(0.49, 0.95, 0.94);
    vec3 lavender = vec3(0.74, 0.67, 1.0);
    vec3 pearl = vec3(0.98, 0.98, 1.0);

    vec3 base = mix(pearl, pink, smoothstep(0.0, 0.36, t));
    base = mix(base, cyan, smoothstep(0.28, 0.68, t));
    base = mix(base, lavender, smoothstep(0.58, 1.0, t));
    return mix(base, accent, 0.16);
  }

  void main() {
    float mr = min(uResolution.x, uResolution.y);
    vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;

    float t = uTime * 0.42;
    vec2 p = uv * 1.55;

    float waveA = sin(p.x * 1.45 + t * 1.8);
    float waveB = sin(p.y * 1.2 - t * 1.35);
    float waveC = sin((p.x + p.y) * 0.9 - t * 1.1);
    float waveD = cos(length(p) * 2.8 - t * 1.6);

    vec2 flowUv = uv;
    flowUv.x += 0.18 * waveB + 0.12 * waveD;
    flowUv.y += 0.22 * waveA - 0.1 * waveC;

    float band1 = sin(flowUv.x * 3.8 + flowUv.y * 1.4 + t * 2.0);
    float band2 = sin(flowUv.y * 4.4 - flowUv.x * 1.6 - t * 1.55);
    float band3 = cos((flowUv.x + flowUv.y) * 3.2 - t * 1.25);
    float liquid = band1 * 0.42 + band2 * 0.33 + band3 * 0.25;
    liquid = liquid * 0.5 + 0.5;

    float iridescence = sin((flowUv.x - flowUv.y) * 5.0 + t * 1.7) * 0.5 + 0.5;
    float highlight = pow(smoothstep(0.32, 0.92, liquid), 1.45);
    float bloom = smoothstep(0.18, 0.92, iridescence * 0.55 + liquid * 0.75);

    vec3 film = palette(clamp(liquid * 0.78 + iridescence * 0.22, 0.0, 1.0), uColor);
    vec3 color = mix(uBias, film, bloom);
    color += vec3(0.08, 0.06, 0.1) * highlight;
    color = mix(uBias, color, uIntensity);
    color = clamp(color, 0.0, 1.0);

    float falloff = smoothstep(1.4, 0.18, length(uv * vec2(1.0, 0.82)));
    float alpha = clamp((0.48 + bloom * 0.52) * falloff * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`

function hexToRgb(hex) {
  const normalized = hex.replace('#', '')
  const bigint = Number.parseInt(normalized, 16)
  return [
    ((bigint >> 16) & 255) / 255,
    ((bigint >> 8) & 255) / 255,
    (bigint & 255) / 255,
  ]
}

function getPreset() {
  return props.dark ? THEME_PRESETS.dark : THEME_PRESETS.light
}

function applyPreset() {
  if (!mesh) return
  const preset = getPreset()
  const { uniforms } = mesh.program
  uniforms.uColor.value = new Color(...hexToRgb(preset.color))
  uniforms.uIntensity.value = preset.intensity
  uniforms.uOpacity.value = preset.opacity
  uniforms.uBias.value = preset.bias
}

function resize() {
  if (!renderer || !mesh || !containerRef.value) return
  const { width, height } = containerRef.value.getBoundingClientRect()
  if (!width || !height) return

  renderer.setSize(Math.round(width), Math.round(height))
  mesh.program.uniforms.uResolution.value = [
    gl.canvas.width,
    gl.canvas.height,
    gl.canvas.width / gl.canvas.height,
  ]
}

function render(time) {
  if (!renderer || !mesh) return

  const preset = getPreset()
  mesh.program.uniforms.uTime.value = time * 0.001 * preset.speed
  renderer.render({ scene: mesh })
  frameId = window.requestAnimationFrame(render)
}

function destroyScene() {
  if (frameId) {
    window.cancelAnimationFrame(frameId)
    frameId = 0
  }

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (renderer?.gl) {
    const loseContext = renderer.gl.getExtension('WEBGL_lose_context')
    loseContext?.loseContext()
  }

  renderer = null
  gl = null
  mesh = null
  isReady.value = false
}

function initScene() {
  if (!canvasRef.value) return

  try {
    renderer = new Renderer({
      canvas: canvasRef.value,
      alpha: true,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      powerPreference: 'high-performance',
    })
    gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)

    const geometry = new Triangle(gl)
    const preset = getPreset()
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(...hexToRgb(preset.color)) },
        uResolution: { value: [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height] },
        uIntensity: { value: preset.intensity },
        uOpacity: { value: preset.opacity },
        uBias: { value: preset.bias },
      },
      transparent: true,
    })

    mesh = new Mesh(gl, { geometry, program })

    resize()
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(containerRef.value)

    isReady.value = true
    frameId = window.requestAnimationFrame(render)
  } catch (error) {
    console.warn('LoginAuroraCanvas init failed:', error)
    destroyScene()
  }
}

watch(() => props.dark, applyPreset)

onMounted(() => {
  initScene()
})

onBeforeUnmount(() => {
  destroyScene()
})
</script>

<style scoped>
.aurora-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.aurora-canvas__surface,
.aurora-canvas__veil {
  position: absolute;
  inset: 0;
}

.aurora-canvas__surface {
  display: block;
  width: 100% !important;
  height: 100% !important;
  z-index: 0;
  opacity: 0;
  transition: opacity 260ms ease;
}

.aurora-canvas.is-ready .aurora-canvas__surface {
  opacity: 1;
}

.aurora-canvas__veil {
  z-index: 1;
  pointer-events: none;
  mix-blend-mode: screen;
}

.aurora-canvas__veil--primary {
  background:
    radial-gradient(circle at 18% 24%, color-mix(in srgb, #ff8ed1 26%, transparent) 0%, transparent 24%),
    radial-gradient(circle at 68% 32%, color-mix(in srgb, #8ef7ff 22%, transparent) 0%, transparent 22%),
    radial-gradient(circle at 52% 72%, color-mix(in srgb, #bda9ff 18%, transparent) 0%, transparent 24%);
  filter: blur(52px);
  opacity: 0.54;
}

.aurora-canvas__veil--secondary {
  background:
    linear-gradient(135deg, color-mix(in srgb, #ffe8f7 24%, transparent) 0%, transparent 44%),
    radial-gradient(circle at 72% 70%, color-mix(in srgb, #8df4d9 16%, transparent) 0%, transparent 18%),
    radial-gradient(circle at 82% 16%, color-mix(in srgb, #ffd5ef 18%, transparent) 0%, transparent 16%);
  filter: blur(72px);
  opacity: 0.46;
}

@media (prefers-reduced-motion: reduce) {
  .aurora-canvas__surface {
    opacity: 0.72;
  }
}
</style>
