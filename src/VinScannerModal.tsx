import { useEffect, useMemo, useRef, useState } from 'react'
import { extractTextFromImage, extractVIN } from './recognition'

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se'
type DragState = { handle: DragHandle; startX: number; startY: number; startRect: Rect } | null

interface VinScannerModalProps {
  photo: string
  onResult: (value: string) => void
  onRetake: () => void
  onCancel: () => void
}

const DEFAULT_SELECTION: Rect = { x: 0.12, y: 0.42, width: 0.76, height: 0.18 }

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function clampRect(rect: Rect, minWidth = 0.08, minHeight = 0.06): Rect {
  const width = clamp(rect.width, minWidth, 1)
  const height = clamp(rect.height, minHeight, 1)
  return {
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height,
  }
}

function updateRect(rect: Rect, dx: number, dy: number, handle: DragHandle): Rect {
  if (handle === 'move') {
    return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, rect.width, rect.height)
  }

  let next = { ...rect }

  if (handle === 'nw' || handle === 'sw') {
    next.x = rect.x + dx
    next.width = rect.width - dx
  }

  if (handle === 'ne' || handle === 'se') next.width = rect.width + dx

  if (handle === 'nw' || handle === 'ne') {
    next.y = rect.y + dy
    next.height = rect.height - dy
  }

  if (handle === 'sw' || handle === 'se') next.height = rect.height + dy

  if (next.width < 0.08) {
    if (handle === 'nw' || handle === 'sw') next.x = rect.x + rect.width - 0.08
    next.width = 0.08
  }

  if (next.height < 0.06) {
    if (handle === 'nw' || handle === 'ne') next.y = rect.y + rect.height - 0.06
    next.height = 0.06
  }

  return clampRect(next)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function cropDataUrl(source: string, rect: Rect, mime = 'image/jpeg') {
  const img = await loadImage(source)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const sx = img.naturalWidth * rect.x
  const sy = img.naturalHeight * rect.y
  const sw = img.naturalWidth * rect.width
  const sh = img.naturalHeight * rect.height
  const scale = Math.min(5, Math.max(1, 1900 / Math.max(sw, sh)))

  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL(mime, 0.95)
}

async function dataUrlToFile(dataUrl: string) {
  const blob = await fetch(dataUrl).then(response => response.blob())
  return new File([blob], 'vin-selection.jpg', { type: blob.type || 'image/jpeg' })
}

async function dataUrlToOriginalFile(dataUrl: string) {
  const blob = await fetch(dataUrl).then(response => response.blob())
  return new File([blob], 'vin-photo.jpg', { type: blob.type || 'image/jpeg' })
}

function SelectionBox({ rect, onStart }: {
  rect: Rect
  onStart: (handle: DragHandle, event: React.PointerEvent) => void
}) {
  const handleClass = 'absolute h-8 w-8 rounded-full border-2 border-white bg-emerald-500 shadow-lg shadow-black/30 touch-none'

  return (
    <div
      className="absolute border-2 border-emerald-400 bg-emerald-400/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] touch-none"
      style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
      onPointerDown={event => onStart('move', event)}
    >
      <div className="absolute -top-8 left-0 rounded-full bg-emerald-500 px-2 py-1 text-[11px] font-bold text-white shadow">VIN only</div>
      <button aria-label="top left VIN handle" className={`${handleClass} -left-4 -top-4 cursor-nwse-resize`} onPointerDown={event => onStart('nw', event)} />
      <button aria-label="top right VIN handle" className={`${handleClass} -right-4 -top-4 cursor-nesw-resize`} onPointerDown={event => onStart('ne', event)} />
      <button aria-label="bottom left VIN handle" className={`${handleClass} -bottom-4 -left-4 cursor-nesw-resize`} onPointerDown={event => onStart('sw', event)} />
      <button aria-label="bottom right VIN handle" className={`${handleClass} -bottom-4 -right-4 cursor-nwse-resize`} onPointerDown={event => onStart('se', event)} />
    </div>
  )
}

export function VinScannerModal({ photo, onResult, onRetake, onCancel }: VinScannerModalProps) {
  const selectionBoxRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<'auto' | 'select' | 'review'>('auto')
  const [selectionRect, setSelectionRect] = useState(DEFAULT_SELECTION)
  const [selectedImage, setSelectedImage] = useState('')
  const [ocrResult, setOcrResult] = useState('')
  const [processing, setProcessing] = useState(true)
  const [drag, setDrag] = useState<DragState>(null)
  const [zoom, setZoom] = useState(1.35)

  useEffect(() => {
    let cancelled = false

    async function readFullPhoto() {
      setProcessing(true)
      const file = await dataUrlToOriginalFile(photo)
      const text = await extractTextFromImage(file, 'vin')
      if (cancelled) return
      setOcrResult(extractVIN(text) || '')
      setProcessing(false)
      setStep('review')
    }

    readFullPhoto().catch(() => {
      if (!cancelled) {
        setOcrResult('')
        setProcessing(false)
        setStep('review')
      }
    })

    return () => {
      cancelled = true
    }
  }, [photo])

  useEffect(() => {
    if (!drag) return
    const activeDrag = drag

    function handleMove(event: PointerEvent) {
      const target = selectionBoxRef.current
      if (!target) return
      const box = target.getBoundingClientRect()
      const dx = (event.clientX - activeDrag.startX) / box.width
      const dy = (event.clientY - activeDrag.startY) / box.height
      setSelectionRect(updateRect(activeDrag.startRect, dx, dy, activeDrag.handle))
    }

    function handleUp() {
      setDrag(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [drag])

  const title = useMemo(() => {
    if (step === 'select') return 'Highlight VIN'
    return 'Review VIN'
  }, [step])

  function startDrag(handle: DragHandle, event: React.PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    setDrag({ handle, startX: event.clientX, startY: event.clientY, startRect: selectionRect })
  }

  async function readSelectedVin() {
    setProcessing(true)
    const cropped = await cropDataUrl(photo, selectionRect)
    setSelectedImage(cropped)
    const file = await dataUrlToFile(cropped)
    const text = await extractTextFromImage(file, 'vin')
    setOcrResult(extractVIN(text) || '')
    setProcessing(false)
    setStep('review')
  }

  function confirmResult() {
    const finalValue = ocrResult.trim().toUpperCase()
    if (finalValue) onResult(finalValue)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/95 p-2 sm:p-4">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col justify-start py-2 sm:min-h-0">
        <div className="flex max-h-none w-full flex-col overflow-visible rounded-2xl border border-slate-700 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:overflow-hidden">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{title}</h2>
                <p className="text-sm text-slate-500">
                  {step === 'select'
                    ? 'Zoom, scroll/pan, then crop a rectangle tightly around only the VIN characters.'
                    : 'The app tried to read the VIN automatically. If it is wrong, crop the VIN manually.'}
                </p>
              </div>
              <button onClick={onCancel} className="rounded-full px-2 text-2xl font-bold text-slate-500 hover:bg-slate-100">×</button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4 pb-24 sm:pb-4">
            {step === 'select' ? (
              <div className="space-y-3">
                <label className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                  Zoom photo
                  <input
                    type="range"
                    min="1"
                    max="2.8"
                    step="0.05"
                    value={zoom}
                    onChange={event => setZoom(Number(event.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
                <div className="overflow-auto rounded-xl bg-black p-2 shadow-inner">
                  <div ref={selectionBoxRef} className="relative mx-auto" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
                    <img src={photo} alt="VIN capture" className="block w-full select-none" draggable={false} />
                    <SelectionBox rect={selectionRect} onStart={startDrag} />
                  </div>
                </div>
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Tip: crop the rectangle around only the 17 VIN characters, just like the license reader. You can still type corrections on the review screen.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-black">
                  <img src={selectedImage || photo} alt="VIN capture preview" className="w-full" />
                </div>
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">VIN Number</span>
                  {processing ? (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-8 text-center text-sm font-bold text-blue-700">🔍 Reading VIN from photo…</div>
                  ) : (
                    <input
                      value={ocrResult}
                      onChange={event => setOcrResult(event.target.value.toUpperCase())}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-mono text-lg font-bold uppercase tracking-wide outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Type VIN if needed"
                      maxLength={17}
                      autoFocus
                    />
                  )}
                </label>
                {!processing && !ocrResult && <p className="text-sm text-amber-600">⚠️ Could not read the VIN automatically. Tap “Crop VIN” and draw the rectangle around just the VIN characters.</p>}
                {!processing && ocrResult && ocrResult.length !== 17 && <p className="text-sm text-amber-600">⚠️ VIN should be 17 characters. Highlight it again or edit the text.</p>}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {processing && step !== 'select' ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700">🔍 Reading VIN…</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                <button onClick={onRetake} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 sm:flex-1">📷 Retake</button>
                {step === 'select' ? (
                  <button onClick={readSelectedVin} disabled={processing} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:flex-[2]">Read cropped VIN</button>
                ) : (
                  <>
                    <button onClick={() => setStep('select')} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 sm:flex-1">Crop VIN</button>
                    <button onClick={confirmResult} disabled={!ocrResult.trim()} className="col-span-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:flex-[2]">✓ Use This VIN</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
