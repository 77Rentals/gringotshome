import { supabase } from './supabase'

export interface ProductCandidate {
  id: string
  canonical_name: string
  brand: string | null
  size_value: number | null
  size_unit: string | null
  similarity: number
}

export async function findCandidates(
  householdId: string,
  rawText: string
): Promise<ProductCandidate[]> {
  const { data, error } = await supabase.rpc('match_products', {
    p_household_id: householdId,
    p_query: rawText,
    p_limit: 5,
  })
  if (error) throw error
  return (data ?? []) as ProductCandidate[]
}

export async function createProduct(householdId: string, canonicalName: string) {
  const { data, error } = await supabase
    .from('products')
    .insert({ household_id: householdId, canonical_name: canonicalName.trim() })
    .select()
    .single()
  if (error || !data) throw error
  return data
}

export async function addProductAlias(productId: string, rawText: string) {
  await supabase.from('product_aliases').insert({ product_id: productId, raw_text: rawText })
}

export async function confirmItemMatch(
  receiptItemId: string,
  productId: string,
  rawText: string
) {
  await supabase
    .from('receipt_items')
    .update({ product_id: productId, confirmed: true })
    .eq('id', receiptItemId)
  await addProductAlias(productId, rawText)
}

export interface ReceiptItemForMatching {
  id: string
  raw_text: string
  quantity: number
  list_price: number | null
  paid_price: number
  product_id: string | null
}

export async function getUnmatchedItems(receiptId: string): Promise<ReceiptItemForMatching[]> {
  const { data, error } = await supabase
    .from('receipt_items')
    .select('id, raw_text, quantity, list_price, paid_price, product_id')
    .eq('receipt_id', receiptId)
  if (error) throw error
  return data ?? []
}

export async function recordPrice(
  productId: string,
  storeId: string | null,
  channelId: string | null,
  listPrice: number | null,
  paidPrice: number,
  receiptItemId: string
) {
  if (!storeId || !channelId) return
  await supabase.from('prices').insert({
    product_id: productId,
    store_id: storeId,
    channel_id: channelId,
    list_price: listPrice,
    paid_price: paidPrice,
    source: 'receipt',
    receipt_item_id: receiptItemId,
  })
}
