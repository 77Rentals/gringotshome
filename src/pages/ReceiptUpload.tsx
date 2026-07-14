import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { extractReceipt, saveReceipt, type ExtractedItem } from '../lib/receipts'
import { MatchProducts } from './MatchProducts'
import type { HouseholdSession } from '../lib/household'
import type { Store, Channel } from '../types'

type Step =
  | 'capture'
  | 'preview'
  | 'extracting'
  | 'review'
  | 'error'
  | 'saving'
  | 'matching'
  | 'success'

interface EditableItem extends ExtractedItem {
  id: string
}

interface Props {
  session: HouseholdSession
  onDone: () => void
}

export function ReceiptUpload({ session, onDone }: Props) {
  const [step, setStep] = useState<Step>('capture')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [stores, setStores] = useState<Store[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const [storeId, setStoreId] = useState<string>('')
  const [channelId, setChannelId] = useState<string>('')
  const [purchaseDate, setPurchaseDate] = useState<string>('')
  const [totalAmount, setTotalAmount] = useState<string>('')
  const [deliveryFee, setDeliveryFee] = useState<string>('0')
  const [tipAmount, setTipAmount] = useState<string>('0')
  const [costSplit, setCostSplit] = useState<'shared' | 'mine_only'>('shared')
  const [items, setItems] = useState<EditableItem[]>([])
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [savedSummary, setSavedSummary] = useState<{ total: number; count: number } | null>(null)

  useEffect(() => {
    supabase.from('stores').select('*').order('name').then(({ data }) => setStores(data ?? []))
    supabase.from('channels').select('*').then(({ data }) => setChannels(data ?? []))
  }, [])

  function handleFileChosen(f: File) {
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setStep('preview')
  }

  async function handleExtract() {
    if (!file) return
    setStep('extracting')
    setErrorMsg(null)
    try {
      const extracted = await extractReceipt(file)
      const matchedStore = stores.find(
        (s) => s.name.toLowerCase() === (extracted.store ?? '').toLowerCase()
      )
      const matchedChannel = channels.find((c) => c.name === extracted.channel)
      setStoreId(matchedStore?.id ?? '')
      setChannelId(matchedChannel?.id ?? '')
      setPurchaseDate(extracted.purchase_date ?? '')
      setTotalAmount(extracted.total_amount != null ? String(extracted.total_amount) : '')
      setDeliveryFee(String(extracted.delivery_fee ?? 0))
      setTipAmount(String(extracted.tip_amount ?? 0))
      setItems(
        extracted.items.map((it, idx) => ({
          ...it,
          id: `${idx}-${it.raw_text}`,
        }))
      )
      setStep('review')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo leer el recibo.')
      setStep('error')
    }
  }

  function updateItem(id: string, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function addBlankItem() {
    const id = `manual-${Date.now()}`
    setItems((prev) => [
      ...prev,
      { id, raw_text: '', quantity: 1, list_price: null, paid_price: 0 },
    ])
    setExpandedItemId(id)
  }

  const itemsSum = items.reduce((sum, it) => sum + it.paid_price * it.quantity, 0)
  const total = totalAmount ? Number(totalAmount) : null
  const sumMismatch = total != null && Math.abs(itemsSum - total) > 100

  const [savedReceiptId, setSavedReceiptId] = useState<string | null>(null)

  async function handleSave() {
    setStep('saving')
    try {
      const receipt = await saveReceipt({
        householdId: session.householdId,
        uploadedBy: session.memberId,
        storeId: storeId || null,
        channelId: channelId || null,
        purchaseDate: purchaseDate || null,
        totalAmount: total,
        deliveryFee: Number(deliveryFee) || 0,
        tipAmount: Number(tipAmount) || 0,
        costSplit,
        items: items
          .filter((it) => it.raw_text.trim())
          .map(({ raw_text, quantity, list_price, paid_price }) => ({
            raw_text,
            quantity,
            list_price,
            paid_price,
          })),
      })
      setSavedSummary({ total: total ?? itemsSum, count: items.length })
      setSavedReceiptId(receipt.id)
      setStep('matching')
    } catch {
      setErrorMsg('No se pudo guardar el recibo. Intenta de nuevo.')
      setStep('error')
    }
  }

  if (step === 'capture') {
    return (
      <div className="receipt-flow">
        <button className="back-link" onClick={onDone}>
          ← Volver
        </button>
        <h2>Subir recibo</h2>
        <p>Toma una foto del recibo físico o sube un screenshot de Rappi/D1.</p>
        <div className="capture-choices">
          <label>
            📷 Tomar foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => e.target.files?.[0] && handleFileChosen(e.target.files[0])}
            />
          </label>
          <label>
            🖼️ Elegir de galería / screenshot
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleFileChosen(e.target.files[0])}
            />
          </label>
        </div>
      </div>
    )
  }

  if (step === 'preview' || step === 'extracting') {
    return (
      <div className="receipt-flow">
        <button className="back-link" onClick={() => setStep('capture')}>
          ← Elegir otra
        </button>
        <div className={`image-preview ${step === 'extracting' ? 'dimmed' : ''}`}>
          {previewUrl && <img src={previewUrl} alt="Recibo" />}
          {step === 'extracting' && (
            <div className="loading-overlay">Leyendo recibo con IA...</div>
          )}
        </div>
        {step === 'preview' && (
          <div className="preview-actions">
            <button onClick={() => setStep('capture')}>Elegir otra</button>
            <button className="cta" onClick={handleExtract}>
              Extraer datos
            </button>
          </div>
        )}
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="receipt-flow">
        <button className="back-link" onClick={onDone}>
          ← Volver
        </button>
        <div className="extraction-error">
          <p className="error">{errorMsg}</p>
          <div className="preview-actions">
            <button onClick={() => setStep('capture')}>Elegir otra foto</button>
            <button className="cta" onClick={handleExtract} disabled={!file}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'matching' && savedReceiptId) {
    return (
      <MatchProducts
        receiptId={savedReceiptId}
        householdId={session.householdId}
        storeId={storeId || null}
        channelId={channelId || null}
        onDone={() => setStep('success')}
      />
    )
  }

  if (step === 'success' && savedSummary) {
    return (
      <div className="save-success">
        <div className="check">✅</div>
        <h2>Recibo guardado</h2>
        <p>
          ${savedSummary.total.toLocaleString('es-CO')} · {savedSummary.count} items
        </p>
        <button className="primary-action" onClick={onDone}>
          Listo
        </button>
      </div>
    )
  }

  // review + saving
  return (
    <div className="receipt-flow">
      <button className="back-link" onClick={() => setStep('preview')}>
        ← Revisar foto
      </button>
      <h2>Confirma los datos</h2>

      <div className="receipt-summary-card">
        <div className="field-row">
          <label>Tienda</label>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Sin definir</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label>Canal</label>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">Sin definir</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label>Fecha</label>
          <input
            type="date"
            value={purchaseDate}
            className={!purchaseDate ? 'field-missing' : ''}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </div>
        <div className="field-row">
          <label>Total</label>
          <input
            type="number"
            value={totalAmount}
            className={!totalAmount ? 'field-missing' : ''}
            onChange={(e) => setTotalAmount(e.target.value)}
          />
        </div>
        <div className="field-row">
          <label>Domicilio</label>
          <input
            type="number"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(e.target.value)}
          />
        </div>
        <div className="field-row">
          <label>Propina</label>
          <input type="number" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} />
        </div>

        <div className="split-toggle">
          <button
            className={costSplit === 'shared' ? 'active' : ''}
            onClick={() => setCostSplit('shared')}
          >
            Compartido 50/50
          </button>
          <button
            className={costSplit === 'mine_only' ? 'active' : ''}
            onClick={() => setCostSplit('mine_only')}
          >
            Solo mío
          </button>
        </div>
      </div>

      {sumMismatch && (
        <div className="mismatch-warning">
          ⚠️ Los items suman ${itemsSum.toLocaleString('es-CO')}, el total dice $
          {total?.toLocaleString('es-CO')}. Revisa los precios.
        </div>
      )}

      <div className="items-list">
        {items.map((item) => {
          const hasDiscount =
            item.list_price != null && item.list_price > item.paid_price
          const isOpen = expandedItemId === item.id
          return (
            <div className="item-row" key={item.id}>
              <div
                className="item-row-summary"
                onClick={() => setExpandedItemId(isOpen ? null : item.id)}
              >
                <span className="item-name">{item.raw_text || 'Item sin nombre'}</span>
                <div className="item-price">
                  {hasDiscount && (
                    <>
                      <span className="list-price">
                        ${item.list_price!.toLocaleString('es-CO')}
                      </span>
                      <span className="discount-pill">
                        -{Math.round((1 - item.paid_price / item.list_price!) * 100)}%
                      </span>
                    </>
                  )}
                  <span className="paid-price">${item.paid_price.toLocaleString('es-CO')}</span>
                </div>
              </div>
              {isOpen && (
                <div className="item-row-edit">
                  <div className="edit-field">
                    <label>Nombre</label>
                    <input
                      style={{ width: 180, textAlign: 'left' }}
                      value={item.raw_text}
                      onChange={(e) => updateItem(item.id, { raw_text: e.target.value })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Cantidad</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.id, { quantity: Number(e.target.value) || 1 })
                      }
                    />
                  </div>
                  <div className="edit-field">
                    <label>Precio original</label>
                    <input
                      type="number"
                      value={item.list_price ?? ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          list_price: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  <div className="edit-field">
                    <label>Precio pagado</label>
                    <input
                      type="number"
                      value={item.paid_price}
                      onChange={(e) =>
                        updateItem(item.id, { paid_price: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <button className="remove-item" onClick={() => removeItem(item.id)}>
                    Eliminar item
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <button className="add-item-btn" onClick={addBlankItem}>
          + Agregar item
        </button>
      </div>

      <div className="sticky-save-bar">
        <span className="item-count">{items.length} items</span>
        <button onClick={handleSave} disabled={step === 'saving' || items.length === 0}>
          {step === 'saving' ? 'Guardando...' : 'Confirmar y guardar'}
        </button>
      </div>
    </div>
  )
}
