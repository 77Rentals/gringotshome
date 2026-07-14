import { supabase } from './supabase'

export interface StorePriceOption {
  storeId: string
  storeName: string
  channelName: string
  price: number
  observedAt: string
}

export interface ItemComparison {
  productId: string
  name: string
  quantity: number
  options: StorePriceOption[]
  cheapest: StorePriceOption | null
}

export interface StoreSubtotal {
  storeId: string
  storeName: string
  total: number
  itemsCovered: number
  itemsMissing: string[]
}

export interface ComparisonResult {
  items: ItemComparison[]
  optimalSplitTotal: number
  splitByStore: { storeName: string; items: string[]; subtotal: number }[]
  singleStoreTotals: StoreSubtotal[]
}

export async function compareListPrices(
  productEntries: { productId: string; name: string; quantity: number }[]
): Promise<ComparisonResult> {
  const productIds = productEntries.map((p) => p.productId)
  const { data, error } = await supabase
    .from('prices')
    .select(
      'product_id, paid_price, observed_at, store:stores(id, name), channel:channels(name)'
    )
    .in('product_id', productIds)
    .order('observed_at', { ascending: false })
  if (error) throw error

  const latestByProductStore = new Map<string, StorePriceOption>()
  for (const row of data ?? []) {
    const store = Array.isArray(row.store) ? row.store[0] : row.store
    const channel = Array.isArray(row.channel) ? row.channel[0] : row.channel
    if (!store) continue
    const key = `${row.product_id}::${store.id}`
    if (latestByProductStore.has(key)) continue // ya tenemos el más reciente (ordenado desc)
    latestByProductStore.set(key, {
      storeId: store.id,
      storeName: store.name,
      channelName: channel?.name ?? '',
      price: row.paid_price,
      observedAt: row.observed_at,
    })
  }

  const items: ItemComparison[] = productEntries.map((entry) => {
    const options = [...latestByProductStore.entries()]
      .filter(([key]) => key.startsWith(`${entry.productId}::`))
      .map(([, v]) => v)
      .sort((a, b) => a.price - b.price)
    return {
      productId: entry.productId,
      name: entry.name,
      quantity: entry.quantity,
      options,
      cheapest: options[0] ?? null,
    }
  })

  // División óptima: el precio más barato conocido para cada item, sin importar la tienda
  const optimalSplitTotal = items.reduce(
    (sum, it) => sum + (it.cheapest ? it.cheapest.price * it.quantity : 0),
    0
  )
  const splitMap = new Map<string, { items: string[]; subtotal: number }>()
  for (const it of items) {
    if (!it.cheapest) continue
    const key = it.cheapest.storeName
    if (!splitMap.has(key)) splitMap.set(key, { items: [], subtotal: 0 })
    const g = splitMap.get(key)!
    g.items.push(it.name)
    g.subtotal += it.cheapest.price * it.quantity
  }
  const splitByStore = [...splitMap.entries()]
    .map(([storeName, v]) => ({ storeName, ...v }))
    .sort((a, b) => b.subtotal - a.subtotal)

  // Comparación: comprar todo en una sola tienda (solo tiendas con datos de todos los items)
  const allStoreNames = new Set<string>()
  for (const it of items) for (const o of it.options) allStoreNames.add(o.storeName)

  const singleStoreTotals: StoreSubtotal[] = [...allStoreNames]
    .map((storeName) => {
      let total = 0
      let covered = 0
      const missing: string[] = []
      for (const it of items) {
        const opt = it.options.find((o) => o.storeName === storeName)
        if (opt) {
          total += opt.price * it.quantity
          covered++
        } else {
          missing.push(it.name)
        }
      }
      const storeId =
        items.find((it) => it.options.some((o) => o.storeName === storeName))?.options.find(
          (o) => o.storeName === storeName
        )?.storeId ?? ''
      return { storeId, storeName, total, itemsCovered: covered, itemsMissing: missing }
    })
    .sort((a, b) => a.total - b.total)

  return { items, optimalSplitTotal, splitByStore, singleStoreTotals }
}
