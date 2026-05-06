import assert from 'node:assert/strict'
import test from 'node:test'

import { runWithTempDataDir } from '@/lib/server/test-utils/run-with-temp-data-dir'

test('config version routes list and restore prior agent settings', () => {
  const output = runWithTempDataDir<{
    updateStatus: number
    listStatus: number
    restoreStatus: number
    versionCount: number
    versionName: string | null
    restoredName: string | null
    restoredModel: string | null
  }>(`
    const storageMod = await import('./src/lib/server/storage')
    const agentRouteMod = await import('./src/app/api/agents/[id]/route')
    const configRouteMod = await import('./src/app/api/config-versions/route')
    const restoreRouteMod = await import('./src/app/api/config-versions/restore/route')
    const storage = storageMod.default || storageMod
    const agentRoute = agentRouteMod.default || agentRouteMod
    const configRoute = configRouteMod.default || configRouteMod
    const restoreRoute = restoreRouteMod.default || restoreRouteMod

    const now = Date.now()
    storage.saveAgents({
      agent_history_1: {
        id: 'agent_history_1',
        name: 'Before Save',
        description: 'Original',
        systemPrompt: '',
        provider: 'ollama',
        model: 'qwen3.5',
        credentialId: null,
        fallbackCredentialIds: [],
        apiEndpoint: null,
        gatewayProfileId: null,
        extensions: [],
        createdAt: now,
        updatedAt: now,
      },
    })

    const params = { params: Promise.resolve({ id: 'agent_history_1' }) }
    const updateResponse = await agentRoute.PUT(new Request('http://local/api/agents/agent_history_1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'After Save', model: 'qwen3.6' }),
    }), params)

    const listResponse = await configRoute.GET(new Request('http://local/api/config-versions?entityKind=agent&entityId=agent_history_1'))
    const listPayload = await listResponse.json()
    const firstVersion = listPayload.versions?.[0] || null

    const restoreResponse = await restoreRoute.POST(new Request('http://local/api/config-versions/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versionId: firstVersion?.id }),
    }))

    const restored = storage.loadAgents().agent_history_1

    console.log(JSON.stringify({
      updateStatus: updateResponse.status,
      listStatus: listResponse.status,
      restoreStatus: restoreResponse.status,
      versionCount: Array.isArray(listPayload.versions) ? listPayload.versions.length : 0,
      versionName: firstVersion?.snapshot?.name || null,
      restoredName: restored?.name || null,
      restoredModel: restored?.model || null,
    }))
  `, { prefix: 'swarmclaw-config-versions-route-' })

  assert.equal(output.updateStatus, 200)
  assert.equal(output.listStatus, 200)
  assert.equal(output.restoreStatus, 200)
  assert.equal(output.versionCount, 1)
  assert.equal(output.versionName, 'Before Save')
  assert.equal(output.restoredName, 'Before Save')
  assert.equal(output.restoredModel, 'qwen3.5')
})
