export class GifEncoder {
  private width: number
  private height: number
  private frames: Array<{ data: Uint8ClampedArray; delay: number }> = []
  private repeat = 0

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  setRepeat(count: number) {
    this.repeat = count
  }

  addFrame(rgba: Uint8ClampedArray, delayMs: number) {
    this.frames.push({ data: new Uint8ClampedArray(rgba), delay: Math.round(delayMs / 10) })
  }

  encode(): Uint8Array {
    const { palette, indexedFrames } = this.quantize()
    const chunks: Uint8Array[] = []

    chunks.push(this.header())
    chunks.push(this.logicalScreenDescriptor(palette))
    chunks.push(this.globalColorTable(palette))
    chunks.push(this.netscapeExtension())

    for (const frame of indexedFrames) {
      chunks.push(this.graphicControlExtension(frame.delay))
      chunks.push(this.imageDescriptor())
      chunks.push(this.imageData(frame.indexed, palette.length))
    }

    chunks.push(new Uint8Array([0x3b]))
    return this.concat(chunks)
  }

  private quantize(): { palette: number[][]; indexedFrames: Array<{ indexed: Uint8Array; delay: number }> } {
    const colorMap = new Map<number, number>()
    const allColors: number[][] = []

    for (const frame of this.frames) {
      const d = frame.data
      for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | 0xff
        if (!colorMap.has(key)) {
          colorMap.set(key, allColors.length)
          allColors.push([d[i], d[i + 1], d[i + 2]])
        }
      }
    }

    let palette: number[][]
    let colorLookup: Map<number, number>

    if (allColors.length <= 256) {
      palette = allColors
      colorLookup = colorMap
    } else {
      const reduced = medianCut(allColors, 256)
      palette = reduced
      colorLookup = new Map()
      for (const frame of this.frames) {
        const d = frame.data
        for (let i = 0; i < d.length; i += 4) {
          const key = (d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | 0xff
          if (!colorLookup.has(key)) {
            const r = d[i], g = d[i + 1], b = d[i + 2]
            let bestIdx = 0, bestDist = Infinity
            for (let j = 0; j < reduced.length; j++) {
              const dr = r - reduced[j][0], dg = g - reduced[j][1], db = b - reduced[j][2]
              const dist = dr * dr + dg * dg + db * db
              if (dist < bestDist) { bestDist = dist; bestIdx = j }
            }
            colorLookup.set(key, bestIdx)
          }
        }
      }
    }

    while (palette.length < 2) palette.push([0, 0, 0])
    const bits = Math.max(1, Math.ceil(Math.log2(palette.length)))
    const size = 1 << bits

    while (palette.length < size) palette.push([0, 0, 0])

    const indexedFrames = this.frames.map(frame => {
      const indexed = new Uint8Array(this.width * this.height)
      const d = frame.data
      for (let i = 0; i < indexed.length; i++) {
        const si = i * 4
        const key = (d[si] << 24) | (d[si + 1] << 16) | (d[si + 2] << 8) | 0xff
        indexed[i] = colorLookup.get(key) ?? 0
      }
      return { indexed, delay: frame.delay }
    })

    return { palette, indexedFrames }
  }

  private header(): Uint8Array {
    return new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  }

  private logicalScreenDescriptor(palette: number[][]): Uint8Array {
    const bits = Math.max(1, Math.ceil(Math.log2(palette.length)))
    const size = 1 << bits
    const colorBits = bits - 1
    return new Uint8Array([
      this.width & 0xff, (this.width >> 8) & 0xff,
      this.height & 0xff, (this.height >> 8) & 0xff,
      0x80 | (colorBits << 4) | colorBits,
      0, 0,
    ])
  }

  private globalColorTable(palette: number[][]): Uint8Array {
    const bits = Math.max(1, Math.ceil(Math.log2(palette.length)))
    const size = 1 << bits
    const buf = new Uint8Array(size * 3)
    for (let i = 0; i < size; i++) {
      const c = palette[i] ?? [0, 0, 0]
      buf[i * 3] = c[0]
      buf[i * 3 + 1] = c[1]
      buf[i * 3 + 2] = c[2]
    }
    return buf
  }

  private netscapeExtension(): Uint8Array {
    return new Uint8Array([
      0x21, 0xff, 0x0b,
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
      0x03, 0x01,
      this.repeat & 0xff, (this.repeat >> 8) & 0xff,
      0x00,
    ])
  }

  private graphicControlExtension(delay: number): Uint8Array {
    return new Uint8Array([
      0x21, 0xf9, 0x04,
      0x00,
      delay & 0xff, (delay >> 8) & 0xff,
      0x00, 0x00,
    ])
  }

  private imageDescriptor(): Uint8Array {
    return new Uint8Array([
      0x2c,
      0, 0, 0, 0,
      this.width & 0xff, (this.width >> 8) & 0xff,
      this.height & 0xff, (this.height >> 8) & 0xff,
      0x00,
    ])
  }

  private imageData(indexed: Uint8Array, paletteSize: number): Uint8Array {
    const bits = Math.max(2, Math.ceil(Math.log2(Math.max(paletteSize, 2))))
    const compressed = lzwCompress(indexed, bits)
    const chunks: Uint8Array[] = []

    let offset = 0
    while (offset < compressed.length) {
      const chunkSize = Math.min(255, compressed.length - offset)
      const chunk = new Uint8Array(1 + chunkSize)
      chunk[0] = chunkSize
      chunk.set(compressed.subarray(offset, offset + chunkSize), 1)
      chunks.push(chunk)
      offset += chunkSize
    }
    chunks.push(new Uint8Array([0x00]))

    return this.concat([new Uint8Array([bits]), ...chunks])
  }

  private concat(arrays: Uint8Array[]): Uint8Array {
    let len = 0
    for (const a of arrays) len += a.length
    const result = new Uint8Array(len)
    let offset = 0
    for (const a of arrays) { result.set(a, offset); offset += a.length }
    return result
  }
}

function medianCut(colors: number[][], maxColors: number): number[][] {
  if (colors.length <= maxColors) return colors

  interface Bucket { colors: number[][] }
  const buckets: Bucket[] = [{ colors }]

  while (buckets.length < maxColors) {
    let maxRange = -1, maxIdx = 0
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].colors.length < 2) continue
      const range = getColorRange(buckets[i].colors)
      if (range.maxRange > maxRange) { maxRange = range.maxRange; maxIdx = i }
    }
    if (maxRange <= 0) break

    const bucket = buckets.splice(maxIdx, 1)[0]
    const { maxRange: mr, maxChannel } = getColorRange(bucket.colors)
    bucket.colors.sort((a, b) => a[maxChannel] - b[maxChannel])
    const mid = bucket.colors.length >> 1
    buckets.push({ colors: bucket.colors.slice(0, mid) })
    buckets.push({ colors: bucket.colors.slice(mid) })
  }

  return buckets.map(b => {
    let r = 0, g = 0, bl = 0
    for (const c of b.colors) { r += c[0]; g += c[1]; bl += c[2] }
    const n = b.colors.length
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)]
  })
}

function getColorRange(colors: number[][]): { maxRange: number; maxChannel: number } {
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0
  for (const c of colors) {
    if (c[0] < minR) minR = c[0]; if (c[0] > maxR) maxR = c[0]
    if (c[1] < minG) minG = c[1]; if (c[1] > maxG) maxG = c[1]
    if (c[2] < minB) minB = c[2]; if (c[2] > maxB) maxB = c[2]
  }
  const rangeR = maxR - minR, rangeG = maxG - minG, rangeB = maxB - minB
  if (rangeR >= rangeG && rangeR >= rangeB) return { maxRange: rangeR, maxChannel: 0 }
  if (rangeG >= rangeR && rangeG >= rangeB) return { maxRange: rangeG, maxChannel: 1 }
  return { maxRange: rangeB, maxChannel: 2 }
}

function lzwCompress(indexed: Uint8Array, minCodeSize: number): Uint8Array {
  const out: number[] = []
  let curBits = 0, curByte = 0

  function emit(code: number, bits: number) {
    curByte |= (code << curBits)
    curBits += bits
    while (curBits >= 8) {
      out.push(curByte & 0xff)
      curByte >>= 8
      curBits -= 8
    }
  }

  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  const table = new Map<number, number>()
  let tableSize = 1 << codeSize

  function resetTable() {
    table.clear()
    nextCode = eoiCode + 1
    codeSize = minCodeSize + 1
    tableSize = 1 << codeSize
  }

  emit(clearCode, codeSize)
  resetTable()

  let prefix = indexed[0]
  for (let i = 1; i < indexed.length; i++) {
    const suffix = indexed[i]
    const key = (prefix << 16) | suffix
    if (table.has(key)) {
      prefix = table.get(key)!
    } else {
      emit(prefix, codeSize)
      if (nextCode < 4096) {
        table.set(key, nextCode)
        if (nextCode >= tableSize && codeSize < 12) {
          codeSize++
          tableSize = 1 << codeSize
        }
        nextCode++
      } else {
        emit(clearCode, codeSize)
        resetTable()
      }
      prefix = suffix
    }
  }
  emit(prefix, codeSize)
  emit(eoiCode, codeSize)

  if (curBits > 0) out.push(curByte & 0xff)
  return new Uint8Array(out)
}
