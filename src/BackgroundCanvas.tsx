import { useEffect, useRef } from 'react'
import bgImage from './assets/outerwall_clouds.png'
import starImage from './assets/outerwall_star.png'

// ─── Vertex Shader ───────────────────────────────────────────────────────────
// Runs once per vertex (6 total — two triangles forming a fullscreen quad).
// Its only job is to pass each vertex position through to the GPU and compute
// a UV coordinate for the fragment shader to use.
const VS = `#version 300 es

// aPosition is a 2D clip-space coordinate fed in from the vertex buffer.
// Clip space goes from -1 (left/bottom) to +1 (right/top).
in vec2 aPosition;

// vUv is an output that gets interpolated across the triangle and received
// by every fragment (pixel) in the fragment shader.
out vec2 vUv;

void main() {
    // Convert clip-space X (-1..+1) to UV X (0..1): multiply by 0.5, add 0.5.
    // Negate Y before the same conversion because clip-space Y goes up (+1 = top)
    // but UV Y goes down (0 = top), so we flip it to match the image orientation.
    vUv = vec2(aPosition.x * 0.5 + 0.5, -aPosition.y * 0.5 + 0.5);

    // Output the vertex position. Z=0 (flat), W=1 (required by WebGL).
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`

// ─── Fragment Shader ──────────────────────────────────────────────────────────
// Runs once per pixel on screen. Samples the background image at four different
// horizontal offsets (speeds) to detect cloud shapes, then composites solid-color
// cloud layers back-to-front over a plain dark background.
const FS = `#version 300 es
precision mediump float;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uUVOffset;
uniform vec2 uUVScale;

in vec2 vUv;
out vec4 fragColor;

const vec3 COL1 = vec3( 27.0,  39.0,  53.0) / 255.0;
const vec3 COL2 = vec3( 55.0,  78.0, 107.0) / 255.0;
const vec3 COL3 = vec3( 83.0, 117.0, 160.0) / 255.0;
const vec3 COL4 = vec3(111.0, 156.0, 214.0) / 255.0;

vec2 layerUV(float speed) {
    return vec2(
        fract(uUVOffset.x + vUv.x * uUVScale.x + speed * uTime),
        clamp(uUVOffset.y + vUv.y * uUVScale.y, 0.0, 1.0)
    );
}

float colorMatch(vec3 c, vec3 target) {
    return 1.0 - step(0.18, distance(c, target));
}

// returns 1.0 if c matches ANY of the given colors
float matchAny2(vec3 c, vec3 a, vec3 b) {
    return max(colorMatch(c, a), colorMatch(c, b));
}
float matchAny3(vec3 c, vec3 a, vec3 b, vec3 d) {
    return max(matchAny2(c, a, b), colorMatch(c, d));
}
float matchAny4(vec3 c, vec3 a, vec3 b, vec3 d, vec3 e) {
    return max(matchAny3(c, a, b, d), colorMatch(c, e));
}

void main() {
    vec4 c1 = texture(uTexture, layerUV(0.010));
    vec4 c2 = texture(uTexture, layerUV(0.020));
    vec4 c3 = texture(uTexture, layerUV(0.040));
    vec4 c4 = texture(uTexture, layerUV(0.060));

    // each layer catches its own color AND all colors from faster layers
    // so it can fill the silhouette behind everything in front of it
    float w1 = matchAny4(c1.rgb, COL1, COL2, COL3, COL4); // catches all
    float w2 = matchAny3(c2.rgb, COL2, COL3, COL4);        // catches 2+3+4
    float w3 = matchAny2(c3.rgb, COL3, COL4);               // catches 3+4
    float w4 = colorMatch(c4.rgb, COL4);                     // catches 4 only

    // back-to-front compositing
    vec4 result = vec4(0, 0, 0, 1.0);
    result = mix(result, vec4(COL1, 1.0), w1);
    result = mix(result, vec4(COL2, 1.0), w2);
    result = mix(result, vec4(COL3, 1.0), w3);
    result = mix(result, vec4(COL4, 1.0), w4);

    fragColor = result;
}`

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile error')
  }
  return shader
}

export function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const gl = canvas.getContext('webgl2')!
    if (!gl) {
      console.error('WebGL2 not supported')
      return
    }

    // Compile shaders
    const vs = compileShader(gl, gl.VERTEX_SHADER, VS)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS)
    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Program link error')
    }

    // Fullscreen quad
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1,  1,
      -1,  1,  1, -1,   1,  1,
    ]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPosition')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    // Uniform locations
    const uTime = gl.getUniformLocation(program, 'uTime')!
    const uUVOffset = gl.getUniformLocation(program, 'uUVOffset')!
    const uUVScale = gl.getUniformLocation(program, 'uUVScale')!
    const uTexture = gl.getUniformLocation(program, 'uTexture')!

    // Cover UV state
    let imageAR = 1
    let uvOffset = [0, 0]
    let uvScale = [1, 1]

    function updateCoverUV() {
      const canvasAR = canvas.width / canvas.height
      if (canvasAR > imageAR) {
        uvScale  = [1.0, imageAR / canvasAR]
        uvOffset = [0.0, (1 - imageAR / canvasAR) / 2]
      } else {
        uvScale  = [canvasAR / imageAR, 1.0]
        uvOffset = [(1 - canvasAR / imageAR) / 2, 0.0]
      }
    }

    // Load texture
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

    const img = new Image()
    img.onload = () => {
      imageAR = img.naturalWidth / img.naturalHeight
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      updateCoverUV()
    }
    img.src = bgImage

    // Resize
    function resize() {
      canvas.width  = canvas.clientWidth  * devicePixelRatio
      canvas.height = canvas.clientHeight * devicePixelRatio
      gl.viewport(0, 0, canvas.width, canvas.height)
      updateCoverUV()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // Render loop
    const start = performance.now()
    let raf: number

    function render() {
      const t = (performance.now() - start) / 1000

      gl.useProgram(program)
      gl.uniform1i(uTexture, 0)
      gl.uniform1f(uTime, t)
      gl.uniform2fv(uUVOffset, uvOffset)
      gl.uniform2fv(uUVScale, uvScale)

      gl.bindVertexArray(vao)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindVertexArray(null)

      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteTexture(texture)
      gl.deleteBuffer(buf)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  return (
    <>
      <div
        className="fixed inset-x-0 top-0 h-1/2 -z-1 blur-sm scale-105 bg-cover bg-bottom"
        style={{ backgroundImage: `url(${starImage})` }}
      />
      <canvas
        ref={canvasRef}
        className="fixed left-0 top-1/2 w-full h-1/2 -z-1 blur-sm scale-105"
      />
    </>
  )
}
