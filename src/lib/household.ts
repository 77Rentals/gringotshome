// Sesión simple de hogar: sin login formal, solo el código compartido
// guardado en localStorage tras validarlo contra la tabla `households`.

const STORAGE_KEY = 'gringots_household'

export interface HouseholdSession {
  householdId: string
  code: string
  memberId: string
  displayName: string
}

export function getHouseholdSession(): HouseholdSession | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as HouseholdSession
  } catch {
    return null
  }
}

export function setHouseholdSession(session: HouseholdSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearHouseholdSession() {
  localStorage.removeItem(STORAGE_KEY)
}
