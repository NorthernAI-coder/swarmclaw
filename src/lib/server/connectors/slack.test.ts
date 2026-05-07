import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shouldAcceptSlackMessageEvent } from './slack'

test('shouldAcceptSlackMessageEvent accepts peer bot text messages', () => {
  assert.equal(shouldAcceptSlackMessageEvent({
    type: 'message',
    text: 'Marian, can you review this?',
    user: 'U_PEER_AGENT',
    bot_id: 'B_PEER_AGENT',
  }, 'U_SELF_AGENT'), true)
})

test('shouldAcceptSlackMessageEvent still rejects self-loop messages', () => {
  assert.equal(shouldAcceptSlackMessageEvent({
    type: 'message',
    text: 'Loopback',
    user: 'U_SELF_AGENT',
    bot_id: 'B_SELF_AGENT',
  }, 'U_SELF_AGENT'), false)
})

test('shouldAcceptSlackMessageEvent rejects non-text message events', () => {
  assert.equal(shouldAcceptSlackMessageEvent({
    type: 'message',
    subtype: 'channel_join',
    user: 'U_PEER_AGENT',
  }, 'U_SELF_AGENT'), false)
})
