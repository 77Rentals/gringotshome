import { useEffect, useState } from 'react'
import {
  getListItems,
  addListItem,
  toggleChecked,
  deleteListItem,
  getRepurchaseSuggestions,
  type ListItemRow,
  type RepurchaseSuggestion,
} from '../lib/shoppingList'
import { findCandidates } from '../lib/products'
import type { HouseholdSession } from '../lib/household'

interface Props {
  session: HouseholdSession
  onDone: () => void
  onCompare: () => void
}

function itemLabel(item: ListItemRow) {
  return item.product?.canonical_name ?? item.raw_name ?? 'Item'
}

function itemCategory(item: ListItemRow) {
  return item.product?.category ?? null
}

export function ShoppingList({ session, onDone, onCompare }: Props) {
  const [items, setItems] = useState<ListItemRow[]>([])
  const [suggestions, setSuggestions] = useState<RepurchaseSuggestion[]>([])
  const [newItemText, setNewItemText] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const [listItems, sugg] = await Promise.all([
      getListItems(session.householdId),
      getRepurchaseSuggestions(session.householdId).catch(() => []),
    ])
    setItems(listItems)
    setSuggestions(sugg)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd() {
    const text = newItemText.trim()
    if (!text) return
    // intenta emparejar con un producto ya conocido, para que la comparación de precios funcione
    const candidates = await findCandidates(session.householdId, text).catch(() => [])
    const best = candidates[0]
    await addListItem(session.householdId, session.memberId, {
      rawName: text,
      productId: best && best.similarity > 0.5 ? best.id : undefined,
    })
    setNewItemText('')
    refresh()
  }

  async function handleAddSuggestion(s: RepurchaseSuggestion) {
    await addListItem(session.householdId, session.memberId, {
      productId: s.productId,
      rawName: s.name,
      aiSuggested: true,
    })
    refresh()
  }

  async function handleToggle(item: ListItemRow) {
    await toggleChecked(item.id, !item.checked)
    refresh()
  }

  async function handleDelete(itemId: string) {
    await deleteListItem(itemId)
    refresh()
  }

  const pending = items.filter((i) => !i.checked)
  const checked = items.filter((i) => i.checked)

  const grouped = new Map<string, ListItemRow[]>()
  for (const item of pending) {
    const cat = itemCategory(item)
    const key = cat?.name ?? 'Sin categoría'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(item)
  }
  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const orderA = itemCategory(a[1][0])?.aisle_order ?? 999
    const orderB = itemCategory(b[1][0])?.aisle_order ?? 999
    return orderA - orderB
  })

  if (loading) {
    return (
      <div className="receipt-flow">
        <p>Cargando lista...</p>
      </div>
    )
  }

  return (
    <div className="receipt-flow">
      <button className="back-link" onClick={onDone}>
        ← Volver
      </button>
      <h2>Lista de mercado</h2>

      {suggestions.length > 0 && (
        <div className="receipt-summary-card">
          <h3>Se te puede estar acabando</h3>
          {suggestions.map((s) => (
            <div className="field-row" key={s.productId}>
              <label>
                {s.name} · hace {s.daysSinceLast}d (sueles recomprar cada {s.avgIntervalDays}d)
              </label>
              <button
                className="preview-actions cta"
                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white' }}
                onClick={() => handleAddSuggestion(s)}
              >
                + Agregar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="capture-choices" style={{ flexDirection: 'row', gap: 8 }}>
        <input
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-h)',
          }}
          placeholder="Agregar item..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="preview-actions cta" style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 600 }} onClick={handleAdd}>
          +
        </button>
      </div>

      {sortedGroups.map(([categoryName, groupItems]) => (
        <div key={categoryName}>
          <h3>{categoryName}</h3>
          <div className="items-list">
            {groupItems.map((item) => (
              <div className="item-row" key={item.id}>
                <div className="item-row-summary">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggle(item)}
                    />
                    <span className="item-name">
                      {item.quantity > 1 ? `${item.quantity}x ` : ''}
                      {itemLabel(item)}
                      {item.ai_suggested && ' 🤖'}
                    </span>
                  </label>
                  <button className="remove-item" onClick={() => handleDelete(item.id)}>
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {pending.length === 0 && <p>Tu lista está vacía. Agrega algo arriba.</p>}

      {checked.length > 0 && (
        <>
          <h3>Ya comprados</h3>
          <div className="items-list">
            {checked.map((item) => (
              <div className="item-row" key={item.id} style={{ opacity: 0.5 }}>
                <div className="item-row-summary">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <input type="checkbox" checked onChange={() => handleToggle(item)} />
                    <span className="item-name" style={{ textDecoration: 'line-through' }}>
                      {itemLabel(item)}
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sticky-save-bar">
        <button onClick={onCompare} disabled={pending.length === 0}>
          Comparar precios de la lista
        </button>
      </div>
    </div>
  )
}
