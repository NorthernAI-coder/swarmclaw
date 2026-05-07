import { NextResponse } from 'next/server'

import { controlGatewayProfile } from '@/lib/server/gateways/gateway-profile-service'
import { notFound } from '@/lib/server/collection-helpers'
import { GatewayControlSchema, formatZodError } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ error: 'Invalid or missing request body' }, { status: 400 })
  }

  const parsed = GatewayControlSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json(formatZodError(parsed.error), { status: 400 })

  const result = controlGatewayProfile(id, parsed.data)
  if (!result) return notFound()
  return NextResponse.json(result)
}
