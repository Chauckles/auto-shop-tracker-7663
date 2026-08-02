import { useEffect, useMemo, useRef, useState } from 'react'
import { extractLicensePlate, extractPlateTextSelection } from './recognition'

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se'
type DragState = { handle: DragHandle; startX: number; startY: number; startRect: Rect } | null

interface PlateScannerModalProps {
  photo: string
  onResult: (value: string) => void
  onRetake: () => void
  onCancel: () => void
}

const DEFAULT_SELECTION: Rect = { x: 0.07, y: 0.36, width: 0.86, height: 0.28 }

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function clampRect(rect: Rect, minWidth = 0.08, minHeight = 0.08): Rect {
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

  if (handle === 'ne' || handle === 'se') {
    next.width = rect.width + dx
  }

  if (handle === 'nw' || handle === 'ne') {
    next.y = rect.y + dy
    next.height = rect.height - dy
  }

  if (handle === 'sw' || handle === 'se') {
    next.height = rect.height + dy
  }

  if (next.width < 0.08) {
    if (handle === 'nw' || handle === 'sw') next.x = rect.x + rect.width - 0.08
    next.width = 0.08
  }

  if (next.height < 0.08) {
    if (handle === 'nw' || handle === 'ne') next.y = rect.y + rect.height - 0.08
    next.height = 0.08
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
  const scale = Math.min(4, Math.max(1, 1600 / Math.max(sw, sh)))

  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL(mime, 0.95)
}

async function dataUrlToFile(dataUrl: string) {
  const blob = await fetch(dataUrl).then(response => response.blob())
  return new File([blob], 'plate-selection.jpg', { type: blob.type || 'image/jpeg' })
}

function SelectionBox({ rect, onStart }: {
  rect: Rect
  onStart: (handle: DragHandle, event: React.PointerEvent) => void
}) {
  const handleClass = 'absolute h-8 w-8 rounded-full border-2 border-white bg-blue-500 shadow-lg shadow-black/30 touch-none'

  return (
    <div
      className="absolute border-2 border-blue-400 bg-blue-400/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] touch-none"
      style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
      onPointerDown={event => onStart('move', event)}
    >
      <div className="absolute -top-8 left-0 rounded-full bg-blue-500 px-2 py-1 text-[11px] font-bold text-white shadow">Letters only</div>
      <button aria-label="top left crop handle" className={`${handleClass} -left-4 -top-4 cursor-nwse-resize`} onPointerDown={event => onStart('nw', event)} />
      <button aria-label="top right crop handle" className={`${handleClass} -right-4 -top-4 cursor-nesw-resize`} onPointerDown={event => onStart('ne', event)} />
      <button aria-label="bottom left crop handle" className={`${handleClass} -bottom-4 -left-4 cursor-nesw-resize`} onPointerDown={event => onStart('sw', event)} />
      <button aria-label="bottom right crop handle" className={`${handleClass} -bottom-4 -right-4 cursor-nwse-resize`} onPointerDown={event => onStart('se', event)} />
    </div>
  )
}

export function PlateScannerModal({ photo, onResult, onRetake, onCancel }: PlateScannerModalProps) {
  const selectionBoxRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<'select' | 'review'>('select')
  const [selectionRect, setSelectionRect] = useState(DEFAULT_SELECTION)
  const [selectedImage, setSelectedImage] = useState('')
  const [ocrResult, setOcrResult] = useState('')
  const [processing, setProcessing] = useState(false)
  const [drag, setDrag] = useState<DragState>(null)
  const [zoom, setZoom] = useState(1.45)

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
    return step === 'select' ? 'Select license letters' : 'Review license plate'
  }, [step])

  function startDrag(handle: DragHandle, event: React.PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    setDrag({ handle, startX: event.clientX, startY: event.clientY, startRect: selectionRect })
  }

  async function readSelectedText() {
    setProcessing(true)
    const cropped = await cropDataUrl(photo, selectionRect)
    setSelectedImage(cropped)
    const file = await dataUrlToFile(cropped)
    const text = await extractPlateTextSelection(file)
    setOcrResult(extractLicensePlate(text) || '')
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
                    ? 'Zoom, scroll/pan, then crop tightly around only the license letters and numbers.'
                    : 'Check the result and edit it if needed.'}
                </p>
              </div>
              <button onClick={onCancel} className="rounded-full px-2 text-2xl font-bold text-slate-500 hover:bg-slate-100">×</button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4 pb-24 sm:pb-4">
            {step === 'select' && (
              <div className="space-y-3">
                <label className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                  Zoom photo
                  <input
                    type="range"
                    min="1"
                    max="3.5"
                    step="0.05"
                    value={zoom}
                    onChange={event => setZoom(Number(event.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
                <div className="overflow-auto rounded-xl bg-black p-2 shadow-inner">
                  <div ref={selectionBoxRef} className="relative mx-auto" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
                    <img src={photo} alt="License plate capture" className="block w-full select-none" draggable={false} />
                    <SelectionBox rect={selectionRect} onStart={startDrag} />
                  </div>
                </div>
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Tip: zoom in, scroll to the plate, then make the crop tight around the red plate characters. You can also type the plate manually on the next screen.
                </p>
              </div>
            )}

            {step === 'review' && (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-black">
                  <img src={selectedImage || photo} alt="Selected license text" className="w-full" />
                </div>
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">License Plate</span>
                  <input
                    value={ocrResult}
                    onChange={event => setOcrResult(event.target.value.toUpperCase())}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-mono text-lg font-bold uppercase tracking-wide outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Type plate if needed"
                    autoFocus
                  />
                </label>
                {!ocrResult && <p className="text-sm text-amber-600">⚠️ Could not read the selected area. Type it in or go back and adjust the rectangle.</p>}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {processing ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700">🔍 Reading selected letters…</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                <button onClick={onRetake} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 sm:flex-1">📷 Retake</button>
                {step === 'select' && <button onClick={readSelectedText} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 sm:flex-[2]">Read selected text</button>}
                {step === 'review' && (
                  <>
                    <button onClick={() => setStep('select')} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 sm:flex-1">Adjust box</button>
                    <button onClick={confirmResult} disabled={!ocrResult.trim()} className="col-span-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:flex-[2]">✓ Use This Plate</button>
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
