import type { ProviderDiagnosticStatus, ProviderDiagnosticStep } from '@/types/provider'

const SECRET_PREFIXES = [
  'sk-',
  'sk_',
  'gsk_',
  'hf_',
  'xai-',
  'or-',
  'pat_',
  'ghp_',
  'gho_',
  'AIza',
]

const MAX_DETAIL_LENGTH = 300
const MAX_TARGET_LENGTH = 220

function isSecretBoundary(char: string | undefined): boolean {
  if (!char) return true
  return char === ' ' || char === '\n' || char === '\r' || char === '\t'
    || char === '"' || char === "'" || char === '`'
    || char === ',' || char === ';' || char === ')' || char === ']'
    || char === '}' || char === '<' || char === '>'
}

export function sanitizeProviderDiagnosticText(value: unknown, maxLength = MAX_DETAIL_LENGTH): string {
  const input = typeof value === 'string' ? value : String(value ?? '')
  let out = ''
  for (let i = 0; i < input.length;) {
    const prefix = SECRET_PREFIXES.find((candidate) => input.startsWith(candidate, i))
    if (!prefix) {
      out += input[i]
      i++
      continue
    }

    let end = i + prefix.length
    while (end < input.length && !isSecretBoundary(input[end]) && end - i < 160) end++
    out += `${prefix}...`
    i = end
  }
  const collapsed = out.split(/\s+/).join(' ').trim()
  return collapsed.length > maxLength ? `${collapsed.slice(0, Math.max(0, maxLength - 1))}...` : collapsed
}

export function sanitizeProviderDiagnosticTarget(value: unknown): string {
  const raw = sanitizeProviderDiagnosticText(value, MAX_TARGET_LENGTH)
  try {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return sanitizeProviderDiagnosticText(url.toString(), MAX_TARGET_LENGTH)
  } catch {
    return raw
  }
}

export interface ProviderDiagnostics {
  add: (
    label: string,
    status: ProviderDiagnosticStatus,
    options?: {
      detail?: unknown
      target?: unknown
      durationMs?: number
    },
  ) => ProviderDiagnosticStep
  pass: (label: string, options?: { detail?: unknown; target?: unknown; durationMs?: number }) => ProviderDiagnosticStep
  warn: (label: string, options?: { detail?: unknown; target?: unknown; durationMs?: number }) => ProviderDiagnosticStep
  fail: (label: string, options?: { detail?: unknown; target?: unknown; durationMs?: number }) => ProviderDiagnosticStep
  toJSON: () => ProviderDiagnosticStep[]
}

export function createProviderDiagnostics(): ProviderDiagnostics {
  const steps: ProviderDiagnosticStep[] = []
  let sequence = 0

  function add(
    label: string,
    status: ProviderDiagnosticStatus,
    options: {
      detail?: unknown
      target?: unknown
      durationMs?: number
    } = {},
  ): ProviderDiagnosticStep {
    sequence++
    const step: ProviderDiagnosticStep = {
      id: `diag-${sequence}`,
      label: sanitizeProviderDiagnosticText(label, 80),
      status,
    }
    const detail = sanitizeProviderDiagnosticText(options.detail, MAX_DETAIL_LENGTH)
    const target = sanitizeProviderDiagnosticTarget(options.target)
    if (detail) step.detail = detail
    if (target) step.target = target
    if (typeof options.durationMs === 'number' && Number.isFinite(options.durationMs)) {
      step.durationMs = Math.max(0, Math.round(options.durationMs))
    }
    steps.push(step)
    return step
  }

  return {
    add,
    pass: (label, options) => add(label, 'pass', options),
    warn: (label, options) => add(label, 'warn', options),
    fail: (label, options) => add(label, 'fail', options),
    toJSON: () => steps.map((step) => ({ ...step })),
  }
}
