import * as React from 'react'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'

import { SUPPORTED_DEBANK_CHAIN_IDS } from '@/lib/chains'
import { fetchPortfolio, selectEligibleTokens } from '@/lib/debank/api'
import type { Token } from '@/lib/debank/types'

import { filterByMinValue, getTokenId } from '../utils'

interface UseTokensReturn {
  tokens210: Token[]
  tokens221: Token[]
  eoaTokens: Token[]
  loadingTokens: boolean
  tokenError: string | null
  fetchTokens: () => Promise<void>
  feeTokenOptions221: Token[]
  selectedFeeTokenId221: string | null
  setSelectedFeeTokenId221: (id: string | null) => void
  selectedFeeToken221: Token | null
}

export const useTokens = (
  nexusAddress210: Address | null,
  nexusAddress221: Address | null
): UseTokensReturn => {
  const { address: walletAddress } = useAccount()

  const [tokens210, setTokens210] = React.useState<Token[]>([])
  const [tokens221, setTokens221] = React.useState<Token[]>([])
  const [eoaTokens, setEoaTokens] = React.useState<Token[]>([])
  const [loadingTokens, setLoadingTokens] = React.useState(false)
  const [tokenError, setTokenError] = React.useState<string | null>(null)

  // Selected fee token for v2.2.1 (user selects from dropdown)
  const [selectedFeeTokenId221, setSelectedFeeTokenId221] = React.useState<string | null>(null)

  // Top 10 EOA tokens by USD value (for v2.2.1 fee token selection)
  const feeTokenOptions221 = React.useMemo(() => {
    return [...eoaTokens]
      .sort((a, b) => (b.amount * b.price) - (a.amount * a.price))
      .slice(0, 10)
  }, [eoaTokens])

  // Get the selected fee token object
  const selectedFeeToken221 = React.useMemo(() => {
    if (!selectedFeeTokenId221) return feeTokenOptions221[0] ?? null
    return feeTokenOptions221.find((t) => getTokenId(t) === selectedFeeTokenId221) ?? feeTokenOptions221[0] ?? null
  }, [selectedFeeTokenId221, feeTokenOptions221])

  // Auto-select first fee token when options change
  React.useEffect(() => {
    if (feeTokenOptions221.length > 0 && !selectedFeeTokenId221) {
      setSelectedFeeTokenId221(getTokenId(feeTokenOptions221[0]))
    }
  }, [feeTokenOptions221, selectedFeeTokenId221])

  // Reset selected fee token when wallet changes
  React.useEffect(() => {
    setSelectedFeeTokenId221(null)
  }, [walletAddress])

  const fetchTokens = React.useCallback(async () => {
    if (!nexusAddress210 && !nexusAddress221) {
      setTokens210([])
      setTokens221([])
      setEoaTokens([])
      return
    }

    setLoadingTokens(true)
    setTokenError(null)

    try {
      const chainIds = [...SUPPORTED_DEBANK_CHAIN_IDS]

      // Fetch tokens from both Nexus addresses in parallel
      const [portfolio210, portfolio221, eoaPortfolio] = await Promise.all([
        nexusAddress210 ? fetchPortfolio(nexusAddress210, chainIds) : Promise.resolve({ tokens: [] as Token[], totalBalance: null }),
        nexusAddress221 ? fetchPortfolio(nexusAddress221, chainIds) : Promise.resolve({ tokens: [] as Token[], totalBalance: null }),
        walletAddress ? fetchPortfolio(walletAddress, chainIds) : Promise.resolve({ tokens: [] as Token[], totalBalance: null }),
      ])

      // Apply min value filter to Nexus tokens (only sweep tokens worth > $0.1)
      setTokens210(filterByMinValue(selectEligibleTokens(portfolio210.tokens)))
      setTokens221(filterByMinValue(selectEligibleTokens(portfolio221.tokens)))
      // EOA tokens used for trigger don't need min value filter
      setEoaTokens(selectEligibleTokens(eoaPortfolio.tokens))
    } catch (error) {
      console.error('Failed to fetch tokens:', error)
      setTokenError('Failed to fetch token balances. Please try again.')
      setTokens210([])
      setTokens221([])
      setEoaTokens([])
    } finally {
      setLoadingTokens(false)
    }
  }, [nexusAddress210, nexusAddress221, walletAddress])

  // Fetch tokens when Nexus addresses are resolved
  React.useEffect(() => {
    if (nexusAddress210 || nexusAddress221) {
      void fetchTokens()
    }
  }, [nexusAddress210, nexusAddress221, fetchTokens])

  // Clear tokens when addresses are cleared
  React.useEffect(() => {
    if (!nexusAddress210 && !nexusAddress221) {
      setTokens210([])
      setTokens221([])
      setEoaTokens([])
    }
  }, [nexusAddress210, nexusAddress221])

  return {
    tokens210,
    tokens221,
    eoaTokens,
    loadingTokens,
    tokenError,
    fetchTokens,
    feeTokenOptions221,
    selectedFeeTokenId221,
    setSelectedFeeTokenId221,
    selectedFeeToken221,
  }
}
