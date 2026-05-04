import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildOpenClawGatewayTopology, getOpenClawGatewayFleetTopology } from './gateway-topology'
import type { GatewayProfile, OpenClawGatewayStats } from '@/types'

const now = 1_800_000_000_000

function profile(overrides: Partial<GatewayProfile> = {}): GatewayProfile {
  return {
    id: overrides.id || 'gateway_1',
    name: overrides.name || 'Primary Gateway',
    provider: 'openclaw',
    endpoint: overrides.endpoint || 'http://127.0.0.1:18789/v1',
    wsUrl: overrides.wsUrl ?? null,
    credentialId: overrides.credentialId ?? null,
    status: overrides.status || 'healthy',
    notes: overrides.notes ?? null,
    tags: overrides.tags || [],
    lastError: overrides.lastError ?? null,
    lastCheckedAt: overrides.lastCheckedAt ?? null,
    lastModelCount: overrides.lastModelCount ?? null,
    discoveredHost: overrides.discoveredHost ?? null,
    discoveredPort: overrides.discoveredPort ?? null,
    deployment: overrides.deployment ?? null,
    stats: overrides.stats ?? null,
    isDefault: overrides.isDefault ?? false,
    createdAt: overrides.createdAt ?? now - 1000,
    updatedAt: overrides.updatedAt ?? now - 500,
  }
}

function gateway(responses: Record<string, unknown>) {
  return {
    connected: true,
    rpc: async (method: string) => {
      const response = responses[method]
      if (response instanceof Error) throw response
      return response
    },
  }
}

describe('OpenClaw gateway topology', () => {
  it('normalizes nodes, pairings, sessions, presence, and persists aggregate stats', async () => {
    let savedStats: OpenClawGatewayStats | null = null
    const topology = await buildOpenClawGatewayTopology(profile(), {
      now: () => now,
      ensureGatewayConnected: async () => gateway({
        'node.list': {
          nodes: [
            { nodeId: 'node_1', displayName: 'Mac Studio', connected: true, commands: ['shell.exec'] },
            { id: 'node_2', name: 'Builder', connected: false },
          ],
        },
        'node.pair.list': { pending: [{ requestId: 'node_pair_1', nodeId: 'node_3' }] },
        'device.pair.list': {
          pending: [{ requestId: 'device_pair_1', deviceId: 'phone_1', role: 'operator' }],
          paired: [{ deviceId: 'tablet_1', displayName: 'Ops Tablet' }],
        },
        'sessions.list': { sessions: [{ sessionId: 'session_1', title: 'Release room' }] },
        'system-presence': { presence: [{ deviceId: 'phone_1', mode: 'active' }] },
      }) as never,
      persistStats: (id, input) => {
        assert.equal(id, 'gateway_1')
        savedStats = input.stats as OpenClawGatewayStats
        return { ...profile(), stats: savedStats }
      },
    })

    assert.equal(topology.connected, true)
    assert.equal(topology.nodes.length, 2)
    assert.equal(topology.stats.nodeCount, 2)
    assert.equal(topology.stats.connectedNodeCount, 1)
    assert.equal(topology.stats.pendingNodePairings, 1)
    assert.equal(topology.stats.pendingDevicePairings, 1)
    assert.equal(topology.stats.pairedDeviceCount, 1)
    assert.equal(topology.stats.sessionCount, 1)
    assert.equal(topology.stats.presenceCount, 1)
    assert.equal(topology.stats.pendingPairingCount, 2)
    assert.equal(topology.stats.hasErrors, false)
    assert.equal(topology.stats.lastTopologyCheckedAt, now)
    assert.deepEqual(savedStats, topology.stats)
  })

  it('returns partial topology when optional gateway RPC methods fail', async () => {
    const topology = await buildOpenClawGatewayTopology(profile(), {
      now: () => now,
      ensureGatewayConnected: async () => gateway({
        'node.list': { nodes: [{ nodeId: 'node_1', connected: true }] },
        'node.pair.list': { pending: [] },
        'device.pair.list': { pending: [], paired: [] },
        'sessions.list': new Error('sessions unavailable'),
        'system-presence': new Error('presence unavailable'),
      }) as never,
      persistStats: (id, input) => ({ ...profile({ id }), stats: input.stats as OpenClawGatewayStats }),
    })

    assert.equal(topology.nodes.length, 1)
    assert.equal(topology.sessions.length, 0)
    assert.deepEqual(topology.errors.map((error) => error.method), ['sessions.list', 'system-presence'])
    assert.equal(topology.stats.hasErrors, true)
    assert.equal(topology.stats.lastTopologyErrorCount, 2)
    assert.equal(topology.stats.lastTopologyError, 'sessions unavailable')
  })

  it('marks a profile disconnected when no gateway can be reached', async () => {
    const topology = await buildOpenClawGatewayTopology(profile(), {
      now: () => now,
      ensureGatewayConnected: async () => null,
    })

    assert.equal(topology.connected, false)
    assert.equal(topology.stats.hasErrors, true)
    assert.equal(topology.stats.nodeCount, 0)
    assert.equal(topology.errors[0]?.method, 'gateway.connect')
  })

  it('aggregates fleet totals from every gateway topology', async () => {
    const first = profile({ id: 'gateway_a' })
    const second = profile({ id: 'gateway_b' })
    const fleet = await getOpenClawGatewayFleetTopology({
      now: () => now,
      listGatewayProfiles: () => [first, second],
      ensureGatewayConnected: async (target?: { profileId?: string | null }) => gateway({
        'node.list': {
          nodes: target?.profileId === 'gateway_a'
            ? [{ nodeId: 'node_a', connected: true }]
            : [{ nodeId: 'node_b', connected: false }],
        },
        'node.pair.list': { pending: target?.profileId === 'gateway_b' ? [{ requestId: 'pair_b' }] : [] },
        'device.pair.list': { pending: [], paired: [] },
        'sessions.list': { sessions: target?.profileId === 'gateway_a' ? [{ id: 'session_a' }] : [] },
        'system-presence': { presence: [] },
      }) as never,
      persistStats: (id, input) => ({
        ...(id === 'gateway_a' ? first : second),
        stats: input.stats as OpenClawGatewayStats,
      }),
    })

    assert.equal(fleet.generatedAt, now)
    assert.equal(fleet.totals.gatewayCount, 2)
    assert.equal(fleet.totals.connectedGatewayCount, 2)
    assert.equal(fleet.totals.nodeCount, 2)
    assert.equal(fleet.totals.connectedNodeCount, 1)
    assert.equal(fleet.totals.pendingNodePairings, 1)
    assert.equal(fleet.totals.sessionCount, 1)
    assert.equal(fleet.gateways.length, 2)
  })
})
