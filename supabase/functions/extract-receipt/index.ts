// Supabase Edge Function: extrae tienda, canal, fecha, items y precios
// de una foto/screenshot de recibo usando Gemini vision.
//
// Invocar con POST { imageBase64: string, mimeType: string }
// Devuelve el JSON estructurado extraído; el frontend luego lo guarda en `receipts`.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = 'gemini-flash-latest'
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const EXTRACTION_PROMPT = `
Eres un extractor de datos de recibos de mercado en Colombia (Rappi, D1, Éxito, Carulla, Makro, Ara, PriceSmart).
Analiza la imagen (foto de recibo físico o screenshot de app) y devuelve SOLO un JSON válido, sin texto adicional, con esta forma exacta:

{
  "store": "nombre de la tienda tal como aparece, ej. Exito, D1, Carulla, Makro, Ara, PriceSmart, o null si no se puede determinar",
  "channel": "uno de: rappi, d1_app, presencial",
  "purchase_date": "YYYY-MM-DD o null si no aparece",
  "total_amount": numero o null,
  "delivery_fee": numero o 0,
  "tip_amount": numero o 0,
  "items": [
    {
      "raw_text": "texto del producto tal como aparece en el recibo",
      "quantity": numero (default 1),
      "list_price": numero o null (precio antes de descuento, si se distingue),
      "paid_price": numero (precio realmente pagado, obligatorio)
    }
  ]
}

Reglas:
- Si el recibo muestra un producto con precio tachado/original y un precio final con descuento, usa list_price para el original y paid_price para el final.
- Si no hay descuento, list_price puede ser igual a paid_price o null.
- Ignora líneas que no sean productos (subtotales, IVA, propina se van en tip_amount aparte).
- Si es un screenshot de Rappi, "channel" es "rappi" y "store" es el comercio real del pedido (ej. Exito, Carulla, Makro).
- Si es screenshot de la app de D1, "channel" es "d1_app" y "store" es "D1".
- Si es foto de un recibo físico de tienda, "channel" es "presencial".

Formato especial de recibos físicos de Éxito (y similares): cada producto ocupa DOS líneas.
La primera línea tiene el número de item, cantidad, "x", precio unitario de lista, y "V.Ahorro" seguido
del monto ahorrado (o 0 si no hubo descuento). La segunda línea tiene el código PLU, el nombre del
producto, y el precio final pagado por esa línea. Ejemplo:

"1 1/u x 32.600 V.Ahorro 8.150"
"3202769 Leche Uht Entera        24.450"

Esto significa: raw_text = "Leche Uht Entera", quantity = 1, list_price = 32.600 (precio unitario x cantidad),
paid_price = 24.450 (ya con el ahorro aplicado). Combina ambas líneas en un solo item — nunca los devuelvas
como items separados. Si "V.Ahorro" es 0, list_price puede ser igual a paid_price.
`.trim()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function extractBalancedJson(text: string): string {
  const start = text.indexOf('{')
  if (start === -1) return text
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY no configurada' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { imageBase64, mimeType } = await req.json()
    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: 'Falta imageBase64 o mimeType' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: EXTRACTION_PROMPT },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      return new Response(JSON.stringify({ error: 'Error de Gemini', details: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiJson = await geminiRes.json()
    const textOut = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text
    if (!textOut) {
      return new Response(JSON.stringify({ error: 'Respuesta vacía de Gemini', raw: geminiJson }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let extracted
    try {
      const cleaned = textOut.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
      extracted = JSON.parse(extractBalancedJson(cleaned))
    } catch {
      return new Response(
        JSON.stringify({ error: 'Gemini no devolvió JSON válido', rawText: textOut }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    return new Response(JSON.stringify({ extracted, raw: geminiJson }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
