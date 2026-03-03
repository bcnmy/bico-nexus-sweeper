import { zeroAddress, type Address } from 'viem'

import { DEBANK_API_BASE, DEBANK_HEADERS } from './constants'
import type { CompletePortfolio, PortfolioSummary, Token, TotalBalance } from './types'
import { getChainIdFromDebankId, isSupportedChainId } from '@/lib/chains'

const extractAddressFromValue = (value: string | null | undefined): Address | null => {
  if (!value) return null

  const trimmed = value.trim()
  if (trimmed.startsWith('0x') && trimmed.length === 42) {
    return trimmed.toLowerCase() as Address
  }

  const segments = trimmed.split(/[:_]/)
  for (const segment of segments) {
    const normalized = segment.trim()
    if (normalized.startsWith('0x') && normalized.length === 42) {
      return normalized.toLowerCase() as Address
    }
  }

  return null
}

const resolveTokenAddress = (token: Token): { address: Address | null; isNative: boolean } => {
  const directMatch = extractAddressFromValue(token.id)
  if (directMatch) return { address: directMatch, isNative: false }

  // Native token
  if (token.id === token.chain) {
    return { address: zeroAddress, isNative: true }
  }

  return { address: null, isNative: false }
}

export async function fetchPortfolio(address: Address, chainIds?: string[]): Promise<CompletePortfolio> {
  const chainParam = chainIds && chainIds.length > 0 ? `&chain_ids=${chainIds.join(',')}` : ''

  const [totalBalance, tokens] = await Promise.all([
    fetch(`${DEBANK_API_BASE}/user/total_balance?id=${address}`, { headers: DEBANK_HEADERS })
      .then((res) => res.json() as Promise<TotalBalance>),
    fetch(`${DEBANK_API_BASE}/user/all_token_list?id=${address}&is_all=true${chainParam}`, { headers: DEBANK_HEADERS })
      .then((res) => res.json() as Promise<Token[]>),
  ])

  const tokensWithAddress = tokens.map((token) => {
    const { address, isNative } = resolveTokenAddress(token)
    return {
      ...token,
      tokenAddress: address,
      isNative,
    }
  })

  return {
    totalBalance,
    tokens: tokensWithAddress,
  }
}

export function calculatePortfolioSummary(portfolio: CompletePortfolio): PortfolioSummary {
  const tokenValue = portfolio.tokens.reduce((sum, token) => sum + token.amount * token.price, 0)

  return {
    totalValue: portfolio.totalBalance?.total_usd_value ?? 0,
    tokenValue,
    tokenCount: portfolio.tokens.length,
  }
}

export function selectEligibleTokens(tokens: Token[], includeNative = true): Token[] {
  if (!tokens?.length) return []

  return [...tokens]
    .filter((token) => {
      // Only verified wallet tokens
      if (!token.is_verified || !token.is_wallet) return false

      // Must be on a supported chain
      const chainId = getChainIdFromDebankId(token.chain)
      if (!isSupportedChainId(chainId)) return false

      // Must have a valid token address
      if (!token.tokenAddress) return false

      // Optionally filter out native tokens
      if (!includeNative && token.tokenAddress === zeroAddress) return false

      // Must have positive balance
      if (token.amount <= 0) return false

      return true
    })
    // Sort by USD value descending (highest value first for fee token selection)
    .sort((a, b) => b.amount * b.price - a.amount * a.price)
}
