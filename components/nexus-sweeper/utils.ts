import type { Token } from '@/lib/debank/types'
import { MEEVersion } from '@biconomy/abstractjs'

import { MAX_HISTORY_ENTRIES, MIN_TOKEN_USD_VALUE, SWEEP_HISTORY_KEY } from './constants'
import type { SelectedVersion, SweepHistoryEntry } from './types'

export const getTokenId = (token: Token): string => `${token.chain}-${token.id}`

export const filterByMinValue = (tokens: Token[]): Token[] =>
  tokens.filter((t) => t.amount * t.price >= MIN_TOKEN_USD_VALUE)

export const formatSupertxHash = (hash: string): string => {
  if (!hash || hash.length <= 12) return hash
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const loadSweepHistory = (): SweepHistoryEntry[] => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(SWEEP_HISTORY_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as SweepHistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveSweepHistory = (history: SweepHistoryEntry[]): void => {
  if (typeof window === 'undefined') return
  try {
    const trimmed = history.slice(0, MAX_HISTORY_ENTRIES)
    localStorage.setItem(SWEEP_HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore storage errors
  }
}

export const addToSweepHistory = (entry: SweepHistoryEntry): SweepHistoryEntry[] => {
  const current = loadSweepHistory()
  if (current.some((e) => e.hash === entry.hash)) return current
  const updated = [entry, ...current].slice(0, MAX_HISTORY_ENTRIES)
  saveSweepHistory(updated)
  return updated
}

/**
 * Maps a SelectedVersion string to the corresponding MEEVersion enum value.
 * Both V2_1_0 and V2_2_1 are supported generically.
 */
export const getMEEVersionFromSelected = (version: SelectedVersion): MEEVersion => {
  switch (version) {
    case '2.1.0':
      return MEEVersion.V2_1_0
    case '2.2.1':
      return MEEVersion.V2_2_1
    default:
      throw new Error(`Unsupported version: ${version}`)
  }
}
