// Tipos compartidos, reflejan supabase/schema.sql

export interface Store {
  id: string
  name: string
  aisle_hint: string | null
}

export interface Channel {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
  aisle_order: number
}

export interface Product {
  id: string
  household_id: string
  canonical_name: string
  brand: string | null
  size_value: number | null
  size_unit: string | null
  category_id: string | null
}

export interface Receipt {
  id: string
  household_id: string
  uploaded_by: string | null
  store_id: string | null
  channel_id: string | null
  purchase_date: string | null
  total_amount: number | null
  delivery_fee: number
  tip_amount: number
  cost_split: 'shared' | 'mine_only'
  image_path: string | null
  status: 'pending' | 'confirmed' | 'failed'
  created_at: string
}

export interface ReceiptItem {
  id: string
  receipt_id: string
  product_id: string | null
  raw_text: string
  quantity: number
  list_price: number | null
  paid_price: number
  matched_confidence: number | null
  confirmed: boolean
}

export interface ShoppingListItem {
  id: string
  household_id: string
  product_id: string | null
  raw_name: string | null
  quantity: number
  added_by: string | null
  ai_suggested: boolean
  checked: boolean
}

export interface PriceCheck {
  id: string
  product_id: string
  store_id: string | null
  channel_id: string | null
  result_price: number | null
  on_discount: boolean
  checked_at: string
}
