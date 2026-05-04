import { NextResponse } from 'next/server'

import { getOpenClawGatewayFleetTopology } from '@/lib/server/gateways/gateway-topology'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getOpenClawGatewayFleetTopology())
}
