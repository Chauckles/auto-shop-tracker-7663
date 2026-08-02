import { Fragment, createContext, useEffect, useMemo, useState, useRef } from 'react'
import { api } from './lib/supabase'
import { PlateScannerModal } from './PlateScannerModal'
import { VinScannerModal } from './VinScannerModal'

type ProgressStatus = 'not-started' | 'in-progress' | 'on-hold' | 'done'
type ServiceStatus = 'recommended' | 'approved' | 'completed'
type LanguageCode = 'en' | 'zh' | 'km' | 'vi' | 'es' | 'fr' | 'ar' | 'ko' | 'tl' | 'hi'

interface Note {
  id: string
  date: string
  technician: string
  notes: string
  editedAt?: string
  deleted?: boolean
  deletedAt?: string
  deletedBy?: string
  originalNotes?: string
}

interface ServiceLog {
  id: string
  date: string
  type: string
  description: string
  status: ServiceStatus
  quantity?: number
  unitPrice?: number
  partsCost: number
  flatFee: number
  laborHours?: number
  laborPeople?: number
  laborRate?: number
  paymentStatus?: 'paid' | 'not-paid'
  note: string
}

interface Vehicle {
  id: string
  system_number: number
  key_number: string
  license_plate: string
  car_model: string
  vin: string
  year: string
  status: ProgressStatus
  notes: Note[]
  services: ServiceLog[]
  created_at: string
}

type FilterTab = 'all' | 'services' | ProgressStatus

interface VinLookupResult {
  valid?: boolean
  vin?: string
  year?: string | null
  make?: string | null
  model?: string | null
  trim?: string | null
  bodyClass?: string | null
  vehicleType?: string | null
  car_model?: string
  warning?: string | null
  error?: string
}

const statusMeta: Record<ProgressStatus, { label: string; pill: string; dot: string; select: string }> = {
  'not-started': {
    label: 'Not Started',
    pill: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-400',
    select: 'bg-slate-50 text-slate-800 border-slate-200',
  },
  'in-progress': {
    label: 'In Progress',
    pill: 'bg-blue-50 text-blue-700 ring-blue-200',
    dot: 'bg-blue-500',
    select: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  'on-hold': {
    label: 'On Hold',
    pill: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
    select: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  done: {
    label: 'Completed',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    select: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
}

const tabs: Array<{ key: FilterTab; labelKey: keyof typeof translations.en }> = [
  { key: 'all', labelKey: 'all' },
  { key: 'services', labelKey: 'serviceRepair' },
  { key: 'not-started', labelKey: 'notStarted' },
  { key: 'in-progress', labelKey: 'inProgress' },
  { key: 'on-hold', labelKey: 'onHold' },
  { key: 'done', labelKey: 'completed' },
]

const languages: Array<{ code: LanguageCode; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文 Chinese' },
  { code: 'km', label: 'ភាសាខ្មែរ Khmer' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'ko', label: '한국어' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'hi', label: 'हिन्दी' },
]

const translations = {
  en: { all: 'All', serviceRepair: 'Service/Repair', notStarted: 'Not Started', inProgress: 'In Progress', onHold: 'On Hold', completed: 'Completed', addVehicle: '+ Add Vehicle', closeForm: 'Close Form', vehicleBoard: 'Vehicle Board', showing: 'showing', servicesLogged: 'services logged', no: 'No', vehicle: 'Vehicle', plate: 'Plate', status: 'Status', services: 'Services', payment: 'Payment', notes: 'Notes', actions: 'Actions', details: 'Details', hide: 'Hide', delete: 'Delete', paid: 'Paid', notPaid: 'Not Paid', fastServices: 'Fast Services', quickAddCar: '+ Quick Add Car', closeQuickAdd: 'Close Quick Add', year: 'Year', brandModel: 'Brand / model', licensePlate: 'License plate', addAndSelect: 'Add & Select', quickAdd: 'Quick Add', logService: 'Log Service', edit: 'Edit', remove: 'Remove', save: 'Save', cancel: 'Cancel', parts: 'Parts/Material', time: 'Time (hrs)', people: '# People', customerFormula: 'Customer price = parts/material cost + time × people × rate.' },
  zh: { all: '全部', serviceRepair: '服务/维修', notStarted: '未开始', inProgress: '进行中', onHold: '暂停', completed: '已完成', addVehicle: '+ 添加车辆', closeForm: '关闭表格', vehicleBoard: '车辆列表', showing: '显示', servicesLogged: '服务记录', no: '编号', vehicle: '车辆', plate: '车牌', status: '状态', services: '服务', payment: '付款', notes: '备注', actions: '操作', details: '详情', hide: '隐藏', delete: '删除', paid: '已付款', notPaid: '未付款', fastServices: '快速服务', quickAddCar: '+ 快速添加车', closeQuickAdd: '关闭快速添加', year: '年份', brandModel: '品牌/车型', licensePlate: '车牌', addAndSelect: '添加并选择', quickAdd: '快速添加', logService: '记录服务', edit: '编辑', remove: '移除', save: '保存', cancel: '取消', parts: '零件/材料', time: '时间(小时)', people: '人数', customerFormula: '客户价格 = 零件/材料 + 时间 × 人数 × 费率。' },
  km: { all: 'ទាំងអស់', serviceRepair: 'សេវា/ជួសជុល', notStarted: 'មិនទាន់ចាប់ផ្តើម', inProgress: 'កំពុងធ្វើ', onHold: 'ផ្អាក', completed: 'រួចរាល់', addVehicle: '+ បន្ថែមឡាន', closeForm: 'បិទទម្រង់', vehicleBoard: 'បញ្ជីឡាន', showing: 'កំពុងបង្ហាញ', servicesLogged: 'កំណត់ត្រាសេវា', no: 'លេខ', vehicle: 'ឡាន', plate: 'ផ្លាកលេខ', status: 'ស្ថានភាព', services: 'សេវា', payment: 'ការទូទាត់', notes: 'កំណត់ចំណាំ', actions: 'សកម្មភាព', details: 'លម្អិត', hide: 'លាក់', delete: 'លុប', paid: 'បានបង់', notPaid: 'មិនទាន់បង់', fastServices: 'សេវាលឿន', quickAddCar: '+ បន្ថែមឡានលឿន', closeQuickAdd: 'បិទបន្ថែមលឿន', year: 'ឆ្នាំ', brandModel: 'ម៉ាក/ម៉ូដែល', licensePlate: 'ផ្លាកលេខ', addAndSelect: 'បន្ថែម និងជ្រើស', quickAdd: 'បន្ថែមលឿន', logService: 'កត់ត្រាសេវា', edit: 'កែ', remove: 'ដកចេញ', save: 'រក្សាទុក', cancel: 'បោះបង់', parts: 'គ្រឿង/សម្ភារៈ', time: 'ពេល(ម៉ោង)', people: 'ចំនួនមនុស្ស', customerFormula: 'តម្លៃអតិថិជន = គ្រឿង/សម្ភារៈ + ពេល × មនុស្ស × តម្លៃ។' },
  vi: { all: 'Tất cả', serviceRepair: 'Dịch vụ/Sửa chữa', notStarted: 'Chưa bắt đầu', inProgress: 'Đang làm', onHold: 'Tạm dừng', completed: 'Hoàn tất', addVehicle: '+ Thêm xe', closeForm: 'Đóng form', vehicleBoard: 'Danh sách xe', showing: 'đang hiển thị', servicesLogged: 'dịch vụ đã ghi', no: 'Số', vehicle: 'Xe', plate: 'Biển số', status: 'Trạng thái', services: 'Dịch vụ', payment: 'Thanh toán', notes: 'Ghi chú', actions: 'Thao tác', details: 'Chi tiết', hide: 'Ẩn', delete: 'Xóa', paid: 'Đã trả', notPaid: 'Chưa trả', fastServices: 'Dịch vụ nhanh', quickAddCar: '+ Thêm xe nhanh', closeQuickAdd: 'Đóng thêm nhanh', year: 'Năm', brandModel: 'Hãng / mẫu', licensePlate: 'Biển số', addAndSelect: 'Thêm & chọn', quickAdd: 'Thêm nhanh', logService: 'Ghi dịch vụ', edit: 'Sửa', remove: 'Gỡ', save: 'Lưu', cancel: 'Hủy', parts: 'Phụ tùng/Vật liệu', time: 'Thời gian (giờ)', people: 'Số người', customerFormula: 'Giá khách = phụ tùng/vật liệu + thời gian × người × đơn giá.' },
  es: { all: 'Todos', serviceRepair: 'Servicio/Reparación', notStarted: 'No iniciado', inProgress: 'En progreso', onHold: 'En espera', completed: 'Completado', addVehicle: '+ Agregar vehículo', closeForm: 'Cerrar formulario', vehicleBoard: 'Lista de vehículos', showing: 'mostrando', servicesLogged: 'servicios registrados', no: 'No', vehicle: 'Vehículo', plate: 'Placa', status: 'Estado', services: 'Servicios', payment: 'Pago', notes: 'Notas', actions: 'Acciones', details: 'Detalles', hide: 'Ocultar', delete: 'Eliminar', paid: 'Pagado', notPaid: 'No pagado', fastServices: 'Servicios rápidos', quickAddCar: '+ Agregar auto rápido', closeQuickAdd: 'Cerrar rápido', year: 'Año', brandModel: 'Marca / modelo', licensePlate: 'Placa', addAndSelect: 'Agregar y elegir', quickAdd: 'Agregar rápido', logService: 'Registrar servicio', edit: 'Editar', remove: 'Quitar', save: 'Guardar', cancel: 'Cancelar', parts: 'Partes/Materiales', time: 'Tiempo (hrs)', people: '# Personas', customerFormula: 'Precio = partes/materiales + tiempo × personas × tarifa.' },
  fr: { all: 'Tous', serviceRepair: 'Service/Réparation', notStarted: 'Non commencé', inProgress: 'En cours', onHold: 'En attente', completed: 'Terminé', addVehicle: '+ Ajouter véhicule', closeForm: 'Fermer', vehicleBoard: 'Liste véhicules', showing: 'affichés', servicesLogged: 'services', no: 'No', vehicle: 'Véhicule', plate: 'Plaque', status: 'Statut', services: 'Services', payment: 'Paiement', notes: 'Notes', actions: 'Actions', details: 'Détails', hide: 'Masquer', delete: 'Supprimer', paid: 'Payé', notPaid: 'Non payé', fastServices: 'Services rapides', quickAddCar: '+ Ajout rapide', closeQuickAdd: 'Fermer', year: 'Année', brandModel: 'Marque / modèle', licensePlate: 'Plaque', addAndSelect: 'Ajouter et choisir', quickAdd: 'Ajout rapide', logService: 'Enregistrer', edit: 'Modifier', remove: 'Retirer', save: 'Sauver', cancel: 'Annuler', parts: 'Pièces/Matériel', time: 'Temps (h)', people: '# Pers.', customerFormula: 'Prix = pièces/matériel + temps × personnes × tarif.' },
  ar: { all: 'الكل', serviceRepair: 'خدمة/إصلاح', notStarted: 'لم يبدأ', inProgress: 'قيد العمل', onHold: 'معلق', completed: 'مكتمل', addVehicle: '+ إضافة سيارة', closeForm: 'إغلاق النموذج', vehicleBoard: 'قائمة السيارات', showing: 'معروض', servicesLogged: 'خدمات مسجلة', no: 'رقم', vehicle: 'السيارة', plate: 'اللوحة', status: 'الحالة', services: 'الخدمات', payment: 'الدفع', notes: 'ملاحظات', actions: 'إجراءات', details: 'تفاصيل', hide: 'إخفاء', delete: 'حذف', paid: 'مدفوع', notPaid: 'غير مدفوع', fastServices: 'خدمات سريعة', quickAddCar: '+ إضافة سريعة', closeQuickAdd: 'إغلاق', year: 'السنة', brandModel: 'الشركة / الموديل', licensePlate: 'رقم اللوحة', addAndSelect: 'أضف واختر', quickAdd: 'إضافة سريعة', logService: 'تسجيل خدمة', edit: 'تعديل', remove: 'إزالة', save: 'حفظ', cancel: 'إلغاء', parts: 'قطع/مواد', time: 'الوقت (ساعة)', people: 'عدد الأشخاص', customerFormula: 'السعر = القطع/المواد + الوقت × الأشخاص × السعر.' },
  ko: { all: '전체', serviceRepair: '서비스/수리', notStarted: '시작 전', inProgress: '진행 중', onHold: '보류', completed: '완료', addVehicle: '+ 차량 추가', closeForm: '양식 닫기', vehicleBoard: '차량 목록', showing: '표시', servicesLogged: '서비스 기록', no: '번호', vehicle: '차량', plate: '번호판', status: '상태', services: '서비스', payment: '결제', notes: '메모', actions: '작업', details: '상세', hide: '숨기기', delete: '삭제', paid: '결제됨', notPaid: '미결제', fastServices: '빠른 서비스', quickAddCar: '+ 빠른 차량 추가', closeQuickAdd: '닫기', year: '연식', brandModel: '브랜드 / 모델', licensePlate: '번호판', addAndSelect: '추가 및 선택', quickAdd: '빠른 추가', logService: '서비스 기록', edit: '수정', remove: '제거', save: '저장', cancel: '취소', parts: '부품/자재', time: '시간', people: '인원', customerFormula: '가격 = 부품/자재 + 시간 × 인원 × 요율.' },
  tl: { all: 'Lahat', serviceRepair: 'Serbisyo/Ayos', notStarted: 'Hindi pa simula', inProgress: 'Ginagawa', onHold: 'Naka-hold', completed: 'Tapos', addVehicle: '+ Dagdag sasakyan', closeForm: 'Isara form', vehicleBoard: 'Listahan ng sasakyan', showing: 'nakikita', servicesLogged: 'serbisyo', no: 'No', vehicle: 'Sasakyan', plate: 'Plaka', status: 'Status', services: 'Serbisyo', payment: 'Bayad', notes: 'Notes', actions: 'Aksyon', details: 'Detalye', hide: 'Itago', delete: 'Burahin', paid: 'Bayad', notPaid: 'Hindi bayad', fastServices: 'Mabilis na serbisyo', quickAddCar: '+ Quick add car', closeQuickAdd: 'Isara', year: 'Taon', brandModel: 'Brand / modelo', licensePlate: 'Plaka', addAndSelect: 'Dagdag at piliin', quickAdd: 'Quick add', logService: 'Log serbisyo', edit: 'Edit', remove: 'Tanggalin', save: 'Save', cancel: 'Cancel', parts: 'Parts/Materyales', time: 'Oras', people: '# Tao', customerFormula: 'Presyo = parts/materyales + oras × tao × rate.' },
  hi: { all: 'सभी', serviceRepair: 'सेवा/मरम्मत', notStarted: 'शुरू नहीं', inProgress: 'चल रहा है', onHold: 'रुका हुआ', completed: 'पूरा', addVehicle: '+ वाहन जोड़ें', closeForm: 'फॉर्म बंद', vehicleBoard: 'वाहन सूची', showing: 'दिख रहा', servicesLogged: 'सेवा रिकॉर्ड', no: 'नं', vehicle: 'वाहन', plate: 'प्लेट', status: 'स्थिति', services: 'सेवा', payment: 'भुगतान', notes: 'नोट', actions: 'कार्य', details: 'विवरण', hide: 'छुपाएं', delete: 'हटाएं', paid: 'भुगतान', notPaid: 'बकाया', fastServices: 'त्वरित सेवा', quickAddCar: '+ तुरंत वाहन जोड़ें', closeQuickAdd: 'बंद', year: 'वर्ष', brandModel: 'ब्रांड / मॉडल', licensePlate: 'लाइसेंस प्लेट', addAndSelect: 'जोड़ें और चुनें', quickAdd: 'त्वरित जोड़ें', logService: 'सेवा दर्ज करें', edit: 'संपादित', remove: 'हटाएं', save: 'सेव', cancel: 'रद्द', parts: 'पार्ट्स/सामग्री', time: 'समय (घंटे)', people: '# लोग', customerFormula: 'कीमत = पार्ट्स/सामग्री + समय × लोग × दर।' },
} as const

type Translation = Record<keyof typeof translations.en, string>
const TranslationContext = createContext<Translation>(translations.en)

const LABOR_RATE = 150
const STANDARD_SERVICE_RATE = 50

const servicePresets = [
  { value: 'Custom Service/Repair', label: 'Custom Service/Repair', partsCost: 0, laborHours: 1, laborPeople: 1, laborRate: LABOR_RATE, note: 'General repair. Customer price = parts/material cost + time × people × $150.' },
  { value: 'Full Synthetic Oil Change', label: 'Full Synthetic Oil Change', partsCost: 40, laborHours: 0.5, laborPeople: 1, laborRate: STANDARD_SERVICE_RATE, note: 'Oil/material cost is editable for larger vehicles. Standard service labor is $50/hr/person.' },
  { value: 'Full Synthetic Oil + Filter', label: 'Full Synthetic Oil + Filter', partsCost: 65, laborHours: 0.5, laborPeople: 1, laborRate: STANDARD_SERVICE_RATE, note: 'Oil/filter cost is editable for larger vans or extra oil. Standard service labor is $50/hr/person.' },
  { value: 'Coolant Top-Off', label: 'Coolant Top-Off', partsCost: 0, laborHours: 0.25, laborPeople: 1, laborRate: STANDARD_SERVICE_RATE, note: 'Enter coolant/material cost. Put amount used in the note. Standard service labor is $50/hr/person.' },
]

const futureModifications = [
  'AI license-plate assistant to make photo reading faster after the owner approves this manual workflow',
  'AI receipt scanner for parts/material invoices',
  'AI voice assistant for hands-free vehicle notes and service logging',
]

const NOTE_TEMPLATE = `CX Contact (Preferred Language: ):
CX Statement:
Technician Diagnosis:`

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function CameraModal({ type, onPhotoTaken, onClose }: {
  type: 'vin' | 'plate'
  onPhotoTaken: (photoDataUrl: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        })
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      } catch (err) {
        console.error('Camera error:', err)
        setError('Could not access camera. Please check permissions.')
      }
    }

    startCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  function finishCapture(dataUrl: string) {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    onPhotoTaken(dataUrl)
  }

  function capturePhoto() {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0)
      finishCapture(canvas.toDataURL('image/jpeg', 0.95))
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => finishCapture(String(reader.result || ''))
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  function handleClose() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="relative h-full w-full">
        {error ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="rounded-xl bg-white p-6 text-center">
              <p className="text-lg font-bold text-rose-600">{error}</p>
              <button
                onClick={handleClose}
                className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                  {type === 'vin' ? 'Capture VIN (Door Sticker)' : 'Capture License Plate'}
                </h2>
                <button
                  onClick={handleClose}
                  className="text-2xl font-bold text-white"
                >
                  ✕
                </button>
              </div>
              <p className="mt-2 text-sm text-white/90">
                {type === 'vin'
                  ? 'Center the VIN label or upload a clear door-sticker photo'
                  : 'Center the plate or upload a clear rear-plate photo'}
              </p>
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-white/40 bg-white/15 px-4 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/25"
                >
                  Upload photo
                </button>
                <button
                  onClick={capturePhoto}
                  className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white shadow-xl"
                >
                  <div className="h-12 w-12 rounded-full bg-slate-950" />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PhotoReviewModal({ photo, type, ocrResult, onOcrChange, processing, onConfirm, onRetake }: {
  photo: string
  type: 'vin' | 'plate'
  ocrResult: string
  onOcrChange: (value: string) => void
  processing: boolean
  onConfirm: () => void
  onRetake: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-bold text-slate-950">
            {type === 'vin' ? 'Review VIN' : 'Review License Plate'}
          </h2>
          <p className="text-sm text-slate-500">Check the text and edit if needed</p>
        </div>

        <div className="p-6">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <img src={photo} alt="Captured" className="w-full" />
          </div>

          <div className="mt-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {type === 'vin' ? 'VIN Number' : 'License Plate'}
              </span>
              {processing ? (
                <div className="mt-2 flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-8">
                  <div className="text-center">
                    <div className="text-2xl">🔍</div>
                    <p className="mt-2 text-sm font-semibold text-blue-700">Reading text from photo...</p>
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={ocrResult}
                  onChange={e => onOcrChange(e.target.value.toUpperCase())}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-mono text-lg font-bold uppercase tracking-wide outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder={type === 'vin' ? 'Edit VIN if needed' : 'Edit plate if needed'}
                  autoFocus
                />
              )}
            </label>

            {!processing && !ocrResult && (
              <p className="mt-2 text-sm text-amber-600">
                ⚠️ Could not detect text. Please type it in or retake the photo.
              </p>
            )}

            {!processing && type === 'vin' && ocrResult && ocrResult.length !== 17 && (
              <p className="mt-2 text-sm text-amber-600">
                ⚠️ VIN should be 17 characters. Please check and correct.
              </p>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onRetake}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              📷 Retake Photo
            </button>
            <button
              onClick={onConfirm}
              disabled={processing || !ocrResult.trim()}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              ✓ Use This {type === 'vin' ? 'VIN' : 'Plate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function emptyForm() {
  return {
    key_number: '',
    license_plate: '',
    car_model: '',
    vin: '',
    year: '',
    status: 'not-started' as ProgressStatus,
    initial_note_text: '',
    initial_note_tech: '',
  }
}

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function serviceTotal(service: ServiceLog) {
  const legacyUnitTotal = (Number(service.quantity) || 0) * (Number(service.unitPrice) || 0)
  const laborTotal = (Number(service.laborHours) || 0) * (Number(service.laborPeople) || 0) * (Number(service.laborRate || LABOR_RATE) || 0)
  return legacyUnitTotal + (Number(service.partsCost) || 0) + (Number(service.flatFee) || 0) + laborTotal
}

function vehicleServiceTotal(vehicle: Vehicle) {
  return (vehicle.services || []).reduce((total, service) => total + serviceTotal(service), 0)
}

function vehiclePaymentStatus(vehicle: Vehicle) {
  const services = vehicle.services || []
  if (services.length === 0) return 'not-paid'
  return services.every(service => service.paymentStatus === 'paid') ? 'paid' : 'not-paid'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [showForm, setShowForm] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [vinCheckResult, setVinCheckResult] = useState<VinLookupResult | null>(null)
  const [vinLookupLoading, setVinLookupLoading] = useState(false)
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [serviceVehicleId, setServiceVehicleId] = useState('')
  const [language, setLanguage] = useState<LanguageCode>('en')
  const [formData, setFormData] = useState(emptyForm())
  const [showHelp, setShowHelp] = useState(false)
  const [helpStep, setHelpStep] = useState(0)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraType, setCameraType] = useState<'vin' | 'plate' | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [plateScannerPhoto, setPlateScannerPhoto] = useState<string | null>(null)
  const [vinScannerPhoto, setVinScannerPhoto] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState('')
  const [processingOcr] = useState(false)
  const t: Translation = translations[language]

  useEffect(() => {
    loadVehicles()
  }, [])

  const filteredVehicles = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'services') return vehicles
    return vehicles.filter(vehicle => vehicle.status === activeTab)
  }, [vehicles, activeTab])

  const tabCounts = useMemo(() => ({
    all: vehicles.length,
    'not-started': vehicles.filter(vehicle => vehicle.status === 'not-started').length,
    'in-progress': vehicles.filter(vehicle => vehicle.status === 'in-progress').length,
    'on-hold': vehicles.filter(vehicle => vehicle.status === 'on-hold').length,
    done: vehicles.filter(vehicle => vehicle.status === 'done').length,
  }), [vehicles])

  const serviceTotalAll = useMemo(() => vehicles.reduce((total, vehicle) => total + vehicleServiceTotal(vehicle), 0), [vehicles])
  const serviceCountAll = useMemo(() => vehicles.reduce((total, vehicle) => total + (vehicle.services?.length || 0), 0), [vehicles])

  useEffect(() => {
    if (!serviceVehicleId && vehicles.length > 0) {
      setServiceVehicleId(vehicles[0].id)
    }
  }, [vehicles, serviceVehicleId])

  async function loadVehicles() {
    const { data } = await api.vehicles.getAll()
    setVehicles((data || []).map((vehicle: Vehicle) => ({ ...vehicle, services: vehicle.services || [] })))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSavingVehicle(true)

    const payload: any = {
      key_number: formData.key_number.trim(),
      license_plate: formData.license_plate.trim().toUpperCase(),
      car_model: formData.car_model.trim(),
      vin: formData.vin.trim().toUpperCase(),
      year: formData.year.trim(),
      status: formData.status,
    }

    if (formData.initial_note_text.trim()) {
      payload.initial_note = {
        text: formData.initial_note_text.trim(),
        technician: formData.initial_note_tech.trim() || 'Unknown',
      }
    }

    await api.vehicles.create(payload)
    setFormData(emptyForm())
    setVinCheckResult(null)
    setShowForm(false)
    await loadVehicles()
    setSavingVehicle(false)
  }

  async function handleVinCheck(vinOverride?: string) {
    const vin = (vinOverride || formData.vin).trim().toUpperCase()

    if (vin.length !== 17) {
      setVinCheckResult({ valid: false, error: 'VIN must be 17 characters' })
      return
    }

    setVinLookupLoading(true)
    const result = await api.vin.check(vin)
    setVinCheckResult(result)

    if (result.valid) {
      setFormData(prev => ({
        ...prev,
        vin: result.vin || vin,
        year: result.year || prev.year,
        car_model: result.car_model || prev.car_model,
      }))
    }

    setVinLookupLoading(false)
  }

  async function updateStatus(id: string, newStatus: ProgressStatus) {
    await api.vehicles.update(id, { status: newStatus })
    loadVehicles()
  }

  async function deleteVehicle(id: string) {
    if (confirm('Delete this vehicle from the tracker?')) {
      await api.vehicles.delete(id)
      if (expandedRow === id) setExpandedRow(null)
      loadVehicles()
    }
  }

  async function addNote(vehicleId: string, technician: string, noteText: string) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) return

    const newNote = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      technician,
      notes: noteText,
    }

    await api.vehicles.update(vehicleId, { notes: [...(vehicle.notes || []), newNote] })
    loadVehicles()
  }

  async function editNote(vehicleId: string, noteId: string, technician: string, noteText: string) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) return

    await api.vehicles.update(vehicleId, {
      notes: (vehicle.notes || []).map(note => note.id === noteId
        ? { ...note, technician, notes: noteText, editedAt: new Date().toISOString() }
        : note
      )
    })
    loadVehicles()
  }

  async function deleteNote(vehicleId: string, noteId: string, deletedBy: string) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) return

    await api.vehicles.update(vehicleId, {
      notes: (vehicle.notes || []).map(note => note.id === noteId
        ? {
            ...note,
            deleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy: deletedBy || 'Unknown',
            originalNotes: note.originalNotes || note.notes,
            notes: 'Note deleted'
          }
        : note
      )
    })
    loadVehicles()
  }

  async function addService(vehicleId: string, service: Omit<ServiceLog, 'id' | 'date'>) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) return

    const newService: ServiceLog = {
      ...service,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
    }

    await api.vehicles.update(vehicleId, { services: [...(vehicle.services || []), newService] })
    loadVehicles()
  }

  async function quickAddServiceVehicle(year: string, carModel: string, licensePlate: string) {
    const { data } = await api.vehicles.create({
      key_number: licensePlate.trim().toUpperCase() || 'SERVICE',
      license_plate: licensePlate.trim().toUpperCase(),
      car_model: carModel.trim(),
      vin: 'SERVICE-ONLY',
      year: year.trim(),
      status: 'not-started',
    })

    if (data?.id) {
      setServiceVehicleId(data.id)
    }

    await loadVehicles()
  }

  async function editService(vehicleId: string, serviceId: string, updates: Omit<ServiceLog, 'id' | 'date'>) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) return

    await api.vehicles.update(vehicleId, {
      services: (vehicle.services || []).map(service => service.id === serviceId
        ? { ...service, ...updates }
        : service
      )
    })
    loadVehicles()
  }

  async function deleteService(vehicleId: string, serviceId: string) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) return

    await api.vehicles.update(vehicleId, { services: (vehicle.services || []).filter(service => service.id !== serviceId) })
    loadVehicles()
  }

  function handleCameraCapture(type: 'vin' | 'plate') {
    setCameraType(type)
    setShowCamera(true)
  }

  async function handlePhotoTaken(photoDataUrl: string) {
    setShowCamera(false)

    if (cameraType === 'plate') {
      setPlateScannerPhoto(photoDataUrl)
      return
    }

    setVinScannerPhoto(photoDataUrl)
  }

  function handleConfirmPhoto() {
    if (ocrResult.trim()) {
      const finalValue = ocrResult.trim().toUpperCase()

      if (cameraType === 'vin') {
        setFormData(prev => ({ ...prev, vin: finalValue }))
        setCapturedPhoto(null)
        setOcrResult('')
        setCameraType(null)
        // Auto-trigger VIN check if it's 17 characters
        if (finalValue.length === 17) {
          setTimeout(() => handleVinCheck(finalValue), 100)
        }
      }
    }
  }

  function handlePlateScannerResult(value: string) {
    setFormData(prev => ({ ...prev, license_plate: value.trim().toUpperCase() }))
    setPlateScannerPhoto(null)
    setCameraType(null)
  }

  function handleVinScannerResult(value: string) {
    const finalValue = value.trim().toUpperCase()
    setFormData(prev => ({ ...prev, vin: finalValue }))
    setVinScannerPhoto(null)
    setCameraType(null)
    setVinCheckResult(null)
    if (finalValue.length === 17) {
      setTimeout(() => handleVinCheck(finalValue), 100)
    }
  }

  async function toggleServicePayment(vehicleId: string, serviceId: string, currentStatus: 'paid' | 'not-paid') {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) return

    const service = vehicle.services?.find(s => s.id === serviceId)
    if (!service) return

    const newStatus = currentStatus === 'paid' ? 'not-paid' : 'paid'

    await api.vehicles.update(vehicleId, {
      services: (vehicle.services || []).map(s => s.id === serviceId
        ? { ...s, paymentStatus: newStatus }
        : s
      )
    })
    loadVehicles()
  }

  const helpSteps = [
    {
      title: "Welcome to Auto Shop Tracker!",
      description: "This tutorial will guide you through using the app. Click 'Next' to continue or 'Skip' to exit.",
      icon: "👋"
    },
    {
      title: "Adding a Vehicle",
      description: "Click '+ Add Vehicle' button at the top. Enter the Key #, License Plate, and VIN. You can use the 📷 camera button to capture photos of the license plate and door sticker - the app will automatically extract the information!",
      icon: "🚗"
    },
    {
      title: "VIN Decoder",
      description: "After entering or capturing the VIN, click 'Decode' to automatically fill in the vehicle year and model using the official NHTSA database.",
      icon: "🔍"
    },
    {
      title: "Logging Services",
      description: "Click on the 'Service/Repair' tab to quickly log services. Select a vehicle, choose a preset service (Oil Change, etc.), adjust the price if needed, and click 'Log Service'.",
      icon: "🔧"
    },
    {
      title: "Payment Toggle",
      description: "In the services list, you'll see payment status badges. Click the 'Paid' or 'Not Paid' badge to instantly toggle payment status - no need to edit the entire service!",
      icon: "💰"
    },
    {
      title: "Viewing Details",
      description: "Click 'Details' on any vehicle to see full notes history and all logged services. You can add notes, edit services, and track everything in one place.",
      icon: "📋"
    },
    {
      title: "You're Ready!",
      description: "You now know the basics! Click the ? button anytime to see this tutorial again. Happy tracking!",
      icon: "✅"
    }
  ]

  return (
    <TranslationContext.Provider value={t}>
    <div className="min-h-screen bg-slate-100 text-slate-950">
      {showCamera && cameraType && (
        <CameraModal
          type={cameraType}
          onPhotoTaken={handlePhotoTaken}
          onClose={() => {
            setShowCamera(false)
            setCameraType(null)
          }}
        />
      )}

      {capturedPhoto && cameraType && (
        <PhotoReviewModal
          photo={capturedPhoto}
          type={cameraType}
          ocrResult={ocrResult}
          onOcrChange={setOcrResult}
          processing={processingOcr}
          onConfirm={handleConfirmPhoto}
          onRetake={() => {
            setCapturedPhoto(null)
            setOcrResult('')
            setShowCamera(true)
          }}
        />
      )}

      {plateScannerPhoto && cameraType === 'plate' && (
        <PlateScannerModal
          photo={plateScannerPhoto}
          onResult={handlePlateScannerResult}
          onRetake={() => {
            setPlateScannerPhoto(null)
            setShowCamera(true)
          }}
          onCancel={() => {
            setPlateScannerPhoto(null)
            setCameraType(null)
          }}
        />
      )}

      {vinScannerPhoto && cameraType === 'vin' && (
        <VinScannerModal
          photo={vinScannerPhoto}
          onResult={handleVinScannerResult}
          onRetake={() => {
            setVinScannerPhoto(null)
            setShowCamera(true)
          }}
          onCancel={() => {
            setVinScannerPhoto(null)
            setCameraType(null)
          }}
        />
      )}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-950">Help Tutorial</h2>
                <button
                  onClick={() => {
                    setShowHelp(false)
                    setHelpStep(0)
                  }}
                  className="text-2xl text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center">
                <div className="text-6xl">{helpSteps[helpStep].icon}</div>
                <h3 className="mt-4 text-2xl font-bold text-slate-950">{helpSteps[helpStep].title}</h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">{helpSteps[helpStep].description}</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex gap-1">
                  {helpSteps.map((_, i) => (
                    <div
                      key={i}
                      className={classNames(
                        'h-2 w-2 rounded-full',
                        i === helpStep ? 'bg-blue-500' : 'bg-slate-300'
                      )}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  {helpStep > 0 && (
                    <button
                      onClick={() => setHelpStep(helpStep - 1)}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>
                  )}
                  {helpStep < helpSteps.length - 1 ? (
                    <button
                      onClick={() => setHelpStep(helpStep + 1)}
                      className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setShowHelp(false)
                        setHelpStep(0)
                      }}
                      className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-300">Shop Operations</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Auto Shop Tracker</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHelp(true)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-xl font-bold text-white transition hover:bg-white/20"
                title="Help Tutorial"
              >
                ?
              </button>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as LanguageCode)}
                className="rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-xs font-bold text-white outline-none [&_option]:text-slate-950"
                aria-label="Language"
              >
                {languages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
              <div className="hidden rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold sm:block">
                {t.services}: {money(serviceTotalAll)}
              </div>
              <button
                onClick={() => setShowForm(prev => !prev)}
                className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-400"
              >
                {showForm ? t.closeForm : t.addVehicle}
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <Stat label="Total" value={vehicles.length.toString()} />
            <Stat label="Open" value={(tabCounts['not-started'] + tabCounts['in-progress'] + tabCounts['on-hold']).toString()} />
            <Stat label="Progress" value={tabCounts['in-progress'].toString()} />
            <Stat label="Done" value={tabCounts.done.toString()} />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-5">
        <details className="mb-3 rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-950 shadow-sm">
          <summary className="cursor-pointer font-bold">Future AI upgrades</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-blue-900">
            {futureModifications.map(item => <li key={item}>{item}</li>)}
          </ul>
        </details>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Vehicle Intake</h2>
                  <p className="text-xs text-slate-500">Decode VIN, then save plate, key, and first note.</p>
                </div>
                <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">NHTSA VIN decode</span>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-[1.3fr_1fr]">
              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <CompactInput label="Key #" value={formData.key_number} onChange={value => setFormData({ ...formData, key_number: value })} required placeholder="42" />
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">{t.licensePlate}</span>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        value={formData.license_plate}
                        onChange={e => setFormData({ ...formData, license_plate: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase font-semibold tracking-wide outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="ABC1234"
                      />
                      <button
                        type="button"
                        onClick={() => handleCameraCapture('plate')}
                        className="min-w-12 rounded-lg bg-blue-500 px-3 py-2 text-lg transition hover:bg-blue-400"
                        title="Capture license plate photo"
                      >
                        📷
                      </button>
                    </div>
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">VIN</span>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      required
                      maxLength={17}
                      value={formData.vin}
                      onChange={e => {
                        setFormData({ ...formData, vin: e.target.value.toUpperCase() })
                        setVinCheckResult(null)
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase tracking-wide outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="17-character VIN"
                    />
                    <button
                      type="button"
                      onClick={() => handleCameraCapture('vin')}
                      className="min-w-12 rounded-lg bg-blue-500 px-3 py-2 text-lg transition hover:bg-blue-400"
                      title="Capture door sticker photo"
                    >
                      📷
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVinCheck()}
                      disabled={vinLookupLoading || formData.vin.trim().length !== 17}
                      className="min-w-28 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {vinLookupLoading ? 'Decoding…' : 'Decode'}
                    </button>
                  </div>
                </label>

                {vinCheckResult && (
                  <div className={classNames(
                    'rounded-xl border px-3 py-2 text-xs',
                    vinCheckResult.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'
                  )}>
                    {vinCheckResult.valid
                      ? <span className="font-semibold">VIN decoded: {[vinCheckResult.year, vinCheckResult.make, vinCheckResult.model, vinCheckResult.trim].filter(Boolean).join(' ') || 'Vehicle details found'}</span>
                      : <span className="font-semibold">{vinCheckResult.error || 'VIN could not be decoded'}</span>}
                  </div>
                )}

                <div className="grid grid-cols-[1fr_110px] gap-3">
                  <CompactInput label="Vehicle" value={formData.car_model} onChange={value => setFormData({ ...formData, car_model: value })} placeholder="2022 Honda Accord EX" />
                  <CompactInput label="Year" value={formData.year} onChange={value => setFormData({ ...formData, year: value })} required placeholder="2018" />
                </div>
              </section>

              <section className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Starting Status</span>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as ProgressStatus })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="not-started">{t.notStarted}</option>
                    <option value="in-progress">{t.inProgress}</option>
                    <option value="on-hold">{t.onHold}</option>
                    <option value="done">{t.completed}</option>
                  </select>
                </label>

                <CompactInput label="Technician" value={formData.initial_note_tech} onChange={value => setFormData({ ...formData, initial_note_tech: value })} placeholder="Optional" />

                <label className="block">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-700">Initial Note</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, initial_note_text: NOTE_TEMPLATE })}
                      className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100"
                    >
                      Paste Format
                    </button>
                  </span>
                  <textarea
                    value={formData.initial_note_text}
                    onChange={e => setFormData({ ...formData, initial_note_text: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder={NOTE_TEMPLATE}
                    rows={4}
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingVehicle}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {savingVehicle ? 'Saving…' : 'Save Vehicle'}
                </button>
              </section>
            </div>
          </form>
        )}

        <div className="mb-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <div className="flex min-w-max gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={classNames(
                  'rounded-lg px-3 py-1.5 text-xs font-bold transition',
                  activeTab === tab.key ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                )}
              >
                {t[tab.labelKey]} <span className="ml-1 opacity-75">{tab.key === 'services' ? serviceCountAll : tabCounts[tab.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'services' ? (
          <FastServicesView
            vehicles={vehicles}
            selectedVehicleId={serviceVehicleId}
            setSelectedVehicleId={setServiceVehicleId}
            quickAddServiceVehicle={quickAddServiceVehicle}
            addService={addService}
            editService={editService}
            deleteService={deleteService}
            toggleServicePayment={toggleServicePayment}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <div>
                <h2 className="text-base font-bold text-slate-950">{t.vehicleBoard}</h2>
                <p className="text-xs text-slate-500">{filteredVehicles.length} showing · {money(serviceTotalAll)} services logged</p>
              </div>
            </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-left">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t.no}</th>
                  <th className="px-3 py-2">{t.vehicle}</th>
                  <th className="px-3 py-2">{t.plate}</th>
                  <th className="px-3 py-2">{t.status}</th>
                  <th className="px-3 py-2">{t.services}</th>
                  <th className="px-3 py-2">{t.payment}</th>
                  <th className="px-3 py-2">{t.notes}</th>
                  <th className="px-3 py-2 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVehicles.map(vehicle => (
                  <Fragment key={vehicle.id}>
                    <tr className="transition hover:bg-slate-50/80">
                      <td className="px-3 py-2 align-middle">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white">{vehicle.system_number}</div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <p className="max-w-md truncate text-sm font-bold text-slate-950">{vehicle.car_model || 'Vehicle details needed'}</p>
                        <p className="text-xs text-slate-500">Key #{vehicle.key_number} · {vehicle.year || 'Year unknown'}</p>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-800">{vehicle.license_plate || '—'}</span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <select
                          value={vehicle.status}
                          onChange={e => updateStatus(vehicle.id, e.target.value as ProgressStatus)}
                          className={classNames('rounded-lg border px-2 py-1.5 text-xs font-bold outline-none transition focus:ring-2 focus:ring-blue-100', statusMeta[vehicle.status].select)}
                        >
                          <option value="not-started">Not Started</option>
                          <option value="in-progress">In Progress</option>
                          <option value="on-hold">On Hold</option>
                          <option value="done">Completed</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <p className="text-sm font-bold text-slate-950">{money(vehicleServiceTotal(vehicle))}</p>
                        <p className="text-[11px] text-slate-500">{vehicle.services?.length || 0} item{(vehicle.services?.length || 0) === 1 ? '' : 's'}</p>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className={classNames(
                          'rounded-full px-2 py-1 text-[11px] font-bold ring-1',
                          vehiclePaymentStatus(vehicle) === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
                        )}>
                          {vehiclePaymentStatus(vehicle) === 'paid' ? t.paid : t.notPaid}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle text-xs text-slate-600">{vehicle.notes?.length || 0} notes</td>
                      <td className="px-3 py-2 text-right align-middle">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setExpandedRow(expandedRow === vehicle.id ? null : vehicle.id)}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            {expandedRow === vehicle.id ? t.hide : t.details}
                          </button>
                          <button
                            onClick={() => deleteVehicle(vehicle.id)}
                            className="rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === vehicle.id && <DetailsRow vehicle={vehicle} addNote={addNote} editNote={editNote} deleteNote={deleteNote} addService={addService} editService={editService} deleteService={deleteService} toggleServicePayment={toggleServicePayment} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 lg:hidden">
            {filteredVehicles.map(vehicle => (
              <div key={vehicle.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[11px] font-bold text-white">{vehicle.system_number}</span>
                      <span className={classNames('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ring-1', statusMeta[vehicle.status].pill)}>
                        <span className={classNames('h-1.5 w-1.5 rounded-full', statusMeta[vehicle.status].dot)} />
                        {statusMeta[vehicle.status].label}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-sm font-bold text-slate-950">{vehicle.car_model || 'Vehicle details needed'}</h3>
                    <p className="text-xs text-slate-500">Key #{vehicle.key_number} · {vehicle.license_plate || 'No plate'} · {money(vehicleServiceTotal(vehicle))} · {vehiclePaymentStatus(vehicle) === 'paid' ? t.paid : t.notPaid}</p>
                  </div>
                  <button
                    onClick={() => deleteVehicle(vehicle.id)}
                    className="rounded-lg border border-rose-200 px-2 py-1.5 text-[11px] font-bold text-rose-700"
                  >
                    Delete
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-[1fr_130px] gap-2">
                  <button
                    onClick={() => setExpandedRow(expandedRow === vehicle.id ? null : vehicle.id)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                  >
                    {expandedRow === vehicle.id ? 'Hide Details' : `Details (${vehicle.notes?.length || 0} notes, ${vehicle.services?.length || 0} services)`}
                  </button>
                  <select
                    value={vehicle.status}
                    onChange={e => updateStatus(vehicle.id, e.target.value as ProgressStatus)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold"
                  >
                    <option value="not-started">{t.notStarted}</option>
                    <option value="in-progress">{t.inProgress}</option>
                    <option value="on-hold">{t.onHold}</option>
                    <option value="done">{t.completed}</option>
                  </select>
                </div>

                {expandedRow === vehicle.id && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <DetailsPanel vehicle={vehicle} addNote={addNote} editNote={editNote} deleteNote={deleteNote} addService={addService} editService={editService} deleteService={deleteService} toggleServicePayment={toggleServicePayment} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredVehicles.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">🚗</div>
              <h3 className="mt-3 text-base font-bold text-slate-950">No vehicles here yet</h3>
              <p className="mt-1 text-sm text-slate-500">{vehicles.length === 0 ? 'Add your first vehicle to start tracking shop progress.' : `No vehicles are marked ${activeTab === 'all' ? 'All' : statusMeta[activeTab].label}.`}</p>
            </div>
          )}
        </div>
        )}
      </main>
    </div>
    </TranslationContext.Provider>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/10 px-2 py-2 backdrop-blur">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-300">{label}</p>
      <p className="text-lg font-bold leading-5">{value}</p>
    </div>
  )
}

function CompactInput({ label, value, onChange, placeholder, required, className }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; className?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        type="text"
        required={required}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={classNames('mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100', className)}
        placeholder={placeholder}
      />
    </label>
  )
}

function FastServicesView({ vehicles, selectedVehicleId, setSelectedVehicleId, quickAddServiceVehicle, addService, editService, deleteService, toggleServicePayment }: {
  vehicles: Vehicle[]
  selectedVehicleId: string
  setSelectedVehicleId: (id: string) => void
  quickAddServiceVehicle: (year: string, carModel: string, licensePlate: string) => Promise<void>
  addService: (vehicleId: string, service: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  editService: (vehicleId: string, serviceId: string, updates: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  deleteService: (vehicleId: string, serviceId: string) => Promise<void>
  toggleServicePayment: (vehicleId: string, serviceId: string, currentStatus: 'paid' | 'not-paid') => Promise<void>
}) {
  const selectedVehicle = vehicles.find(vehicle => vehicle.id === selectedVehicleId) || vehicles[0]

  if (!selectedVehicle) {
    return (
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <QuickAddServiceVehicleForm quickAddServiceVehicle={quickAddServiceVehicle} />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-200/70">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">🧾</div>
          <h2 className="mt-3 text-base font-bold text-slate-950">Quick add a service vehicle</h2>
          <p className="mt-1 text-sm text-slate-500">Add year, brand/model, and license plate, then log the service immediately.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-bold text-slate-950">Fast Services</h2>
          <p className="text-xs text-slate-500">Pick vehicle, tap preset, adjust price, save.</p>
        </div>
        <div className="border-b border-slate-200 p-3">
          <QuickAddServiceVehicleForm quickAddServiceVehicle={quickAddServiceVehicle} />
        </div>
        <div className="max-h-[54vh] divide-y divide-slate-100 overflow-auto">
          {vehicles.map(vehicle => (
            <button
              key={vehicle.id}
              onClick={() => setSelectedVehicleId(vehicle.id)}
              className={classNames(
                'w-full px-3 py-2 text-left transition hover:bg-slate-50',
                selectedVehicle.id === vehicle.id && 'bg-blue-50 ring-1 ring-inset ring-blue-200'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">#{vehicle.system_number} · {vehicle.car_model || 'Vehicle details needed'}</p>
                  <p className="text-xs text-slate-500">Key {vehicle.key_number} · {vehicle.license_plate || 'No plate'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold text-slate-950">{money(vehicleServiceTotal(vehicle))}</p>
                  <p className="text-[11px] text-slate-400">{vehicle.services?.length || 0} svc</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/70">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">#{selectedVehicle.system_number} · {selectedVehicle.car_model || 'Vehicle details needed'}</h2>
              <p className="text-sm text-slate-500">Key {selectedVehicle.key_number} · Plate {selectedVehicle.license_plate || '—'} · {selectedVehicle.year || 'Year unknown'}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-2 text-right ring-1 ring-emerald-200">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Service Total</p>
              <p className="text-xl font-bold text-emerald-800">{money(vehicleServiceTotal(selectedVehicle))}</p>
            </div>
          </div>
        </div>

        <FastServiceForm vehicle={selectedVehicle} addService={addService} />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/70">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent Services</h3>
            <span className="text-sm font-bold text-slate-950">{selectedVehicle.services?.length || 0} logged</span>
          </div>
          <div className="space-y-2">
            {selectedVehicle.services?.length ? selectedVehicle.services.map(service => (
              <ServiceCard
                key={service.id}
                vehicleId={selectedVehicle.id}
                service={service}
                editService={editService}
                deleteService={deleteService}
                toggleServicePayment={toggleServicePayment}
              />
            )) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No services logged for this vehicle yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function QuickAddServiceVehicleForm({ quickAddServiceVehicle }: { quickAddServiceVehicle: (year: string, carModel: string, licensePlate: string) => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
      >
        {isOpen ? 'Close Quick Add' : '+ Quick Add Car'}
      </button>
      {isOpen && (
        <form
          onSubmit={async e => {
            e.preventDefault()
            const form = e.currentTarget
            const year = (form.elements.namedItem('year') as HTMLInputElement).value.trim()
            const carModel = (form.elements.namedItem('carModel') as HTMLInputElement).value.trim()
            const licensePlate = (form.elements.namedItem('licensePlate') as HTMLInputElement).value.trim()
            if (!year || !carModel || !licensePlate) return
            setSaving(true)
            await quickAddServiceVehicle(year, carModel, licensePlate)
            setSaving(false)
            setIsOpen(false)
            form.reset()
          }}
          className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <div className="grid grid-cols-[86px_1fr] gap-2">
            <input name="year" required placeholder="Year" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="carModel" required placeholder="Brand / model" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <input name="licensePlate" required placeholder="License plate" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold uppercase tracking-wide" />
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:bg-emerald-300">
            {saving ? 'Adding…' : 'Add & Select'}
          </button>
        </form>
      )}
    </div>
  )
}

function FastServiceForm({ vehicle, addService }: { vehicle: Vehicle; addService: (vehicleId: string, service: Omit<ServiceLog, 'id' | 'date'>) => Promise<void> }) {
  const [selectedType, setSelectedType] = useState(servicePresets[0].value)
  const preset = servicePresets.find(item => item.value === selectedType) || servicePresets[0]

  return (
    <form
      key={`${vehicle.id}-${selectedType}`}
      onSubmit={e => {
        e.preventDefault()
        const form = e.currentTarget
        const service: Omit<ServiceLog, 'id' | 'date'> = {
          type: selectedType,
          description: (form.elements.namedItem('description') as HTMLInputElement).value.trim() || selectedType,
          status: (form.elements.namedItem('status') as HTMLSelectElement).value as ServiceStatus,
          quantity: 0,
          unitPrice: 0,
          partsCost: Number((form.elements.namedItem('partsCost') as HTMLInputElement).value) || 0,
          flatFee: 0,
          laborHours: Number((form.elements.namedItem('laborHours') as HTMLInputElement).value) || 0,
          laborPeople: Number((form.elements.namedItem('laborPeople') as HTMLInputElement).value) || 0,
          laborRate: LABOR_RATE,
          paymentStatus: (form.elements.namedItem('paymentStatus') as HTMLSelectElement).value as 'paid' | 'not-paid',
          note: (form.elements.namedItem('note') as HTMLInputElement).value.trim(),
        }
        addService(vehicle.id, service)
        form.reset()
      }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/70"
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Quick Add</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {servicePresets.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => setSelectedType(item.value)}
                className={classNames(
                  'rounded-xl border px-3 py-3 text-xs font-bold transition',
                  selectedType === item.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                {item.label.replace('Full Synthetic ', '').replace('Custom ', '')}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-slate-950 p-3 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-300">Starting Price</p>
          <p className="mt-1 text-2xl font-bold">{money(preset.partsCost + (preset.laborHours * preset.laborPeople * preset.laborRate))}</p>
          <p className="mt-1 text-[11px] text-slate-300">Parts + time × people × $150</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_120px_110px_110px_130px]">
        <input name="description" defaultValue={preset.label} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Service/repair description" />
        <input name="partsCost" type="number" step="0.01" min="0" defaultValue={preset.partsCost} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Parts/material cost" />
        <input name="laborHours" type="number" step="0.25" min="0" defaultValue={preset.laborHours} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Time in hours" />
        <input name="laborPeople" type="number" step="1" min="1" defaultValue={preset.laborPeople} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Number of people" />
        <select name="status" defaultValue="completed" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="recommended">Recommended</option>
          <option value="approved">Approved</option>
          <option value="completed">Completed</option>
        </select>
        <select name="paymentStatus" defaultValue="not-paid" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="not-paid">Not Paid</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      <div className="mt-1 hidden grid-cols-[1fr_120px_110px_110px_130px] gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 lg:grid">
        <span>Description</span><span>Parts/Material</span><span>Time (hrs)</span><span># People</span><span>Status</span>
      </div>
      <input name="note" defaultValue={preset.note} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Optional note" />
      <button type="submit" className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700">Log Service for #{vehicle.system_number}</button>
    </form>
  )
}

function DetailsRow({ vehicle, addNote, editNote, deleteNote, addService, editService, deleteService, toggleServicePayment }: {
  vehicle: Vehicle
  addNote: (vehicleId: string, technician: string, noteText: string) => Promise<void>
  editNote: (vehicleId: string, noteId: string, technician: string, noteText: string) => Promise<void>
  deleteNote: (vehicleId: string, noteId: string, deletedBy: string) => Promise<void>
  addService: (vehicleId: string, service: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  editService: (vehicleId: string, serviceId: string, updates: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  deleteService: (vehicleId: string, serviceId: string) => Promise<void>
  toggleServicePayment: (vehicleId: string, serviceId: string, currentStatus: 'paid' | 'not-paid') => Promise<void>
}) {
  return (
    <tr>
      <td colSpan={8} className="bg-slate-50 px-4 py-4">
        <DetailsPanel vehicle={vehicle} addNote={addNote} editNote={editNote} deleteNote={deleteNote} addService={addService} editService={editService} deleteService={deleteService} toggleServicePayment={toggleServicePayment} />
      </td>
    </tr>
  )
}

function DetailsPanel({ vehicle, addNote, editNote, deleteNote, addService, editService, deleteService, toggleServicePayment }: {
  vehicle: Vehicle
  addNote: (vehicleId: string, technician: string, noteText: string) => Promise<void>
  editNote: (vehicleId: string, noteId: string, technician: string, noteText: string) => Promise<void>
  deleteNote: (vehicleId: string, noteId: string, deletedBy: string) => Promise<void>
  addService: (vehicleId: string, service: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  editService: (vehicleId: string, serviceId: string, updates: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  deleteService: (vehicleId: string, serviceId: string) => Promise<void>
  toggleServicePayment: (vehicleId: string, serviceId: string, currentStatus: 'paid' | 'not-paid') => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 md:grid-cols-3">
        <div><span className="font-bold text-slate-900">VIN:</span> <span className="font-mono">{vehicle.vin}</span></div>
        <div><span className="font-bold text-slate-900">Year:</span> {vehicle.year || '—'}</div>
        <div><span className="font-bold text-slate-900">Services Total:</span> {money(vehicleServiceTotal(vehicle))}</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <NotesPanel vehicle={vehicle} addNote={addNote} editNote={editNote} deleteNote={deleteNote} />
        <ServicesPanel vehicle={vehicle} addService={addService} editService={editService} deleteService={deleteService} toggleServicePayment={toggleServicePayment} />
      </div>
    </div>
  )
}

function NotesPanel({ vehicle, addNote, editNote, deleteNote }: {
  vehicle: Vehicle
  addNote: (vehicleId: string, technician: string, noteText: string) => Promise<void>
  editNote: (vehicleId: string, noteId: string, technician: string, noteText: string) => Promise<void>
  deleteNote: (vehicleId: string, noteId: string, deletedBy: string) => Promise<void>
}) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_280px] xl:grid-cols-1 2xl:grid-cols-[1fr_280px]">
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes History</h4>
        {vehicle.notes?.length ? vehicle.notes.map(note => note.deleted ? (
          <div key={note.id} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
            Note deleted{note.deletedAt ? ` (${formatDate(note.deletedAt)})` : ''}
          </div>
        ) : (
          <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {editingNoteId === note.id ? (
              <form
                onSubmit={e => {
                  e.preventDefault()
                  const form = e.currentTarget
                  const technician = (form.elements.namedItem('technician') as HTMLInputElement).value.trim()
                  const noteText = (form.elements.namedItem('note') as HTMLTextAreaElement).value.trim()
                  if (technician && noteText) {
                    editNote(vehicle.id, note.id, technician, noteText)
                    setEditingNoteId(null)
                  }
                }}
              >
                <input name="technician" defaultValue={note.technician} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
                <textarea name="note" defaultValue={note.notes} rows={4} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <div className="mt-2 flex gap-2">
                  <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Save Edit</button>
                  <button type="button" onClick={() => setEditingNoteId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-bold text-slate-900">{note.technician}</span>
                  <span className="text-[11px] font-medium text-slate-400">{formatDate(note.date)} at {formatTime(note.date)}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-5 text-slate-700">{note.notes}</p>
                {note.editedAt && <p className="mt-1 text-[11px] font-medium text-slate-400">Edited {formatDate(note.editedAt)} at {formatTime(note.editedAt)}</p>}
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setEditingNoteId(note.id)} className="rounded-lg border border-blue-200 px-2 py-1 text-[11px] font-bold text-blue-700">Edit</button>
                  <button
                    onClick={() => {
                      const deletedBy = prompt('Who is deleting this note?') || 'Unknown'
                      if (confirm('Delete this note? A deletion record will remain visible.')) {
                        deleteNote(vehicle.id, note.id, deletedBy)
                      }
                    }}
                    className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No notes yet.</div>
        )}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault()
          const form = e.currentTarget
          const technician = (form.elements.namedItem('technician') as HTMLInputElement).value.trim()
          const noteText = (form.elements.namedItem('note') as HTMLTextAreaElement).value.trim()
          if (technician && noteText) {
            addNote(vehicle.id, technician, noteText)
            form.reset()
          }
        }}
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-slate-950">Add Update</h4>
          <button
            type="button"
            onClick={e => {
              const form = e.currentTarget.form
              const note = form?.elements.namedItem('note') as HTMLTextAreaElement | null
              if (note) {
                note.value = NOTE_TEMPLATE
                note.focus()
              }
            }}
            className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100"
          >
            Paste Format
          </button>
        </div>
        <input name="technician" type="text" placeholder="Technician name" required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        <textarea name="note" placeholder={NOTE_TEMPLATE} required rows={4} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        <button type="submit" className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700">Add Note</button>
      </form>
    </div>
  )
}

function ServiceCard({ vehicleId, service, editService, deleteService, toggleServicePayment }: {
  vehicleId: string
  service: ServiceLog
  editService: (vehicleId: string, serviceId: string, updates: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  deleteService: (vehicleId: string, serviceId: string) => Promise<void>
  toggleServicePayment: (vehicleId: string, serviceId: string, currentStatus: 'paid' | 'not-paid') => Promise<void>
}) {
  const [isEditing, setIsEditing] = useState(false)

  if (isEditing) {
    return (
      <form
        onSubmit={e => {
          e.preventDefault()
          const form = e.currentTarget
          editService(vehicleId, service.id, {
            type: service.type,
            description: (form.elements.namedItem('description') as HTMLInputElement).value.trim() || service.type,
            status: (form.elements.namedItem('status') as HTMLSelectElement).value as ServiceStatus,
            quantity: 0,
            unitPrice: 0,
            partsCost: Number((form.elements.namedItem('partsCost') as HTMLInputElement).value) || 0,
            flatFee: Number(service.flatFee) || 0,
            laborHours: Number((form.elements.namedItem('laborHours') as HTMLInputElement).value) || 0,
            laborPeople: Number((form.elements.namedItem('laborPeople') as HTMLInputElement).value) || 0,
            laborRate: LABOR_RATE,
            paymentStatus: (form.elements.namedItem('paymentStatus') as HTMLSelectElement).value as 'paid' | 'not-paid',
            note: (form.elements.namedItem('note') as HTMLInputElement).value.trim(),
          })
          setIsEditing(false)
        }}
        className="rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-sm"
      >
        <input name="description" defaultValue={service.description || service.type} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input name="partsCost" type="number" step="0.01" min="0" defaultValue={service.partsCost} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Parts/material cost" />
          <input name="laborHours" type="number" step="0.25" min="0" defaultValue={service.laborHours || 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Time in hours" />
          <input name="laborPeople" type="number" step="1" min="1" defaultValue={service.laborPeople || 1} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Number of people" />
        </div>
        <select name="status" defaultValue={service.status} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="recommended">Recommended</option>
          <option value="approved">Approved</option>
          <option value="completed">Completed</option>
        </select>
        <select name="paymentStatus" defaultValue={service.paymentStatus || 'not-paid'} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="not-paid">Not Paid</option>
          <option value="paid">Paid</option>
        </select>
        <input name="note" defaultValue={service.note} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Optional note" />
        <div className="mt-2 flex gap-2">
          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Save Service</button>
          <button type="button" onClick={() => setIsEditing(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
        </div>
      </form>
    )
  }

  const paymentStatus = service.paymentStatus || 'not-paid'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-950">{service.description || service.type}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(service.date)} · {service.status}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-950">{money(serviceTotal(service))}</p>
          <button
            onClick={() => toggleServicePayment(vehicleId, service.id, paymentStatus)}
            className={classNames(
              'mt-1 rounded-full px-3 py-1 text-xs font-bold ring-1 transition',
              paymentStatus === 'paid'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100'
            )}
          >
            {paymentStatus === 'paid' ? '✓ Paid' : '✗ Not Paid'}
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
        <span>Parts/material {money(Number(service.partsCost) || 0)}</span>
        <span>Time {Number(service.laborHours) || 0} hr</span>
        <span>People {Number(service.laborPeople) || 0}</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Repair charge: {money((Number(service.laborHours) || 0) * (Number(service.laborPeople) || 0) * (Number(service.laborRate || LABOR_RATE) || 0) + (Number(service.flatFee) || 0))}</p>
      {service.note && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{service.note}</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={() => setIsEditing(true)} className="rounded-lg border border-blue-200 px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50">Edit</button>
        <button onClick={() => deleteService(vehicleId, service.id)} className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50">Remove</button>
      </div>
    </div>
  )
}

function ServicesPanel({ vehicle, addService, editService, deleteService, toggleServicePayment }: {
  vehicle: Vehicle
  addService: (vehicleId: string, service: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  editService: (vehicleId: string, serviceId: string, updates: Omit<ServiceLog, 'id' | 'date'>) => Promise<void>
  deleteService: (vehicleId: string, serviceId: string) => Promise<void>
  toggleServicePayment: (vehicleId: string, serviceId: string, currentStatus: 'paid' | 'not-paid') => Promise<void>
}) {
  const [selectedType, setSelectedType] = useState(servicePresets[0].value)
  const preset = servicePresets.find(item => item.value === selectedType) || servicePresets[0]

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_280px] xl:grid-cols-1 2xl:grid-cols-[1fr_280px]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Services</h4>
          <span className="text-sm font-bold text-slate-950">{money(vehicleServiceTotal(vehicle))}</span>
        </div>
        {vehicle.services?.length ? vehicle.services.map(service => (
          <ServiceCard
            key={service.id}
            vehicleId={vehicle.id}
            service={service}
            editService={editService}
            deleteService={deleteService}
            toggleServicePayment={toggleServicePayment}
          />
        )) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No services logged yet.</div>
        )}
      </div>

      <form
        key={selectedType}
        onSubmit={e => {
          e.preventDefault()
          const form = e.currentTarget
          const service: Omit<ServiceLog, 'id' | 'date'> = {
            type: selectedType,
            description: (form.elements.namedItem('description') as HTMLInputElement).value.trim() || selectedType,
            status: (form.elements.namedItem('status') as HTMLSelectElement).value as ServiceStatus,
            quantity: 0,
            unitPrice: 0,
            partsCost: Number((form.elements.namedItem('partsCost') as HTMLInputElement).value) || 0,
            flatFee: 0,
            laborHours: Number((form.elements.namedItem('laborHours') as HTMLInputElement).value) || 0,
            laborPeople: Number((form.elements.namedItem('laborPeople') as HTMLInputElement).value) || 0,
            laborRate: LABOR_RATE,
            paymentStatus: (form.elements.namedItem('paymentStatus') as HTMLSelectElement).value as 'paid' | 'not-paid',
            note: (form.elements.namedItem('note') as HTMLTextAreaElement).value.trim(),
          }
          addService(vehicle.id, service)
          form.reset()
        }}
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <h4 className="text-sm font-bold text-slate-950">Log Service/Repair</h4>
        <label className="mt-2 block">
          <span className="text-xs font-semibold text-slate-700">Preset</span>
          <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            {servicePresets.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <input name="description" defaultValue={preset.label} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Service/repair description" />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className="block"><span className="text-xs font-semibold text-slate-700">Parts/Material Cost</span><input name="partsCost" type="number" step="0.01" min="0" defaultValue={preset.partsCost} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Time (hrs)</span><input name="laborHours" type="number" step="0.25" min="0" defaultValue={preset.laborHours} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700"># People</span><input name="laborPeople" type="number" step="1" min="1" defaultValue={preset.laborPeople} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        </div>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500">
          Customer price = parts/material cost + time × people × $150. Adjust the time and people for larger jobs.
        </p>
        <label className="mt-2 block">
          <span className="text-xs font-semibold text-slate-700">Status</span>
          <select name="status" defaultValue="completed" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="recommended">Recommended</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
          </select>
          <select name="paymentStatus" defaultValue="not-paid" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="not-paid">Not Paid</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <textarea name="note" defaultValue={preset.note} rows={3} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Optional service note" />
        <button type="submit" className="mt-2 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700">Add Service</button>
      </form>
    </div>
  )
}

export default App
