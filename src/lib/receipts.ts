import { supabase } from './supabase'

export interface ExtractedItem {
  raw_text: string
  quantity: number
  list_price: number | null
  paid_price: number
}

export interface ExtractedReceipt {
  store: string | null
  channel: 'rappi' | 'd1_app' | 'presencial' | null
  purchase_date: string | null
  total_amount: number | null
  delivery_fee: number
  tip_amount: number
  items: ExtractedItem[]
}

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.75

// Fotos de celular pueden pesar varios MB; comprimirlas antes de subir
// acelera bastante la extracción con IA y evita timeouts en redes lentas.
function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('No se pudo procesar la imagen'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
    }
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = objectUrl
  })
}

async function invokeExtract(imageBase64: string, mimeType: string) {
  const { data, error } = await supabase.functions.invoke('extract-receipt', {
    body: { imageBase64, mimeType },
  })
  if (error) throw error
  if (data.error) throw new Error(data.error)
  return data.extracted as ExtractedReceipt
}

export async function extractReceipt(file: File): Promise<ExtractedReceipt> {
  const { base64: imageBase64, mimeType } = await compressImage(file)
  try {
    return await invokeExtract(imageBase64, mimeType)
  } catch (err) {
    // Fallas de red intermitentes ocurren con conexiones lentas; un reintento
    // silencioso resuelve la mayoría sin molestar al usuario.
    const isNetworkError = err instanceof Error && /fetch|network/i.test(err.message)
    if (!isNetworkError) throw err
    return await invokeExtract(imageBase64, mimeType)
  }
}

export interface SaveReceiptInput {
  householdId: string
  uploadedBy: string
  storeId: string | null
  channelId: string | null
  purchaseDate: string | null
  totalAmount: number | null
  deliveryFee: number
  tipAmount: number
  costSplit: 'shared' | 'mine_only'
  items: ExtractedItem[]
}

export async function saveReceipt(input: SaveReceiptInput) {
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      household_id: input.householdId,
      uploaded_by: input.uploadedBy,
      store_id: input.storeId,
      channel_id: input.channelId,
      purchase_date: input.purchaseDate,
      total_amount: input.totalAmount,
      delivery_fee: input.deliveryFee,
      tip_amount: input.tipAmount,
      cost_split: input.costSplit,
      status: 'confirmed',
    })
    .select()
    .single()

  if (receiptError || !receipt) throw receiptError

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from('receipt_items').insert(
      input.items.map((item) => ({
        receipt_id: receipt.id,
        raw_text: item.raw_text,
        quantity: item.quantity,
        list_price: item.list_price,
        paid_price: item.paid_price,
        confirmed: true,
      }))
    )
    if (itemsError) throw itemsError
  }

  return receipt
}
