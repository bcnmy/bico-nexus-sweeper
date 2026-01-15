import type { Token } from '@/lib/debank/types'

export type SweepState = 'idle' | 'quote' | 'awaiting-signature' | 'executing' | 'success' | 'error'
export type SelectedVersion = '2.1.0' | '2.2.1'

export interface SweepHistoryEntry {
  hash: string
  timestamp: number
  tokenCount: number
  version: SelectedVersion
}

export interface SweepSectionProps {
  version: SelectedVersion
  tokens: Token[]
  canSweep: boolean
  feeTokenOptions?: Token[]
  selectedFeeTokenId?: string | null
  onFeeTokenChange?: (tokenId: string) => void
  loading: boolean
  error: string | null
  sweepState: SweepState
  sweepError: string | null
  supertxHash: string | null
  onRefresh: () => void
  onSweep: () => void
  disabled: boolean
}

export interface FeeTokenSelectorProps {
  tokens: Token[]
  selectedTokenId: string | null | undefined
  onSelect: (tokenId: string) => void
  disabled?: boolean
}
