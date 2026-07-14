import { useEffect, useState } from 'react'
import {
  findCandidates,
  createProduct,
  confirmItemMatch,
  recordPrice,
  getUnmatchedItems,
  type ProductCandidate,
  type ReceiptItemForMatching,
} from '../lib/products'

interface Props {
  receiptId: string
  householdId: string
  storeId: string | null
  channelId: string | null
  onDone: () => void
}

interface RowState {
  item: ReceiptItemForMatching
  candidates: ProductCandidate[]
  selectedProductId: string | null
  creatingNew: boolean
  newName: string
  resolved: boolean
}

export function MatchProducts({ receiptId, householdId, storeId, channelId, onDone }: Props) {
  const [rows, setRows] = useState<RowState[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const items = await getUnmatchedItems(receiptId)
      const built = await Promise.all(
        items.map(async (item) => {
          const candidates = await findCandidates(householdId, item.raw_text).catch(
            () => [] as ProductCandidate[]
          )
          const best = candidates[0]
          return {
            item,
            candidates,
            selectedProductId: best && best.similarity > 0.4 ? best.id : null,
            creatingNew: !best || best.similarity <= 0.4,
            newName: item.raw_text,
            resolved: false,
          } as RowState
        })
      )
      setRows(built)
    }
    load()
  }, [receiptId, householdId])

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  async function resolveRow(idx: number) {
    if (!rows) return
    const row = rows[idx]
    let productId: string

    if (row.creatingNew || !row.selectedProductId) {
      const created = await createProduct(householdId, row.newName)
      productId = created.id
    } else {
      productId = row.selectedProductId
    }

    await confirmItemMatch(row.item.id, productId, row.item.raw_text)
    await recordPrice(
      productId,
      storeId,
      channelId,
      row.item.list_price,
      row.item.paid_price,
      row.item.id
    )
    updateRow(idx, { resolved: true, selectedProductId: productId })
  }

  async function handleConfirmAll() {
    if (!rows) return
    setSaving(true)
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].resolved) {
        await resolveRow(i)
      }
    }
    setSaving(false)
    onDone()
  }

  if (!rows) {
    return (
      <div className="receipt-flow">
        <p>Buscando productos parecidos...</p>
      </div>
    )
  }

  return (
    <div className="receipt-flow">
      <h2>Emparejar productos</h2>
      <p>Confirma o crea cada producto para llevar el historial de precios.</p>

      <div className="items-list">
        {rows.map((row, idx) => (
          <div className="item-row" key={row.item.id}>
            <div className="item-row-summary">
              <span className="item-name">{row.item.raw_text}</span>
              <span className="paid-price">
                ${row.item.paid_price.toLocaleString('es-CO')}
              </span>
            </div>
            <div className="item-row-edit" style={{ marginTop: 8 }}>
              {row.candidates.length > 0 && !row.creatingNew && (
                <div className="edit-field" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <label>Producto sugerido</label>
                  <select
                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
                    value={row.selectedProductId ?? ''}
                    onChange={(e) => updateRow(idx, { selectedProductId: e.target.value })}
                  >
                    {row.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.canonical_name} ({Math.round(c.similarity * 100)}% similar)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="split-toggle">
                <button
                  className={!row.creatingNew ? 'active' : ''}
                  onClick={() => updateRow(idx, { creatingNew: false })}
                  disabled={row.candidates.length === 0}
                >
                  Usar existente
                </button>
                <button
                  className={row.creatingNew ? 'active' : ''}
                  onClick={() => updateRow(idx, { creatingNew: true })}
                >
                  Crear nuevo
                </button>
              </div>
              {row.creatingNew && (
                <div className="edit-field" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <label>Nombre del producto</label>
                  <input
                    style={{ width: '100%', textAlign: 'left' }}
                    value={row.newName}
                    onChange={(e) => updateRow(idx, { newName: e.target.value })}
                  />
                </div>
              )}
              {row.resolved && <span style={{ color: 'var(--accent)', fontSize: 13 }}>✅ Confirmado</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky-save-bar">
        <button onClick={handleConfirmAll} disabled={saving}>
          {saving ? 'Guardando...' : 'Confirmar todos'}
        </button>
      </div>
    </div>
  )
}
