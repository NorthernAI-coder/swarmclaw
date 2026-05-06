import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentConfigVersionSummary, formatAgentConfigVersionAge } from './agent-config-history'
import type { ConfigVersion } from '@/types/config-version'

function makeVersion(overrides: Partial<ConfigVersion> = {}): ConfigVersion {
  return {
    id: 'version_1',
    entityKind: 'agent',
    entityId: 'agent_1',
    actor: 'user',
    approvalId: null,
    note: null,
    createdAt: 1_700_000_000_000,
    snapshot: {
      name: 'Release Agent',
      provider: 'openai',
      model: 'gpt-5.2',
    },
    ...overrides,
  }
}

test('formatAgentConfigVersionAge formats compact relative ages', () => {
  assert.equal(formatAgentConfigVersionAge(1_700_000_000_000, 1_700_000_030_000), 'just now')
  assert.equal(formatAgentConfigVersionAge(1_700_000_000_000, 1_700_000_300_000), '5m ago')
  assert.equal(formatAgentConfigVersionAge(1_700_000_000_000, 1_700_010_800_000), '3h ago')
  assert.equal(formatAgentConfigVersionAge(1_700_000_000_000, 1_700_259_200_000), '3d ago')
})

test('buildAgentConfigVersionSummary surfaces useful agent snapshot labels', () => {
  const summary = buildAgentConfigVersionSummary(makeVersion(), 1_700_000_300_000)

  assert.equal(summary.id, 'version_1')
  assert.equal(summary.title, 'Release Agent')
  assert.equal(summary.subtitle, 'openai / gpt-5.2')
  assert.equal(summary.meta, '5m ago by user')
})

test('buildAgentConfigVersionSummary handles sparse snapshots', () => {
  const summary = buildAgentConfigVersionSummary(makeVersion({
    actor: 'system',
    snapshot: {},
  }), 1_700_000_300_000)

  assert.equal(summary.title, 'Previous agent settings')
  assert.equal(summary.subtitle, 'No provider snapshot')
  assert.equal(summary.meta, '5m ago by system')
})
