import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { setHouseholdSession } from '../lib/household'

interface Props {
  onEnter: () => void
}

export function HouseholdLogin({ onEnter }: Props) {
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data: household, error: householdError } = await supabase
      .from('households')
      .select('id, code')
      .eq('code', code.trim())
      .maybeSingle()

    if (householdError || !household) {
      setError('Código de hogar no encontrado. Verifica con tu pareja.')
      setLoading(false)
      return
    }

    const { data: member, error: memberError } = await supabase
      .from('household_members')
      .upsert(
        { household_id: household.id, display_name: displayName.trim() },
        { onConflict: 'household_id,display_name' }
      )
      .select('id, display_name')
      .single()

    if (memberError || !member) {
      setError('No se pudo registrar tu nombre. Intenta de nuevo.')
      setLoading(false)
      return
    }

    setHouseholdSession({
      householdId: household.id,
      code: household.code,
      memberId: member.id,
      displayName: member.display_name,
    })
    setLoading(false)
    onEnter()
  }

  return (
    <div className="household-login">
      <h1>Gringotshome</h1>
      <p>Ingresa el código de hogar compartido para entrar.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Código de hogar
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="gringots-8f2a"
            required
          />
        </label>
        <label>
          Tu nombre
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Sebastian o Dani"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
