import { useEffect, useState } from 'react'
import { compareListPrices, type ComparisonResult } from '../lib/priceComparison'
import { getListItems } from '../lib/shoppingList'
import type { HouseholdSession } from '../lib/household'

interface Props {
  session: HouseholdSession
  onDone: () => void
}

export function PriceComparison({ session, onDone }: Props) {
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [unpriced, setUnpriced] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const listItems = await getListItems(session.householdId)
      const pending = listItems.filter((i) => !i.checked)
      const withProduct = pending.filter((i) => i.product_id)
      setUnpriced(
        pending.filter((i) => !i.product_id).map((i) => i.raw_name ?? 'Item')
      )
      const entries = withProduct.map((i) => ({
        productId: i.product_id as string,
        name: i.product?.canonical_name ?? 'Item',
        quantity: i.quantity,
      }))
      if (entries.length === 0) {
        setResult({ items: [], optimalSplitTotal: 0, splitByStore: [], singleStoreTotals: [] })
      } else {
        setResult(await compareListPrices(entries))
      }
      setLoading(false)
    }
    load()
  }, [session.householdId])

  if (loading || !result) {
    return (
      <div className="receipt-flow">
        <p>Calculando mejores precios...</p>
      </div>
    )
  }

  const itemsWithoutHistory = result.items.filter((i) => !i.cheapest)
  const itemsWithHistory = result.items.filter((i) => i.cheapest)

  return (
    <div className="receipt-flow">
      <button className="back-link" onClick={onDone}>
        ← Volver a la lista
      </button>
      <h2>Comparación de precios</h2>
      <p>Basado en tu historial de recibos (sin incluir domicilio).</p>

      {itemsWithHistory.length > 0 && (
        <div className="receipt-summary-card">
          <h3>División óptima: ${result.optimalSplitTotal.toLocaleString('es-CO')}</h3>
          {result.splitByStore.map((s) => (
            <div key={s.storeName}>
              <div className="field-row">
                <label style={{ fontWeight: 600, color: 'var(--text-h)' }}>{s.storeName}</label>
                <span>${s.subtotal.toLocaleString('es-CO')}</span>
              </div>
              <p style={{ fontSize: 12, marginBottom: 8 }}>{s.items.join(', ')}</p>
            </div>
          ))}
        </div>
      )}

      {result.singleStoreTotals.length > 0 && (
        <div className="receipt-summary-card">
          <h3>Si compras todo en una sola tienda</h3>
          {result.singleStoreTotals.map((s) => (
            <div className="field-row" key={s.storeId || s.storeName}>
              <label>
                {s.storeName}
                {s.itemsMissing.length > 0 && ` (falta precio de ${s.itemsMissing.length})`}
              </label>
              <span>${s.total.toLocaleString('es-CO')}</span>
            </div>
          ))}
        </div>
      )}

      {(itemsWithoutHistory.length > 0 || unpriced.length > 0) && (
        <div className="mismatch-warning">
          ⚠️ Sin historial de precio todavía: {[...itemsWithoutHistory.map((i) => i.name), ...unpriced].join(', ')}
        </div>
      )}

      <div className="items-list">
        {itemsWithHistory.map((item) => (
          <div className="item-row" key={item.productId}>
            <div className="item-row-summary">
              <span className="item-name">{item.name}</span>
              <span className="paid-price">
                ${item.cheapest!.price.toLocaleString('es-CO')} en {item.cheapest!.storeName}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
