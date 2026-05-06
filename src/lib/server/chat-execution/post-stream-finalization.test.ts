import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { stripLeakedClassificationJson } from './post-stream-finalization'

// A fully-valid MessageClassification serialized by the model. Mirrors the
// real output we observed during a live delegation turn.
const VALID_LEAK = JSON.stringify({
  taskIntent: 'research',
  isDeliverableTask: false,
  isBroadGoal: false,
  isLightweightDirectChat: true,
  hasHumanSignals: false,
  hasSignificantEvent: false,
  isResearchSynthesis: false,
  workType: 'general',
  explicitToolRequests: [],
  confidence: 0.95,
})

describe('stripLeakedClassificationJson', () => {
  it('strips a leaked classification JSON that starts with taskIntent', () => {
    const input = `${VALID_LEAK}Task created and delegated.`
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, true)
    assert.equal(cleaned, 'Task created and delegated.')
  })

  it('strips when the leak appears mid-response', () => {
    const input = `Here you go: ${VALID_LEAK} continuing.`
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, true)
    assert.equal(cleaned.includes('taskIntent'), false)
  })

  it('strips multiple leaked classification JSON blocks', () => {
    const input = `${VALID_LEAK}\n${VALID_LEAK}\nTask created and delegated.`
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, true)
    assert.equal(cleaned, 'Task created and delegated.')
  })

  it('strips a malformed internal prelude after a validated leaked block', () => {
    const malformedPrelude = [
      '{',
      '  "taskIntent": "research",',
      '  "isBroadGoal":{',
      '  false,',
      '  "isLightweightDirectChat": false,',
      '}',
    ].join('\n')
    const input = `${VALID_LEAK}\n${malformedPrelude}\nAll five research bundles reviewed.`
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, true)
    assert.equal(cleaned, 'All five research bundles reviewed.')
  })

  it('leaves normal assistant text untouched', () => {
    const input = 'Your favorite color is blue.'
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, false)
    assert.equal(cleaned, input)
  })

  it('leaves a partial or unrelated JSON object alone', () => {
    // A bare object with one classifier-adjacent key but not the full shape
    // must NOT be stripped — the zod schema rejects it.
    const input = 'Prefix text. {"workType": "coding"} suffix.'
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, false)
    assert.equal(cleaned, input)
  })

  it('ignores malformed JSON that looks like a classifier leak', () => {
    const input = 'Malformed {"taskIntent": "research", "isDeliverableTask": [oops suffix.'
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, false)
    assert.equal(cleaned, input)
  })

  it('does not confuse braces inside strings', () => {
    const input = `Before {"label": "{not json}", ${VALID_LEAK.slice(1)} after`
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, true)
    assert.equal(cleaned.includes('taskIntent'), false)
  })

  it('rejects a classifier-like object with an invalid enum value', () => {
    // taskIntent must be one of the TaskIntent enum values. Garbage value is
    // rejected by safeParse so no stripping happens.
    const invalid = JSON.stringify({
      taskIntent: 'totally-made-up-intent',
      isDeliverableTask: false,
      isBroadGoal: false,
      hasHumanSignals: false,
      hasSignificantEvent: false,
      isResearchSynthesis: false,
      workType: 'general',
      explicitToolRequests: [],
      confidence: 0.5,
    })
    const input = `${invalid} not a real leak`
    const { cleaned, stripped } = stripLeakedClassificationJson(input)
    assert.equal(stripped, false)
    assert.equal(cleaned, input)
  })
})
