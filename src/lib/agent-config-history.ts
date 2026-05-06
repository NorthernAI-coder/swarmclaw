import type { ConfigVersion } from '@/types/config-version'

export interface AgentConfigVersionSummary {
  id: string
  title: string
  subtitle: string
  meta: string
  createdAt: number
}

function snapshotString(snapshot: Record<string, unknown>, key: string): string {
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function formatAgentConfigVersionAge(createdAt: number, now = Date.now()): string {
  const ageMs = Math.max(0, now - createdAt)
  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function buildAgentConfigVersionSummary(
  version: ConfigVersion,
  now = Date.now(),
): AgentConfigVersionSummary {
  const snapshot = version.snapshot || {}
  const name = snapshotString(snapshot, 'name')
  const provider = snapshotString(snapshot, 'provider')
  const model = snapshotString(snapshot, 'model')
  const title = name || 'Previous agent settings'
  const subtitle = provider && model
    ? `${provider} / ${model}`
    : provider || model || 'No provider snapshot'

  return {
    id: version.id,
    title,
    subtitle,
    meta: `${formatAgentConfigVersionAge(version.createdAt, now)} by ${version.actor || 'user'}`,
    createdAt: version.createdAt,
  }
}
