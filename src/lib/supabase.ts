// API client for local database
const API_URL = '/api'

interface Vehicle {
  id: string
  system_number: number
  key_number: string
  license_plate: string
  car_model: string
  vin: string
  year: string
  status: string
  notes: any[]
  services: any[]
  created_at: string
}

export const api = {
  vehicles: {
    async getAll() {
      const res = await fetch(`${API_URL}/vehicles`)
      const data = await res.json()
      return { data, error: null }
    },

    async create(vehicle: any) {
      const res = await fetch(`${API_URL}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicle),
      })
      const data = await res.json()
      return { data, error: null }
    },

    async update(id: string, updates: Partial<Vehicle>) {
      const res = await fetch(`${API_URL}/vehicles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      return { data, error: null }
    },

    async delete(id: string) {
      const res = await fetch(`${API_URL}/vehicles/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      return { data, error: null }
    },
  },

  vin: {
    async check(vin: string) {
      const res = await fetch(`${API_URL}/vin/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vin }),
      })
      const data = await res.json()
      return data
    },
  },
}
