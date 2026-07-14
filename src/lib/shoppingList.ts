import { supabase } from './supabase'

export interface ListItemRow {
  id: string
  product_id: string | null
  raw_name: string | null
  quantity: number
  checked: boolean
  ai_suggested: boolean
  product?: {
    canonical_name: string
    category_id: string | null
    category?: { name: string; aisle_order: number } | null
  } | null
}

export async function getListItems(householdId: string): Promise<ListItemRow[]> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select(
      'id, product_id, raw_name, quantity, checked, ai_suggested, product:products(canonical_name, category_id, category:categories(name, aisle_order))'
    )
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as ListItemRow[]
}

export async function addListItem(
  householdId: string,
  memberId: string,
  input: { productId?: string; rawName: string; quantity?: number; aiSuggested?: boolean }
) {
  // evita duplicados: mismo producto o mismo texto ya en la lista sin marcar
  const { data: existing } = await supabase
    .from('shopping_list_items')
    .select('id, quantity')
    .eq('household_id', householdId)
    .eq('checked', false)
    .match(
      input.productId ? { product_id: input.productId } : { raw_name: input.rawName.trim() }
    )
    .maybeSingle()

  if (existing) {
    await supabase
      .from('shopping_list_items')
      .update({ quantity: existing.quantity + (input.quantity ?? 1) })
      .eq('id', existing.id)
    return
  }

  await supabase.from('shopping_list_items').insert({
    household_id: householdId,
    product_id: input.productId ?? null,
    raw_name: input.productId ? null : input.rawName.trim(),
    quantity: input.quantity ?? 1,
    added_by: memberId,
    ai_suggested: input.aiSuggested ?? false,
  })
}

export async function toggleChecked(itemId: string, checked: boolean) {
  await supabase.from('shopping_list_items').update({ checked }).eq('id', itemId)
}

export async function deleteListItem(itemId: string) {
  await supabase.from('shopping_list_items').delete().eq('id', itemId)
}

export interface RepurchaseSuggestion {
  productId: string
  name: string
  daysSinceLast: number
  avgIntervalDays: number
}

// Heurística simple: si ya pasó más tiempo del promedio histórico de recompra, sugiere.
export async function getRepurchaseSuggestions(
  householdId: string
): Promise<RepurchaseSuggestion[]> {
  const { data, error } = await supabase
    .from('prices')
    .select('product_id, observed_at, products!inner(household_id, canonical_name)')
    .eq('products.household_id', householdId)
    .order('observed_at', { ascending: true })
  if (error) throw error

  const byProduct = new Map<string, { name: string; dates: number[] }>()
  for (const row of data ?? []) {
    const productRow = Array.isArray(row.products) ? row.products[0] : row.products
    const name = (productRow as { canonical_name: string })?.canonical_name ?? 'Producto'
    const key = row.product_id as string
    const t = new Date(row.observed_at as string).getTime()
    if (!byProduct.has(key)) byProduct.set(key, { name, dates: [] })
    byProduct.get(key)!.dates.push(t)
  }

  const { data: alreadyOnList } = await supabase
    .from('shopping_list_items')
    .select('product_id')
    .eq('household_id', householdId)
    .eq('checked', false)
  const onListIds = new Set((alreadyOnList ?? []).map((i) => i.product_id))

  const now = Date.now()
  const suggestions: RepurchaseSuggestion[] = []
  for (const [productId, { name, dates }] of byProduct) {
    if (dates.length < 2 || onListIds.has(productId)) continue
    const intervals = []
    for (let i = 1; i < dates.length; i++) intervals.push(dates[i] - dates[i - 1])
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const last = dates[dates.length - 1]
    const sinceLastMs = now - last
    if (sinceLastMs >= avgMs) {
      suggestions.push({
        productId,
        name,
        daysSinceLast: Math.round(sinceLastMs / 86400000),
        avgIntervalDays: Math.round(avgMs / 86400000),
      })
    }
  }
  return suggestions.sort((a, b) => b.daysSinceLast - a.daysSinceLast)
}
