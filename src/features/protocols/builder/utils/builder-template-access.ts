import type { ProtocolTemplate } from '@/types'

export function isBuilderTemplateReadOnly(template: ProtocolTemplate | null | undefined): boolean {
  return Boolean(template?.builtIn)
}
