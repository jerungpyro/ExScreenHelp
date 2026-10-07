// Draws the orb as a 256x256 PNG for the tray and the app icon: `npm run make-icon`.
// Uses only Node built-ins, so there is no image library to install.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SIZE = 256
const CENTRE = SIZE / 2
const RADIUS = 120

// Same palette as orb.css.
const BODY_STOPS = [
  [0, [0x1e, 0xa5, 0x96]],
  [0.58, [0x0d, 0x5f, 0x58]],
  [1, [0x08, 0x3b, 0x37]]
]
const SWIRL_STOPS = [
  [0, [0x2d, 0xd4, 0xbf]],
  [0.24, [0xbe, 0xf2, 0x64]],
  [0.44, [0xfb, 0xbf, 0x24]],
  [0.62, [0xfb, 0x71, 0x85]],
  [0.82, [0x14, 0xb8, 0xa6]],
  [1, [0x2d, 0xd4, 0xbf]]
]
const RIM = [0x04, 0x24, 0x21]

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function gradient(stops, t) {
  for (let i = 1; i < stops.length; i++) {
    const [endAt, endColour] = stops[i]
    const [startAt, startColour] = stops[i - 1]
    if (t <= endAt) {
      return mix(startColour, endColour, (t - startAt) / (endAt - startAt))
    }
  }
  return stops[stops.length - 1][1]
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function orbPixel(x, y) {
  const dx = x + 0.5 - CENTRE
  const dy = y + 0.5 - CENTRE
  const distance = Math.hypot(dx, dy)
  const alpha = clamp01(RADIUS + 0.5 - distance)
  if (alpha === 0) {
    return [0, 0, 0, 0]
  }

  // Body: radial gradient lit from the upper left.
  const lightX = CENTRE - RADIUS + 0.68 * RADIUS
  const lightY = CENTRE - RADIUS + 0.56 * RADIUS
  const fromLight = Math.hypot(x - lightX, y - lightY) / (RADIUS * 1.55)
  let colour = gradient(BODY_STOPS, clamp01(fromLight))

  // Swirl: the conic gradient, faded out towards the centre where its colours would meet in a point.
  const angle = (Math.atan2(dy, dx) / (2 * Math.PI) + 1.25) % 1
  const swirlStrength = 0.55 * smoothstep(0.1, 0.9, distance / RADIUS)
  colour = mix(colour, gradient(SWIRL_STOPS, angle), swirlStrength)

  // Depth: darker towards the rim.
  colour = mix(colour, RIM, smoothstep(0.42, 1, distance / RADIUS) * 0.55)

  // Sheen: soft white highlight.
  const sheenX = CENTRE - RADIUS + 0.6 * RADIUS
  const sheenY = CENTRE - RADIUS + 0.48 * RADIUS
  const sheen = clamp01(1 - Math.hypot(x - sheenX, y - sheenY) / (0.84 * RADIUS)) * 0.55
  colour = mix(colour, [255, 255, 255], sheen)

  return [Math.round(colour[0]), Math.round(colour[1]), Math.round(colour[2]), Math.round(alpha * 255)]
}

// ---------- Minimal PNG encoder ----------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // RGBA
  // Each scanline starts with filter type 0 (none).
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const pixels = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = orbPixel(x, y)
    const offset = (y * SIZE + x) * 4
    pixels[offset] = r
    pixels[offset + 1] = g
    pixels[offset + 2] = b
    pixels[offset + 3] = a
  }
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icon.png')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, encodePng(SIZE, SIZE, pixels))
console.log(`Wrote ${outPath}`)
