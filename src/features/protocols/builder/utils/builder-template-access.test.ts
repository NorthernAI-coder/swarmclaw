import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ProtocolTemplate } from '@/types'
import { isBuilderTemplateReadOnly } from './builder-template-access'

function makeTemplate(overrides: Partial<ProtocolTemplate> = {}): ProtocolTemplate {
  return {
    id: 'template-1',
    name: 'Template One',
    description: 'A template',
    builtIn: false,
    defaultPhases: [],
    ...overrides,
  }
}

describe('isBuilderTemplateReadOnly', () => {
  it('marks built-in templates as read-only', () => {
    assert.equal(isBuilderTemplateReadOnly(makeTemplate({ builtIn: true })), true)
  })

  it('keeps custom templates editable', () => {
    assert.equal(isBuilderTemplateReadOnly(makeTemplate({ builtIn: false })), false)
  })

  it('treats an unloaded template as non-editable only after one is present', () => {
    assert.equal(isBuilderTemplateReadOnly(null), false)
    assert.equal(isBuilderTemplateReadOnly(undefined), false)
  })
})
