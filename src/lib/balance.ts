import { supabase } from './supabase'

export interface MemberBalance {
  memberId: string
  displayName: string
  totalPaidShared: number
}

export interface BalanceResult {
  members: MemberBalance[]
  totalShared: number
  // positivo: members[0] le debe a members[1]; negativo: al revés
  netAmount: number
  owesFrom: string | null
  owesTo: string | null
}

export async function getBalance(householdId: string): Promise<BalanceResult> {
  const [{ data: members }, { data: receipts }] = await Promise.all([
    supabase.from('household_members').select('id, display_name').eq('household_id', householdId),
    supabase
      .from('receipts')
      .select('total_amount, uploaded_by')
      .eq('household_id', householdId)
      .eq('cost_split', 'shared'),
  ])

  const memberList = members ?? []
  const paidByMember = new Map<string, number>()
  for (const m of memberList) paidByMember.set(m.id, 0)

  let totalShared = 0
  for (const r of receipts ?? []) {
    const amount = r.total_amount ?? 0
    totalShared += amount
    if (r.uploaded_by) {
      paidByMember.set(r.uploaded_by, (paidByMember.get(r.uploaded_by) ?? 0) + amount)
    }
  }

  const result: MemberBalance[] = memberList.map((m) => ({
    memberId: m.id,
    displayName: m.display_name,
    totalPaidShared: paidByMember.get(m.id) ?? 0,
  }))

  let netAmount = 0
  let owesFrom: string | null = null
  let owesTo: string | null = null

  if (result.length === 2) {
    const fairShare = totalShared / 2
    const diff = result[0].totalPaidShared - fairShare // cuánto de más/menos pagó el miembro 0
    netAmount = Math.round(Math.abs(diff))
    if (diff > 0.01) {
      owesFrom = result[1].displayName
      owesTo = result[0].displayName
    } else if (diff < -0.01) {
      owesFrom = result[0].displayName
      owesTo = result[1].displayName
    }
  }

  return { members: result, totalShared, netAmount, owesFrom, owesTo }
}
