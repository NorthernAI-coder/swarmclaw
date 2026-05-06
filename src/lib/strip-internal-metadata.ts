/**
 * Shared utility for stripping internal metadata that leaks into streamed chat messages.
 *
 * Two categories:
 * 1. Classification JSON — the message classifier emits JSON with known internal keys
 *    that the main LLM sometimes echoes back.
 * 2. Loop detection messages — tool-loop-detection.ts produces warning/error strings
 *    that the LLM echoes verbatim.
 *
 * Importable from both client and server code.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Classification JSON
// ---------------------------------------------------------------------------

const INTERNAL_JSON_KEYS = [
  'factsUpsert', 'artifactsUpsert', 'planSteps', 'decisionsAppend',
  'blockersUpsert', 'questionsUpsert', 'hypothesesUpsert', 'supersedeIds',
  'taskIntent', 'isLightweightDirectChat', 'isDeliverableTask', 'quality_score',
  'isBroadGoal', 'hasHumanSignals', 'explicitToolRequests', 'isResearchSynthesis',
  'confidence', 'isIncomplete',
]

export const INTERNAL_KEY_RE = new RegExp(`"(?:${INTERNAL_JSON_KEYS.join('|')})"`)

const TaskIntentLikeSchema = z.enum(['coding', 'research', 'browsing', 'outreach', 'scheduling', 'general']).optional()
const WorkTypeLikeSchema = z.enum(['coding', 'research', 'writing', 'review', 'operations', 'general']).optional()

const WorkingStatePatchLikeSchema = z.object({
  factsUpsert: z.array(z.unknown()).optional(),
  artifactsUpsert: z.array(z.unknown()).optional(),
  planSteps: z.array(z.unknown()).optional(),
  decisionsAppend: z.array(z.unknown()).optional(),
  blockersUpsert: z.array(z.unknown()).optional(),
  questionsUpsert: z.array(z.unknown()).optional(),
  hypothesesUpsert: z.array(z.unknown()).optional(),
  supersedeIds: z.array(z.unknown()).optional(),
}).passthrough()

const MessageClassificationLikeSchema = z.object({
  taskIntent: TaskIntentLikeSchema,
  isLightweightDirectChat: z.boolean().optional(),
  isDeliverableTask: z.boolean().optional(),
  isBroadGoal: z.boolean().optional(),
  hasHumanSignals: z.boolean().optional(),
  hasSignificantEvent: z.boolean().optional(),
  explicitToolRequests: z.array(z.unknown()).optional(),
  isResearchSynthesis: z.boolean().optional(),
  workType: WorkTypeLikeSchema,
  confidence: z.number().optional(),
}).passthrough()

const ResponseCompletenessLikeSchema = z.object({
  isIncomplete: z.boolean(),
}).passthrough()

const QualityScoreLikeSchema = z.object({
  quality_score: z.number(),
  quality_reasoning: z.string().optional(),
}).passthrough()

interface InternalPayloadRule {
  schema: z.ZodType<unknown>
  distinctiveKeys: string[]
}

const INTERNAL_PAYLOAD_RULES: InternalPayloadRule[] = [
  {
    schema: WorkingStatePatchLikeSchema,
    distinctiveKeys: [
      'factsUpsert',
      'artifactsUpsert',
      'planSteps',
      'decisionsAppend',
      'blockersUpsert',
      'questionsUpsert',
      'hypothesesUpsert',
      'supersedeIds',
    ],
  },
  {
    schema: MessageClassificationLikeSchema,
    distinctiveKeys: [
      'isLightweightDirectChat',
      'isDeliverableTask',
      'isBroadGoal',
      'hasHumanSignals',
      'explicitToolRequests',
      'isResearchSynthesis',
    ],
  },
  {
    schema: ResponseCompletenessLikeSchema,
    distinctiveKeys: ['isIncomplete'],
  },
  {
    schema: QualityScoreLikeSchema,
    distinctiveKeys: ['quality_score'],
  },
]

function objectIsInternalMetadata(obj: Record<string, unknown>): boolean {
  for (const { schema, distinctiveKeys } of INTERNAL_PAYLOAD_RULES) {
    if (!distinctiveKeys.some((key) => key in obj)) continue
    if (schema.safeParse(obj).success) return true
  }
  return false
}

function isDistinctiveInternalKey(key: string): boolean {
  for (const { distinctiveKeys } of INTERNAL_PAYLOAD_RULES) {
    if (distinctiveKeys.includes(key)) return true
  }
  return false
}

function findBalancedJsonObjectEnd(text: string, start: number): number {
  if (text.charAt(start) !== '{') return -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const c = text.charAt(i)
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function parseQuotedKeyAt(text: string, start: number): { key: string; end: number } | null {
  if (text.charAt(start) !== '"') return null
  let key = ''
  let escaped = false
  for (let i = start + 1; i < text.length; i += 1) {
    const c = text.charAt(i)
    if (escaped) {
      key += c
      escaped = false
      continue
    }
    if (c === '\\') {
      escaped = true
      continue
    }
    if (c !== '"') {
      key += c
      continue
    }
    let cursor = i + 1
    while (cursor < text.length && /\s/.test(text.charAt(cursor))) cursor += 1
    if (text.charAt(cursor) !== ':') return null
    return { key, end: cursor + 1 }
  }
  return null
}

function lineHasDistinctiveInternalKey(line: string): boolean {
  for (let i = 0; i < line.length; i += 1) {
    const parsed = parseQuotedKeyAt(line, i)
    if (!parsed) continue
    if (isDistinctiveInternalKey(parsed.key)) return true
    i = parsed.end - 1
  }
  return false
}

function startsWithJsonLiteral(text: string, value: string): boolean {
  if (!text.startsWith(value)) return false
  const next = text.charAt(value.length)
  return next === '' || next === ',' || next === '}' || next === ']' || /\s/.test(next)
}

function isMalformedJsonFragmentLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  const first = trimmed.charAt(0)
  if (first === '{' || first === '}' || first === '[' || first === ']' || first === '"' || first === ',' || first === ':') {
    return true
  }
  if (startsWithJsonLiteral(trimmed, 'true')) return true
  if (startsWithJsonLiteral(trimmed, 'false')) return true
  if (startsWithJsonLiteral(trimmed, 'null')) return true
  if (trimmed.startsWith('...')) return true
  return false
}

function findInlineVisibleTextAfterClosingBrace(line: string): number {
  for (let i = 0; i < line.length; i += 1) {
    if (line.charAt(i) !== '}') continue
    let cursor = i + 1
    while (cursor < line.length && /\s/.test(line.charAt(cursor))) cursor += 1
    const next = line.charAt(cursor)
    if (!next || next === ',' || next === '}' || next === ']') continue
    return i + 1
  }
  return -1
}

function findMalformedInternalPreludeEnd(text: string): number {
  let leading = 0
  while (leading < text.length && /\s/.test(text.charAt(leading))) leading += 1
  if (text.charAt(leading) !== '{') return -1

  let cursor = leading
  let sawDistinctiveKey = false
  let consumedEnd = -1
  while (cursor < text.length) {
    const newlineAt = text.indexOf('\n', cursor)
    const lineEnd = newlineAt === -1 ? text.length : newlineAt
    const line = text.slice(cursor, lineEnd)
    if (lineHasDistinctiveInternalKey(line)) sawDistinctiveKey = true

    if (!isMalformedJsonFragmentLine(line)) {
      return sawDistinctiveKey && consumedEnd > leading ? consumedEnd : -1
    }

    const inlineEnd = sawDistinctiveKey ? findInlineVisibleTextAfterClosingBrace(line) : -1
    if (inlineEnd >= 0) return cursor + inlineEnd

    consumedEnd = newlineAt === -1 ? lineEnd : lineEnd + 1
    cursor = consumedEnd
  }

  return -1
}

function stripMalformedInternalPreludeAfterStrictStrip(text: string): string {
  const end = findMalformedInternalPreludeEnd(text)
  if (end < 0) return text
  return text.slice(end).trimStart()
}

/**
 * Remove top-level `{ ... }` blocks that contain known internal classification keys.
 * Handles nested and multi-line JSON. Only strips blocks where at least one
 * distinctive internal key is present and the payload passes schema validation.
 */
export function stripInternalJson(text: string): string {
  let out = text || ''
  let removedLeadingInternalJson = false
  for (let guard = 0; guard < 32; guard += 1) {
    let removed = false
    for (let i = 0; i < out.length; i += 1) {
      if (out.charAt(i) !== '{') continue
      const end = findBalancedJsonObjectEnd(out, i)
      if (end <= i) continue
      const candidate = out.slice(i, end)
      let parsed: unknown
      try {
        parsed = JSON.parse(candidate)
      } catch {
        continue
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      if (!objectIsInternalMetadata(parsed as Record<string, unknown>)) continue
      if (!out.slice(0, i).trim()) removedLeadingInternalJson = true
      out = (out.slice(0, i).replace(/\s+$/, '') + ' ' + out.slice(end).replace(/^\s+/, '')).trim()
      removed = true
      break
    }
    if (!removed) break
  }
  if (removedLeadingInternalJson) {
    out = stripMalformedInternalPreludeAfterStrictStrip(out)
  }
  return out
}

// ---------------------------------------------------------------------------
// Loop detection messages
// ---------------------------------------------------------------------------

/**
 * Matches all known loop detection message patterns from tool-loop-detection.ts.
 *
 * Patterns:
 * - Tool "X" called N times ...
 * - Tool "X" would be called N times ...
 * - Tool "X" is nearing overuse ...
 * - You called "X" N times with identical input ...
 * - "X" would repeat the same input N times ...
 * - "X" is about to repeat the same input N times ...
 * - Circuit breaker: "X" called N times ...
 * - Circuit breaker: "X" would be called N times ...
 * - Polling stall: "X" returned identical output N times ...
 * - Ping-pong: "X" and "Y" are alternating ...
 * - Ping-pong: "X" and "Y" may be stuck ...
 * - Output stagnation: last N / N of the last N ...
 * - Error convergence: N of the last N ...
 */
const LOOP_DETECTION_RE = new RegExp(
  [
    // Tool frequency: called / would be called / nearing overuse
    String.raw`Tool "[^"]*" (?:called|would be called) \d+ times[^\n]*`,
    String.raw`Tool "[^"]*" is nearing overuse[^\n]*`,
    // Generic repeat: "You called" (post-call) / "X" would repeat / is about to repeat (preview)
    String.raw`You called "[^"]*" \d+ times[^\n]*`,
    String.raw`"[^"]*" (?:would repeat the same input|is about to repeat the same input) \d+ times[^\n]*`,
    // Circuit breaker
    String.raw`Circuit breaker: "[^"]*" (?:called|would be called) \d+ times[^\n]*`,
    // Polling stall
    String.raw`Polling stall: "[^"]*" returned identical output \d+ times[^\n]*`,
    // Ping-pong
    String.raw`Ping-pong: "[^"]*" and "[^"]*" (?:are alternating|may be stuck)[^\n]*`,
    // Output stagnation
    String.raw`Output stagnation:[^\n]*`,
    // Error convergence
    String.raw`Error convergence:[^\n]*`,
  ].join('|'),
  'g',
)

/**
 * Matches loop detection messages wrapped in `[Error: ...]` brackets
 * (from the err SSE event handler in use-chat-store.ts).
 */
const LOOP_DETECTION_WRAPPED_RE = /\[Error: (?:Tool "[^"]*" (?:called|would be called) \d+ times|Tool "[^"]*" is nearing overuse|You called "[^"]*" \d+ times|"[^"]*" (?:would repeat the same input|is about to repeat the same input) \d+ times|Circuit breaker: "[^"]*" (?:called|would be called) \d+ times|Polling stall: "[^"]*" returned identical output \d+ times|Ping-pong: "[^"]*" and "[^"]*" (?:are alternating|may be stuck)|Output stagnation:|Error convergence:)[^\]]*\]/g

/** Remove loop detection messages that the LLM echoed from tool error results. */
export function stripLoopDetectionMessages(text: string): string {
  // Strip [Error: ...] wrapped versions first, before the inner regex eats the content
  return text.replace(LOOP_DETECTION_WRAPPED_RE, '').replace(LOOP_DETECTION_RE, '')
}

// ---------------------------------------------------------------------------
// Combined entry point
// ---------------------------------------------------------------------------

/** Strip all internal metadata (classification JSON + loop detection messages). */
export function stripAllInternalMetadata(text: string): string {
  let result = stripInternalJson(text)
  result = stripLoopDetectionMessages(result)
  return result
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
