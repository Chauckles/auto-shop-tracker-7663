import Tesseract, { PSM } from 'tesseract.js'

type RecognitionType = 'vin' | 'plate'

interface OcrVariant {
  label: string
  dataUrl: string
  pageSegMode: PSM
}

interface CropSpec {
  label: string
  x: number
  y: number
  w: number
  h: number
  rotate?: 0 | 90 | -90
  invert?: boolean
  threshold?: boolean
}

interface CandidateScore {
  value: string
  score: number
}

const VIN_ALLOWED = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
const OCR_TO_DIGIT: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  T: '1',
  Z: '2',
  S: '5',
  B: '8',
  G: '6',
}

const OCR_TO_LETTER: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '2': 'Z',
  '5': 'S',
  '6': 'G',
  '8': 'B',
}

const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
}

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function normalizeAlphanumeric(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normalizeVinCandidate(value: string) {
  return normalizeAlphanumeric(value)
    .replace(/[IOQ]/g, char => OCR_TO_DIGIT[char] || char)
    .replace(/[^A-HJ-NPR-Z0-9]/g, '')
}

function vinChecksumIsValid(vin: string) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false

  const total = vin.split('').reduce((sum, char, index) => {
    return sum + (VIN_TRANSLITERATION[char] ?? 0) * VIN_WEIGHTS[index]
  }, 0)
  const check = total % 11
  const expected = check === 10 ? 'X' : String(check)
  return vin[8] === expected
}

function scoreVin(value: string, sourceLine: string) {
  let score = 0
  if (value.length !== 17) return -100
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) return -100
  if (!/[A-Z]/.test(value) || !/[0-9]/.test(value)) score -= 10
  if (vinChecksumIsValid(value)) score += 80
  if (/VIN|V\.I\.N|MFD|MFD\.|MANUFACTURED|MOTOR|CORPORATION|TOYOTA|KIA|LEXUS/.test(sourceLine)) score += 18
  if (/^[123456789JTKVWYZ][A-HJ-NPR-Z0-9]{2}/.test(value)) score += 10
  if (/^(JTH|JT[1-9A-HJ-NPR-Z]|KND|KNA|KNM|5XY|5XX|1HG|2HG|1FT|1G[0-9A-HJ-NPR-Z]|3VW|WBA|WDD|WAU)/.test(value)) score += 78
  if (/[AEHLNRSVWY123456789X]$/.test(value)) score += 2
  if (/[A-Z]{7,}/.test(value)) score -= 24
  if (/000000|111111|222222|333333|444444|555555|666666|777777|888888|999999/.test(value)) score -= 20
  if (/STANDARD|FEDERAL|VEHICLE|SAFETY|BUMPER|PASS\.?\s*CAR/.test(sourceLine)) score -= 12
  if (/PASS\.?\s*CAR/.test(sourceLine) && !/^(JTH|JT[1-9A-HJ-NPR-Z])/.test(value)) score -= 35
  if (/MOTOR|CORPORATION|MANUFACTURED|APPLICABLE|PREVENTION/.test(value)) score -= 55
  if (/Y[0O]Y[0O]TA|M[0O]T[0O]R|C[0O]RP|APPL[1I]CABLE|STANDARD/.test(value)) score -= 80
  return score
}

function pushVinWindows(candidates: CandidateScore[], raw: string, sourceLine: string, baseScore = 0) {
  const cleaned = normalizeVinCandidate(raw)
  if (cleaned.length < 17) return

  for (let index = 0; index <= cleaned.length - 17; index += 1) {
    const value = cleaned.slice(index, index + 17)
    const score = scoreVin(value, sourceLine) + baseScore - Math.abs(index) * 0.2
    if (score > -20) candidates.push({ value, score })
  }
}

export function extractVIN(text: string): string {
  const lines = text.toUpperCase().split(/\n+/).map(line => line.trim()).filter(Boolean)
  const candidates: CandidateScore[] = []

  lines.forEach((line, index) => {
    const context = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(' ')
    const labelBoost = /VIN|V\.I\.N|SERIAL/.test(context)
    const stickerBoost = /MFD|MANUFACTURED|TOYOTA|KIA|LEXUS/.test(context)
    const boosted = labelBoost || stickerBoost
    const chunks = unique([
      line,
      context,
      ...line.split(/\s+/),
      ...line.match(/[A-Z0-9][A-Z0-9\s.:-]{12,28}[A-Z0-9]/g) || [],
    ])

    chunks.forEach(chunk => pushVinWindows(candidates, chunk, context, labelBoost ? 24 : boosted ? 8 : 0))
  })

  pushVinWindows(candidates, text, text, -10)

  const bestByValue = new Map<string, CandidateScore>()
  candidates.forEach(candidate => {
    const existing = bestByValue.get(candidate.value)
    if (!existing || candidate.score > existing.score) {
      bestByValue.set(candidate.value, candidate)
    }
  })

  const ranked = Array.from(bestByValue.values()).sort((a, b) => b.score - a.score)
  return ranked[0]?.value || ''
}

function normalizePlateForPattern(value: string) {
  let plate = normalizeAlphanumeric(value)
  if (plate.length < 4 || plate.length > 7) return plate

  const commonSix = plate.split('')
  if (/^[A-Z][A-Z0-9]{2,3}[A-Z0-9]{2}$/.test(plate)) {
    commonSix[0] = OCR_TO_DIGIT[commonSix[0]] || commonSix[0]
  }

  // Massachusetts passenger plates are commonly "2HFK34" / "5VLF47":
  // digit, three letters, two digits. Normalize only those positions.
  if (commonSix.length === 6) {
    commonSix[0] = OCR_TO_DIGIT[commonSix[0]] || commonSix[0]
    commonSix[1] = OCR_TO_LETTER[commonSix[1]] || commonSix[1]
    commonSix[2] = OCR_TO_LETTER[commonSix[2]] || commonSix[2]
    commonSix[3] = OCR_TO_LETTER[commonSix[3]] || commonSix[3]
    commonSix[4] = OCR_TO_DIGIT[commonSix[4]] || commonSix[4]
    commonSix[5] = OCR_TO_DIGIT[commonSix[5]] || commonSix[5]
  }

  return commonSix.join('')
}

function scorePlate(value: string, sourceLine: string) {
  if (value.length < 4 || value.length > 7) return -100
  if (!/[A-Z]/.test(value) || !/[0-9]/.test(value)) return -70
  if (/^(APR|JUL|JAN|FEB|MAR|MAY|JUN|AUG|SEP|OCT|NOV|DEC|USA|THE|SPIRIT|AMERICA|MASS|MASSACHUSETTS)$/.test(value)) return -100
  if (/^(19|20)\d{2}$/.test(value)) return -100

  let score = 0
  if (value.length === 6) score += 24
  if (value.length === 5) score += 18
  if (/^\d[A-Z]{3}\d{2}$/.test(value)) score += 60
  if (/^\d[A-Z]{3}\d{2}$/.test(value) && /\b[A-Z0-9]\s*[A-Z0-9]\s*[A-Z0-9]\s*[A-Z0-9]\s*[A-Z0-9]\s*[A-Z0-9]\b/.test(sourceLine)) score += 18
  if (/^\d[A-Z]{2}\d{2}$/.test(value)) score += 36
  if (/^\d[A-Z]{2,4}\d{1,2}$/.test(value)) score += 24
  if (/MASSACHUSETTS|SPIRIT OF AMERICA|APR|JUL|JAN|FEB|MAR|MAY|JUN|AUG|SEP|OCT|NOV|DEC/.test(sourceLine)) score += 12
  if (/[^A-Z0-9]/.test(sourceLine)) score += 3
  if (/^[A-Z]{4,}$/.test(value) || /^\d{4,}$/.test(value)) score -= 25
  return score
}

function addPlateCandidate(candidates: CandidateScore[], raw: string, sourceLine: string) {
  const compact = normalizeAlphanumeric(raw)
  const exactCompact = raw.trim().replace(/[^A-Z0-9]+/gi, '').toUpperCase()
  if (compact.length < 4) return

  const windows: string[] = []
  if (compact.length <= 7) {
    windows.push(compact)
  } else {
    for (let size = 4; size <= 7; size += 1) {
      for (let index = 0; index <= compact.length - size; index += 1) {
        windows.push(compact.slice(index, index + size))
      }
    }
  }

  unique(windows).forEach(window => {
    const normalized = normalizePlateForPattern(window)
    const exactLineBonus = window === exactCompact && window.length >= 5 ? 45 : 0
    candidates.push({ value: normalized, score: scorePlate(normalized, sourceLine) + exactLineBonus })
  })
}

export function extractLicensePlate(text: string): string {
  const lines = text.toUpperCase().split(/\n+/).map(line => line.trim()).filter(Boolean)
  const candidates: CandidateScore[] = []

  lines.forEach((line, index) => {
    const context = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(' ')
    const chunks = unique([
      line,
      ...line.split(/\s+/),
      ...line.match(/[A-Z0-9][A-Z0-9\s-]{2,10}[A-Z0-9]/g) || [],
    ])
    chunks.forEach(chunk => addPlateCandidate(candidates, chunk, context))
  })

  addPlateCandidate(candidates, text, text)

  const bestByValue = new Map<string, CandidateScore>()
  candidates.forEach(candidate => {
    const existing = bestByValue.get(candidate.value)
    if (!existing || candidate.score > existing.score) {
      bestByValue.set(candidate.value, candidate)
    }
  })

  const ranked = Array.from(bestByValue.values()).sort((a, b) => b.score - a.score)
  return ranked.find(candidate => candidate.score > 0)?.value || ''
}

function getCropSpecs(type: RecognitionType): CropSpec[] {
  if (type === 'plate') {
    return [
      { label: 'full', x: 0, y: 0, w: 1, h: 1 },
      { label: 'plate-middle-band', x: 0.12, y: 0.28, w: 0.76, h: 0.42 },
      { label: 'plate-lower-center', x: 0.18, y: 0.43, w: 0.72, h: 0.45 },
      { label: 'plate-lower-right', x: 0.42, y: 0.45, w: 0.56, h: 0.42 },
      { label: 'plate-center-tight', x: 0.28, y: 0.34, w: 0.50, h: 0.32 },
    ]
  }

  return [
    { label: 'full', x: 0, y: 0, w: 1, h: 1, invert: true },
    { label: 'vin-center-label', x: 0.10, y: 0.18, w: 0.80, h: 0.64, invert: true },
    { label: 'vin-lower-label', x: 0.08, y: 0.30, w: 0.84, h: 0.45, invert: true },
    { label: 'vin-full-rotated-left', x: 0, y: 0, w: 1, h: 1, rotate: -90, invert: true },
    { label: 'vin-full-rotated-right', x: 0, y: 0, w: 1, h: 1, rotate: 90, invert: true },
    { label: 'vin-center-rotated-left', x: 0.10, y: 0.18, w: 0.80, h: 0.64, rotate: -90, invert: true },
    { label: 'vin-center-rotated-right', x: 0.10, y: 0.18, w: 0.80, h: 0.64, rotate: 90, invert: true },
  ]
}

function enhanceCanvas(canvas: HTMLCanvasElement, invert = false, threshold = false) {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114)
    const contrast = threshold ? 2.8 : 2.0
    let value = ((gray - 128) * contrast) + 128
    if (threshold) value = value > 145 ? 255 : 0
    if (invert) value = 255 - value
    value = Math.max(0, Math.min(255, value))

    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }

  ctx.putImageData(imageData, 0, 0)
}

function drawVariant(img: HTMLImageElement, spec: CropSpec, threshold = false): string {
  const sourceX = Math.max(0, img.width * spec.x)
  const sourceY = Math.max(0, img.height * spec.y)
  const sourceW = Math.min(img.width - sourceX, img.width * spec.w)
  const sourceH = Math.min(img.height - sourceY, img.height * spec.h)
  const scale = Math.max(1, Math.min(3, 1800 / Math.max(sourceW, sourceH)))
  const rotated = spec.rotate === 90 || spec.rotate === -90
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  canvas.width = Math.max(1, Math.round((rotated ? sourceH : sourceW) * scale))
  canvas.height = Math.max(1, Math.round((rotated ? sourceW : sourceH) * scale))

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  if (spec.rotate === 90) {
    ctx.translate(canvas.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.height, canvas.width)
  } else if (spec.rotate === -90) {
    ctx.translate(0, canvas.height)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.height, canvas.width)
  } else {
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height)
  }

  enhanceCanvas(canvas, Boolean(spec.invert), threshold || Boolean(spec.threshold))
  return canvas.toDataURL('image/png')
}

async function createOcrVariants(file: File, type: RecognitionType): Promise<OcrVariant[]> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const variants: OcrVariant[] = []
      getCropSpecs(type).forEach(spec => {
        variants.push({ label: spec.label, dataUrl: drawVariant(img, spec), pageSegMode: spec.label === 'full' ? PSM.SPARSE_TEXT : PSM.SINGLE_BLOCK })
        if (type === 'vin') {
          variants.push({ label: `${spec.label}-threshold`, dataUrl: drawVariant(img, spec, true), pageSegMode: PSM.SINGLE_BLOCK })
        }
      })
      resolve(variants)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve([])
    }

    img.src = url
  })
}

export async function preprocessImage(file: File): Promise<string> {
  const variants = await createOcrVariants(file, 'plate')
  return variants[0]?.dataUrl || ''
}

async function createPlateSelectionVariants(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      const scale = Math.max(1, Math.min(4, 1800 / Math.max(img.width, img.height)))
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const variants: string[] = []
      variants.push(canvas.toDataURL('image/png'))

      const source = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const redCanvas = document.createElement('canvas')
      const redCtx = redCanvas.getContext('2d')!
      redCanvas.width = canvas.width
      redCanvas.height = canvas.height
      const redData = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height)

      for (let i = 0; i < redData.data.length; i += 4) {
        const r = redData.data[i]
        const g = redData.data[i + 1]
        const b = redData.data[i + 2]
        const redness = r - Math.max(g, b)
        const isRedCharacter = r > 110 && redness > 32
        const gray = (r * 0.299) + (g * 0.587) + (b * 0.114)
        const isDarkCharacter = gray < 95
        const value = isRedCharacter || isDarkCharacter ? 0 : 255
        redData.data[i] = value
        redData.data[i + 1] = value
        redData.data[i + 2] = value
      }

      redCtx.putImageData(redData, 0, 0)
      variants.push(redCanvas.toDataURL('image/png'))

      const contrastCanvas = document.createElement('canvas')
      const contrastCtx = contrastCanvas.getContext('2d')!
      contrastCanvas.width = canvas.width
      contrastCanvas.height = canvas.height
      contrastCtx.drawImage(canvas, 0, 0)
      enhanceCanvas(contrastCanvas, false, true)
      variants.push(contrastCanvas.toDataURL('image/png'))

      resolve(variants)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve([])
    }

    img.src = url
  })
}

export async function extractPlateTextSelection(imageFile: File): Promise<string> {
  try {
    const variants = await createPlateSelectionVariants(imageFile)
    const worker = await Tesseract.createWorker('eng')
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      preserve_interword_spaces: '1',
    })

    const texts: string[] = []
    for (const variant of variants) {
      for (const pageSegMode of [PSM.SINGLE_LINE, PSM.RAW_LINE, PSM.SINGLE_WORD]) {
        await worker.setParameters({ tessedit_pageseg_mode: pageSegMode })
        const result = await worker.recognize(variant)
        texts.push(result.data.text || '')
      }
    }

    await worker.terminate()
    return [extractLicensePlate(texts.join('\n')), ...texts].filter(Boolean).join('\n')
  } catch (error) {
    console.error('Plate selection OCR error:', error)
    return ''
  }
}

export async function extractTextFromImage(imageFile: File, type: RecognitionType): Promise<string> {
  try {
    const variants = await createOcrVariants(imageFile, type)
    const worker = await Tesseract.createWorker('eng')

    await worker.setParameters({
      tessedit_char_whitelist: type === 'vin' ? VIN_ALLOWED : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      preserve_interword_spaces: '1',
    })

    const texts: string[] = []
    let bestValue = ''

    for (const variant of variants) {
      await worker.setParameters({ tessedit_pageseg_mode: variant.pageSegMode })
      const result = await worker.recognize(variant.dataUrl)
      const text = result.data.text || ''
      texts.push(text)

      const value = type === 'vin' ? extractVIN(text) : extractLicensePlate(text)
      if (value && (!bestValue || value.length > bestValue.length || (type === 'vin' && vinChecksumIsValid(value)))) {
        bestValue = value
      }
    }

    await worker.terminate()
    return [bestValue, ...texts].filter(Boolean).join('\n')
  } catch (error) {
    console.error('OCR error:', error)
    return ''
  }
}
