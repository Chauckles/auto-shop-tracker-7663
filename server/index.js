console.log("--- SERVER RESTARTED ---");
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = parseInt(process.env.PORT || '3001', 10)

// Initialize SQLite database
const db = new Database(path.join(__dirname, '../data/shop.db'))

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    system_number INTEGER NOT NULL,
    key_number TEXT NOT NULL,
    license_plate TEXT,
    car_model TEXT,
    vin TEXT NOT NULL,
    year TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('not-started', 'in-progress', 'on-hold', 'done')),
    notes TEXT DEFAULT '[]',
    services TEXT DEFAULT '[]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Seed mock data if empty
const vehicleCount = db.prepare('SELECT COUNT(*) as count FROM vehicles').get()
if (vehicleCount.count === 0) {
  console.log('Seeding mock data...')
  const mockVehicles = [
    { id: crypto.randomUUID(), system_number: 1, key_number: 'A1', license_plate: 'ABC-123', car_model: '2022 Honda Accord', vin: '1HGCR2F57NA000001', year: '2022', status: 'not-started' },
    { id: crypto.randomUUID(), system_number: 2, key_number: 'B4', license_plate: 'XYZ-789', car_model: '2020 Ford F-150', vin: '1FTFW1E50LK000002', year: '2020', status: 'in-progress' },
    { id: crypto.randomUUID(), system_number: 3, key_number: 'C9', license_plate: 'DEF-456', car_model: '2023 Toyota Camry', vin: '4T1B11HK4PU000003', year: '2023', status: 'done' }
  ]
  const stmt = db.prepare(`
    INSERT INTO vehicles (id, system_number, key_number, license_plate, car_model, vin, year, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const v of mockVehicles) {
    stmt.run(v.id, v.system_number, v.key_number, v.license_plate, v.car_model, v.vin, v.year, v.status, '[]')
  }
}

// Add new columns if they don't exist (migration for existing databases)
try {
  db.exec(`ALTER TABLE vehicles ADD COLUMN license_plate TEXT`)
} catch (e) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE vehicles ADD COLUMN car_model TEXT`)
} catch (e) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE vehicles ADD COLUMN services TEXT DEFAULT '[]'`)
} catch (e) { /* column already exists */ }

app.use(cors())
app.use(express.json())

// API Routes
app.get('/api/vehicles', (req, res) => {
  try {
    const vehicles = db.prepare('SELECT * FROM vehicles ORDER BY created_at DESC').all()
    // Parse notes JSON for each vehicle
    const parsed = vehicles.map(v => ({
      ...v,
      notes: JSON.parse(v.notes || '[]'),
      services: JSON.parse(v.services || '[]')
    }))
    res.json(parsed)
  } catch (error) {
    console.error('Error fetching vehicles:', error)
    res.status(500).json({ error: 'Failed to fetch vehicles' })
  }
})

app.post('/api/vehicles', (req, res) => {
  try {
    const { key_number, license_plate, car_model, vin, year, status, initial_note } = req.body
    const id = crypto.randomUUID()

    // Auto-generate system_number (get max + 1)
    const maxNumResult = db.prepare('SELECT MAX(system_number) as max FROM vehicles').get()
    const system_number = (maxNumResult.max || 0) + 1

    // Prepare notes array with initial note if provided
    const notes = initial_note ? JSON.stringify([{
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      technician: initial_note.technician || 'System',
      notes: initial_note.text
    }]) : '[]'

    const stmt = db.prepare(`
      INSERT INTO vehicles (id, system_number, key_number, license_plate, car_model, vin, year, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, system_number, key_number, license_plate, car_model, vin, year, status, notes)

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id)
    res.json({
      ...vehicle,
      notes: JSON.parse(vehicle.notes || '[]'),
      services: JSON.parse(vehicle.services || '[]')
    })
  } catch (error) {
    console.error('Error creating vehicle:', error)
    res.status(500).json({ error: 'Failed to create vehicle' })
  }
})

app.patch('/api/vehicles/:id', (req, res) => {
  try {
    const { id } = req.params
    const { status, notes, services } = req.body

    if (status) {
      const stmt = db.prepare('UPDATE vehicles SET status = ? WHERE id = ?')
      stmt.run(status, id)
    }

    if (notes) {
      const stmt = db.prepare('UPDATE vehicles SET notes = ? WHERE id = ?')
      stmt.run(JSON.stringify(notes), id)
    }

    if (services) {
      const stmt = db.prepare('UPDATE vehicles SET services = ? WHERE id = ?')
      stmt.run(JSON.stringify(services), id)
    }

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id)
    res.json({
      ...vehicle,
      notes: JSON.parse(vehicle.notes || '[]'),
      services: JSON.parse(vehicle.services || '[]')
    })
  } catch (error) {
    console.error('Error updating vehicle:', error)
    res.status(500).json({ error: 'Failed to update vehicle' })
  }
})

app.delete('/api/vehicles/:id', (req, res) => {
  try {
    const { id } = req.params
    const stmt = db.prepare('DELETE FROM vehicles WHERE id = ?')
    stmt.run(id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting vehicle:', error)
    res.status(500).json({ error: 'Failed to delete vehicle' })
  }
})

function compactModelName(decoded) {
  const year = decoded.ModelYear && decoded.ModelYear !== '0' ? decoded.ModelYear : ''
  const make = decoded.Make || ''
  const model = decoded.Model || ''
  const trim = decoded.Trim || ''
  return [year, make, model, trim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

// VIN validation/decoder endpoint
app.post('/api/vin/check', async (req, res) => {
  try {
    const vinUpper = String(req.body?.vin || '').trim().toUpperCase()

    if (vinUpper.length !== 17) {
      return res.json({ valid: false, error: 'VIN must be exactly 17 characters' })
    }

    if (/[IOQ]/i.test(vinUpper)) {
      return res.json({ valid: false, error: 'VIN cannot contain I, O, or Q' })
    }

    const nhtsaUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vinUpper)}?format=json`
    const response = await fetch(nhtsaUrl)

    if (!response.ok) {
      throw new Error(`NHTSA decoder returned ${response.status}`)
    }

    const payload = await response.json()
    const decoded = payload?.Results?.[0] || {}
    const errorCode = decoded.ErrorCode || ''
    const errorText = decoded.ErrorText || ''
    const hasHardError = errorCode
      .split(',')
      .map(code => code.trim())
      .filter(Boolean)
      .some(code => !['0', '6', '7', '14'].includes(code))

    if (hasHardError) {
      return res.json({
        valid: false,
        vin: vinUpper,
        error: errorText || 'VIN could not be decoded'
      })
    }

    res.json({
      valid: true,
      vin: vinUpper,
      year: decoded.ModelYear && decoded.ModelYear !== '0' ? decoded.ModelYear : null,
      make: decoded.Make || null,
      model: decoded.Model || null,
      trim: decoded.Trim || null,
      bodyClass: decoded.BodyClass || null,
      vehicleType: decoded.VehicleType || null,
      car_model: compactModelName(decoded),
      warning: errorText && errorCode !== '0' ? errorText : null
    })
  } catch (error) {
    console.error('Error checking VIN:', error)
    res.status(500).json({ error: 'Failed to check VIN' })
  }
})

// Serve static files in production
const distPath = path.join(__dirname, '../dist')
console.log('Serving static files from:', distPath)
app.use(express.static(distPath))

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, '::', () => {
  console.log(`Server running on http://[::]:${port}`)
})
