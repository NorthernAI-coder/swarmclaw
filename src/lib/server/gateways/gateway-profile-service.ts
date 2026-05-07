import type { Agent, AgentRoutingTarget, GatewayProfile, OpenClawDeploymentConfig, OpenClawGatewayStats } from '@/types'

import { genId } from '@/lib/id'
import { normalizeOpenClawEndpoint } from '@/lib/openclaw/openclaw-endpoint'
import { listAgents, saveAgentMany } from '@/lib/server/agents/agent-repository'
import { getGatewayProfiles } from '@/lib/server/agents/agent-runtime-config'
import { deleteCredentialRecord } from '@/lib/server/credentials/credential-service'
import {
  loadGatewayProfile,
  loadGatewayProfiles,
  saveGatewayProfiles,
} from '@/lib/server/gateways/gateway-profile-repository'
import { notify } from '@/lib/server/ws-hub'

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeLifecycleState(value: unknown): NonNullable<GatewayProfile['lifecycleState']> {
  return value === 'draining' || value === 'cordoned' ? value : 'active'
}

function normalizeControlAction(value: unknown): GatewayProfile['lastControlAction'] {
  return value === 'activate' || value === 'drain' || value === 'cordon' || value === 'restart'
    ? value
    : null
}

function normalizeControlRequest(value: unknown): GatewayProfile['controlRequest'] {
  if (!value || typeof value !== 'object') return null
  const request = value as Record<string, unknown>
  const requestedAt = normalizeNullableNumber(request.requestedAt)
  if (request.action !== 'restart' || !requestedAt) return null
  return {
    action: 'restart',
    requestedAt,
    source: 'swarmclaw',
    reason: normalizeText(request.reason),
  }
}

function normalizeDeployment(value: unknown): OpenClawDeploymentConfig | null {
  if (!value || typeof value !== 'object') return null
  const deployment = value as Record<string, unknown>
  return {
    method: normalizeText(deployment.method) as OpenClawDeploymentConfig['method'],
    provider: normalizeText(deployment.provider) as OpenClawDeploymentConfig['provider'],
    remoteTarget: normalizeText(deployment.remoteTarget) as OpenClawDeploymentConfig['remoteTarget'],
    useCase: normalizeText(deployment.useCase) as OpenClawDeploymentConfig['useCase'],
    exposure: normalizeText(deployment.exposure) as OpenClawDeploymentConfig['exposure'],
    managedBy: normalizeText(deployment.managedBy) as OpenClawDeploymentConfig['managedBy'],
    localInstanceId: normalizeText(deployment.localInstanceId),
    localPort: normalizeNullableNumber(deployment.localPort),
    targetHost: normalizeText(deployment.targetHost),
    sshHost: normalizeText(deployment.sshHost),
    sshUser: normalizeText(deployment.sshUser),
    sshPort: normalizeNullableNumber(deployment.sshPort),
    sshKeyPath: normalizeText(deployment.sshKeyPath),
    sshTargetDir: normalizeText(deployment.sshTargetDir),
    image: normalizeText(deployment.image),
    version: normalizeText(deployment.version),
    lastDeployAt: normalizeNullableNumber(deployment.lastDeployAt),
    lastDeployAction: normalizeText(deployment.lastDeployAction),
    lastDeployProcessId: normalizeText(deployment.lastDeployProcessId),
    lastDeploySummary: normalizeText(deployment.lastDeploySummary),
    lastVerifiedAt: normalizeNullableNumber(deployment.lastVerifiedAt),
    lastVerifiedOk: typeof deployment.lastVerifiedOk === 'boolean' ? deployment.lastVerifiedOk : null,
    lastVerifiedMessage: normalizeText(deployment.lastVerifiedMessage),
    lastBackupPath: normalizeText(deployment.lastBackupPath),
  }
}

function normalizeStats(value: unknown): OpenClawGatewayStats | null {
  if (!value || typeof value !== 'object') return null
  const stats = value as Record<string, unknown>
  return {
    nodeCount: normalizeNullableNumber(stats.nodeCount) ?? undefined,
    connectedNodeCount: normalizeNullableNumber(stats.connectedNodeCount) ?? undefined,
    pendingNodePairings: normalizeNullableNumber(stats.pendingNodePairings) ?? undefined,
    pairedDeviceCount: normalizeNullableNumber(stats.pairedDeviceCount) ?? undefined,
    pendingDevicePairings: normalizeNullableNumber(stats.pendingDevicePairings) ?? undefined,
    externalRuntimeCount: normalizeNullableNumber(stats.externalRuntimeCount) ?? undefined,
    sessionCount: normalizeNullableNumber(stats.sessionCount) ?? undefined,
    presenceCount: normalizeNullableNumber(stats.presenceCount) ?? undefined,
    environmentCount: normalizeNullableNumber(stats.environmentCount) ?? undefined,
    availableEnvironmentCount: normalizeNullableNumber(stats.availableEnvironmentCount) ?? undefined,
    lastTopologyCheckedAt: normalizeNullableNumber(stats.lastTopologyCheckedAt) ?? undefined,
    lastTopologyErrorCount: normalizeNullableNumber(stats.lastTopologyErrorCount) ?? undefined,
    lastTopologyError: normalizeText(stats.lastTopologyError),
  }
}

export function listOpenClawGatewayProfiles(): GatewayProfile[] {
  return getGatewayProfiles('openclaw')
}

export function getGatewayProfileById(id: string): GatewayProfile | null {
  return loadGatewayProfile(id)
}

export function createGatewayProfile(input: Record<string, unknown>): GatewayProfile {
  const now = Date.now()
  const gateways = loadGatewayProfiles()
  const id = typeof input.id === 'string' && input.id.trim() ? input.id : `gateway-${genId()}`
  const isDefault = input.isDefault === true

  if (isDefault) {
    for (const gateway of Object.values(gateways)) {
      if (gateway) gateway.isDefault = false
    }
  }

  const profile: GatewayProfile = {
    id,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'OpenClaw Gateway',
    provider: 'openclaw',
    endpoint: normalizeOpenClawEndpoint(typeof input.endpoint === 'string' ? input.endpoint : undefined),
    wsUrl: normalizeText(input.wsUrl),
    credentialId: normalizeText(input.credentialId),
    status: typeof input.status === 'string' && input.status.trim() ? input.status as GatewayProfile['status'] : 'unknown',
    lifecycleState: normalizeLifecycleState(input.lifecycleState),
    lastControlAction: normalizeControlAction(input.lastControlAction),
    lastControlActionAt: normalizeNullableNumber(input.lastControlActionAt),
    lastControlReason: normalizeText(input.lastControlReason),
    controlRequest: normalizeControlRequest(input.controlRequest),
    notes: typeof input.notes === 'string' ? input.notes : null,
    tags: normalizeTags(input.tags),
    lastError: null,
    lastCheckedAt: null,
    lastModelCount: null,
    discoveredHost: typeof input.discoveredHost === 'string' ? input.discoveredHost : null,
    discoveredPort: typeof input.discoveredPort === 'number' ? input.discoveredPort : null,
    deployment: normalizeDeployment(input.deployment),
    stats: normalizeStats(input.stats),
    isDefault,
    createdAt: now,
    updatedAt: now,
  }

  gateways[id] = profile
  saveGatewayProfiles(gateways)
  notify('gateways')
  return profile
}

export function updateGatewayProfile(id: string, input: Record<string, unknown>): GatewayProfile | null {
  const gateways = loadGatewayProfiles()
  const gateway = gateways[id]
  if (!gateway) return null

  // Clear isDefault on other gateways if this one is becoming default
  if (input.isDefault === true) {
    for (const [candidateId, g] of Object.entries(gateways)) {
      if (candidateId !== id && g) g.isDefault = false
    }
  }

  // Apply all field updates to the target gateway
  if (input.name !== undefined) gateway.name = String(input.name || '').trim() || gateway.name
  if (input.endpoint !== undefined) gateway.endpoint = normalizeOpenClawEndpoint(typeof input.endpoint === 'string' ? input.endpoint : undefined)
  if (input.wsUrl !== undefined) gateway.wsUrl = normalizeText(input.wsUrl)
  if (input.credentialId !== undefined) gateway.credentialId = normalizeText(input.credentialId)
  if (input.status !== undefined) {
    const nextStatus = typeof input.status === 'string' && input.status.trim()
      ? input.status.trim() as GatewayProfile['status']
      : 'unknown'
    gateway.status = nextStatus
  }
  if (input.lifecycleState !== undefined) gateway.lifecycleState = normalizeLifecycleState(input.lifecycleState)
  if (input.lastControlAction !== undefined) gateway.lastControlAction = normalizeControlAction(input.lastControlAction)
  if (input.lastControlActionAt !== undefined) gateway.lastControlActionAt = normalizeNullableNumber(input.lastControlActionAt)
  if (input.lastControlReason !== undefined) gateway.lastControlReason = normalizeText(input.lastControlReason)
  if (input.controlRequest !== undefined) gateway.controlRequest = normalizeControlRequest(input.controlRequest)
  if (input.notes !== undefined) gateway.notes = typeof input.notes === 'string' ? input.notes : null
  if (input.tags !== undefined) gateway.tags = normalizeTags(input.tags)
  if (input.lastError !== undefined) gateway.lastError = typeof input.lastError === 'string' ? input.lastError : null
  if (input.lastCheckedAt !== undefined) gateway.lastCheckedAt = normalizeNullableNumber(input.lastCheckedAt)
  if (input.lastModelCount !== undefined) gateway.lastModelCount = normalizeNullableNumber(input.lastModelCount)
  if (input.discoveredHost !== undefined) gateway.discoveredHost = typeof input.discoveredHost === 'string' ? input.discoveredHost : null
  if (input.discoveredPort !== undefined) gateway.discoveredPort = normalizeNullableNumber(input.discoveredPort)
  if (input.deployment !== undefined) gateway.deployment = { ...(gateway.deployment || {}), ...(normalizeDeployment(input.deployment) || {}) }
  if (input.stats !== undefined) gateway.stats = { ...(gateway.stats || {}), ...(normalizeStats(input.stats) || {}) }
  if (input.isDefault !== undefined) gateway.isDefault = input.isDefault === true
  gateway.updatedAt = Date.now()

  gateways[id] = gateway
  saveGatewayProfiles(gateways)
  notify('gateways')
  return gateway
}

export function controlGatewayProfile(
  id: string,
  input: { action: NonNullable<GatewayProfile['lastControlAction']>; reason?: string | null },
  now = Date.now(),
): GatewayProfile | null {
  const gateways = loadGatewayProfiles()
  const gateway = gateways[id]
  if (!gateway) return null

  const action = normalizeControlAction(input.action)
  if (!action) return null

  gateway.lifecycleState = action === 'drain'
    ? 'draining'
    : action === 'cordon'
      ? 'cordoned'
      : action === 'activate'
        ? 'active'
        : normalizeLifecycleState(gateway.lifecycleState)
  gateway.lastControlAction = action
  gateway.lastControlActionAt = now
  gateway.lastControlReason = normalizeText(input.reason)
  gateway.controlRequest = action === 'restart'
    ? {
        action: 'restart',
        requestedAt: now,
        source: 'swarmclaw',
        reason: normalizeText(input.reason),
      }
    : null
  gateway.updatedAt = now

  gateways[id] = gateway
  saveGatewayProfiles(gateways)
  notify('gateways')
  return gateway
}

export function deleteGatewayProfileAndDetachAgents(id: string): boolean {
  const gateways = loadGatewayProfiles()
  const deleted = gateways[id]
  if (!deleted) return false
  const orphanCredentialId = deleted.credentialId || null
  delete gateways[id]
  saveGatewayProfiles(gateways)

  const agents = listAgents({ includeTrashed: true })
  const changed: Array<[string, Agent]> = []
  for (const agent of Object.values(agents)) {
    let nextAgent: Agent | null = null

    if (agent.gatewayProfileId === id) {
      nextAgent = {
        ...agent,
        gatewayProfileId: null,
      }
    }

    if (Array.isArray(agent.routingTargets)) {
      const nextTargets = agent.routingTargets.map((target: AgentRoutingTarget) => (
        target.gatewayProfileId === id
          ? { ...target, gatewayProfileId: null }
          : target
      ))
      if (JSON.stringify(nextTargets) !== JSON.stringify(agent.routingTargets)) {
        nextAgent = {
          ...(nextAgent || agent),
          routingTargets: nextTargets,
        }
      }
    }

    if (nextAgent) changed.push([nextAgent.id, nextAgent])
  }

  if (changed.length > 0) saveAgentMany(changed)

  // Clean up orphaned credential if no other gateway or agent references it
  if (orphanCredentialId) {
    const stillReferencedByGateway = Object.values(gateways).some(
      (gw) => gw && gw.credentialId === orphanCredentialId,
    )
    const stillReferencedByAgent = !stillReferencedByGateway && Object.values(agents).some(
      (a) => a.credentialId === orphanCredentialId
        || (Array.isArray(a.fallbackCredentialIds) && a.fallbackCredentialIds.includes(orphanCredentialId)),
    )
    if (!stillReferencedByGateway && !stillReferencedByAgent) {
      deleteCredentialRecord(orphanCredentialId)
    }
  }

  notify('gateways')
  return true
}
