import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { POST } from '@/app/api/gateways/[id]/control/route'
import { loadGatewayProfiles, saveGatewayProfiles } from '@/lib/server/storage'

const originalGateways = loadGatewayProfiles()

afterEach(() => {
  saveGatewayProfiles(originalGateways)
})

function saveTestGateway(id = 'gateway-control-test') {
  saveGatewayProfiles({
    ...loadGatewayProfiles(),
    [id]: {
      id,
      name: 'Gateway Control Test',
      provider: 'openclaw',
      endpoint: 'http://127.0.0.1:18789/v1',
      wsUrl: 'ws://127.0.0.1:18789',
      credentialId: null,
      status: 'healthy',
      lifecycleState: 'active',
      notes: null,
      tags: [],
      lastError: null,
      lastCheckedAt: null,
      lastModelCount: null,
      discoveredHost: null,
      discoveredPort: null,
      deployment: null,
      stats: null,
      isDefault: false,
      createdAt: 1,
      updatedAt: 1,
    },
  })
}

test('gateway control route drains a gateway profile', async () => {
  saveTestGateway()

  const response = await POST(new Request('http://local/api/gateways/gateway-control-test/control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'drain', reason: 'maintenance' }),
  }), { params: Promise.resolve({ id: 'gateway-control-test' }) })

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.lifecycleState, 'draining')
  assert.equal(payload.lastControlAction, 'drain')
  assert.equal(payload.lastControlReason, 'maintenance')
  assert.equal(payload.controlRequest, null)
})

test('gateway control route records restart requests without changing lifecycle', async () => {
  saveTestGateway()

  const response = await POST(new Request('http://local/api/gateways/gateway-control-test/control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'restart' }),
  }), { params: Promise.resolve({ id: 'gateway-control-test' }) })

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.lifecycleState, 'active')
  assert.equal(payload.lastControlAction, 'restart')
  assert.equal(payload.controlRequest?.action, 'restart')
  assert.equal(payload.controlRequest?.source, 'swarmclaw')
  assert.equal(typeof payload.controlRequest?.requestedAt, 'number')
})

test('gateway control route validates control actions', async () => {
  saveTestGateway()

  const response = await POST(new Request('http://local/api/gateways/gateway-control-test/control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'pause' }),
  }), { params: Promise.resolve({ id: 'gateway-control-test' }) })

  assert.equal(response.status, 400)
})
