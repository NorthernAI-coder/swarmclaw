import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProviderDiagnostics,
  sanitizeProviderDiagnosticTarget,
  sanitizeProviderDiagnosticText,
} from './provider-diagnostics'

test('provider diagnostics records sanitized ordered steps', () => {
  const diagnostics = createProviderDiagnostics()
  diagnostics.pass('Endpoint resolved', { target: 'http://user:pass@127.0.0.1:1234/v1/models?token=sk-secret' })
  diagnostics.fail('Chat failed', { detail: 'Malformed token sk-abc123456789 provided', durationMs: 12.4 })

  const steps = diagnostics.toJSON()
  assert.equal(steps.length, 2)
  assert.deepEqual(
    steps.map((step) => step.id),
    ['diag-1', 'diag-2'],
  )
  assert.equal(steps[0].status, 'pass')
  assert.equal(steps[0].target, 'http://127.0.0.1:1234/v1/models')
  assert.equal(steps[1].detail, 'Malformed token sk-... provided')
  assert.equal(steps[1].durationMs, 12)
})

test('sanitizeProviderDiagnosticText redacts common provider token prefixes', () => {
  assert.equal(
    sanitizeProviderDiagnosticText('bad keys: sk-test123 gsk_live456 hf_token789 AIzaSySecret'),
    'bad keys: sk-... gsk_... hf_... AIza...',
  )
})

test('sanitizeProviderDiagnosticTarget removes credentials, query, and hash from URLs', () => {
  assert.equal(
    sanitizeProviderDiagnosticTarget('https://user:secret@example.com/v1/models?api_key=sk-secret#frag'),
    'https://example.com/v1/models',
  )
})
