import { useEffect, useState } from 'react'
import { getBalance, type BalanceResult } from '../lib/balance'
import type { HouseholdSession } from '../lib/household'

interface Props {
  session: HouseholdSession
  onDone: () => void
}

export function Balance({ session, onDone }: Props) {
  const [balance, setBalance] = useState<BalanceResult | null>(null)

  useEffect(() => {
    getBalance(session.householdId).then(setBalance)
  }, [session.householdId])

  if (!balance) {
    return (
      <div className="receipt-flow">
        <p>Calculando balance...</p>
      </div>
    )
  }

  return (
    <div className="receipt-flow">
      <button className="back-link" onClick={onDone}>
        ← Volver
      </button>
      <h2>Balance de gastos compartidos</h2>
      <p>Basado en recibos marcados como "Compartido 50/50".</p>

      <div className="receipt-summary-card">
        <div className="field-row">
          <label>Total compartido</label>
          <span>${balance.totalShared.toLocaleString('es-CO')}</span>
        </div>
        {balance.members.map((m) => (
          <div className="field-row" key={m.memberId}>
            <label>{m.displayName} pagó</label>
            <span>${m.totalPaidShared.toLocaleString('es-CO')}</span>
          </div>
        ))}
      </div>

      <div className="receipt-summary-card">
        {balance.owesFrom && balance.owesTo ? (
          <h3 style={{ textAlign: 'center' }}>
            {balance.owesFrom} le debe ${balance.netAmount.toLocaleString('es-CO')} a{' '}
            {balance.owesTo}
          </h3>
        ) : (
          <h3 style={{ textAlign: 'center' }}>Están a paz y salvo ✅</h3>
        )}
      </div>
    </div>
  )
}
