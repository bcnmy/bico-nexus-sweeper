import * as React from 'react'
import { useAccount, useChainId, useSwitchChain, useWalletClient } from 'wagmi'
import { http, type Address, type Hex } from 'viem'
import {
  MEEVersion,
  getMEEVersion,
  toMultichainNexusAccount,
  createMeeClient,
} from '@biconomy/abstractjs'

import { getChainIdFromDebankId, isSupportedChainId, SUPPORTED_CHAINS } from '@/lib/chains'
import { getRpcUrl } from '@/lib/rpc'
import { buildSweepInstructions, fromDebankToken, type SweepToken } from '@/lib/sweep'
import type { Token } from '@/lib/debank/types'

import type { SelectedVersion, SweepHistoryEntry, SweepState } from '../types'
import { getMEEVersionFromSelected, sleep } from '../utils'

interface UseSweepParams {
  nexusAddress210: Address | null
  nexusAddress221: Address | null
  tokens210: Token[]
  tokens221: Token[]
  /** Fee token for v2.2.1 (always required) and v2.1.0 when only native tokens exist */
  selectedFeeToken: Token | null
  onSweepSuccess: (entry: SweepHistoryEntry) => void
  onTokensRefresh: () => void
}

interface UseSweepReturn {
  sweepState210: SweepState
  sweepError210: string | null
  supertxHash210: string | null
  sweepState221: SweepState
  sweepError221: string | null
  supertxHash221: string | null
  handleSweep: (version: SelectedVersion) => Promise<void>
  isAnySweepBusy: boolean
}

export const useSweep = ({
  nexusAddress210,
  nexusAddress221,
  tokens210,
  tokens221,
  selectedFeeToken,
  onSweepSuccess,
  onTokensRefresh,
}: UseSweepParams): UseSweepReturn => {
  const { address: walletAddress } = useAccount()
  const { data: walletClient } = useWalletClient()
  const currentChainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const [sweepState210, setSweepState210] = React.useState<SweepState>('idle')
  const [sweepError210, setSweepError210] = React.useState<string | null>(null)
  const [supertxHash210, setSupertxHash210] = React.useState<string | null>(null)

  const [sweepState221, setSweepState221] = React.useState<SweepState>('idle')
  const [sweepError221, setSweepError221] = React.useState<string | null>(null)
  const [supertxHash221, setSupertxHash221] = React.useState<string | null>(null)

  const handleSweep = React.useCallback(async (version: SelectedVersion) => {
    const isV210 = version === '2.1.0'
    const nexusAddress = isV210 ? nexusAddress210 : nexusAddress221
    const tokens = isV210 ? tokens210 : tokens221

    if (!walletClient || !nexusAddress || !walletAddress || tokens.length === 0) {
      return
    }

    const setSweepState = isV210 ? setSweepState210 : setSweepState221
    const setSweepError = isV210 ? setSweepError210 : setSweepError221
    const setSupertxHash = isV210 ? setSupertxHash210 : setSupertxHash221

    // Check if only native tokens exist (no ERC20)
    const hasErc20Tokens = tokens.some((t) => !t.isNative)
    // Use EOA mode when: v2.2.1 (always) OR v2.1.0 with only native tokens
    const useEoaMode = !isV210 || !hasErc20Tokens

    // For EOA mode, check if fee token is selected and switch chain if needed
    if (useEoaMode) {
      if (!selectedFeeToken) {
        setSweepError('Please select a fee token from your wallet.')
        return
      }
      const feeTokenChainId = getChainIdFromDebankId(selectedFeeToken.chain)
      if (!feeTokenChainId) {
        setSweepError('Invalid fee token chain.')
        return
      }
      // Switch chain if not on the fee token's chain
      if (currentChainId !== feeTokenChainId) {
        try {
          await switchChainAsync({ chainId: feeTokenChainId })
          // Continue with sweep after successful switch
        } catch {
          setSweepError('Failed to switch network. Please try again.')
          return
        }
      }
    }

    setSweepState('quote')
    setSweepError(null)
    setSupertxHash(null)

    try {
      const meeVersion = getMEEVersionFromSelected(version)

      // Get unique chain IDs from tokens
      const tokenChainIds = tokens.map((t) => getChainIdFromDebankId(t.chain)).filter(isSupportedChainId)

      // For EOA mode, also include the fee token's chain (needed for deployment lookup)
      if (useEoaMode && selectedFeeToken) {
        const feeChainId = getChainIdFromDebankId(selectedFeeToken.chain)
        if (feeChainId && isSupportedChainId(feeChainId)) {
          tokenChainIds.push(feeChainId)
        }
      }

      const uniqueChainIds = [...new Set(tokenChainIds)]

      // Build chain configurations with Alchemy RPCs
      const chainConfigurations = uniqueChainIds.map((chainId) => {
        const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId)!
        return {
          chain,
          transport: http(getRpcUrl(chainId)),
          version: getMEEVersion(meeVersion),
          versionCheck: false,
        }
      })

      console.log('chainConfigurations', chainConfigurations);

      // Create multichain Nexus account
      const nexusAccount = await toMultichainNexusAccount({
        signer: walletClient,
        chainConfigurations,
      })

      // Create MEE client
      const meeClient = await createMeeClient({
        account: nexusAccount,
      })

      // Convert DeBank tokens to normalized SweepToken format
      const sweepTokens: SweepToken[] = tokens
        .map((token) => {
          const chainId = getChainIdFromDebankId(token.chain)
          if (!isSupportedChainId(chainId)) return null
          return fromDebankToken(token, chainId)
        })
        .filter((t): t is SweepToken => t !== null)

      // Build sweep instructions using shared utility
      const instructions = await buildSweepInstructions(
        nexusAccount,
        walletAddress,
        sweepTokens
      )

      if (instructions.length === 0) {
        throw new Error('No tokens to sweep')
      }

      let hash: Hex

      if (useEoaMode && selectedFeeToken) {
        // EOA trigger mode: v2.2.1 OR v2.1.0 with only native tokens
        // Fee comes from EOA wallet, allowing full Nexus balance to be swept
        const feeTokenChainId = getChainIdFromDebankId(selectedFeeToken.chain)

        if (!feeTokenChainId || !selectedFeeToken.tokenAddress) {
          throw new Error('No valid fee token found')
        }

        const onChainQuote = await meeClient.getFusionQuote({
          instructions,
          feeToken: {
            address: selectedFeeToken.tokenAddress,
            chainId: feeTokenChainId,
          },
          trigger: {
            chainId: feeTokenChainId,
            tokenAddress: selectedFeeToken.tokenAddress,
            amount: 1n,
          },
        })

        // Sign on-chain quote (user signs here)
        setSweepState('awaiting-signature')
        const signedQuote = await meeClient.signOnChainQuote({ fusionQuote: onChainQuote })

        // Execute signed quote
        setSweepState('executing')
        const result = await meeClient.executeSignedQuote({ signedQuote })
        hash = result.hash
      } else {
        // Smart Account mode: v2.1.0 with ERC20 tokens available
        // Use first ERC20 token as fee (sorted by USD value from DeBank)
        const erc20Tokens = tokens.filter((t) => !t.isNative)
        const feeToken = erc20Tokens[0]
        const feeChainId = getChainIdFromDebankId(feeToken.chain)

        if (!feeChainId || !feeToken.tokenAddress) {
          throw new Error('No valid fee token found')
        }

        const quote = await meeClient.getQuote({
          instructions,
          feeToken: {
            address: feeToken.tokenAddress,
            chainId: feeChainId,
          },
        })

        // executeQuote handles signing and execution internally
        setSweepState('awaiting-signature')
        const result = await meeClient.executeQuote({ quote })
        setSweepState('executing')
        hash = result.hash
      }

      setSupertxHash(hash)

      await sleep(5000)
      const receipt = await meeClient.waitForSupertransactionReceipt({ hash })

      if (receipt.transactionStatus === 'MINED_SUCCESS') {
        setSweepState('success')
        onSweepSuccess({
          hash,
          timestamp: Date.now(),
          tokenCount: tokens.length,
          version,
        })
        setTimeout(() => onTokensRefresh(), 3000)
      } else {
        throw new Error(`Transaction failed: ${receipt.transactionStatus}`)
      }
    } catch (error) {
      console.error('Sweep failed:', error)
      setSweepState('error')
      setSweepError(error instanceof Error ? error.message : 'Sweep failed. Please try again.')
    }
  }, [walletClient, nexusAddress210, nexusAddress221, walletAddress, tokens210, tokens221, selectedFeeToken, currentChainId, switchChainAsync, onSweepSuccess, onTokensRefresh])

  // Reset sweep states when wallet disconnects or changes
  React.useEffect(() => {
    if (!walletAddress) {
      setSweepState210('idle')
      setSweepError210(null)
      setSupertxHash210(null)
      setSweepState221('idle')
      setSweepError221(null)
      setSupertxHash221(null)
    }
  }, [walletAddress])

  const isSweepBusy210 = sweepState210 === 'quote' || sweepState210 === 'awaiting-signature' || sweepState210 === 'executing'
  const isSweepBusy221 = sweepState221 === 'quote' || sweepState221 === 'awaiting-signature' || sweepState221 === 'executing'
  const isAnySweepBusy = isSweepBusy210 || isSweepBusy221

  return {
    sweepState210,
    sweepError210,
    supertxHash210,
    sweepState221,
    sweepError221,
    supertxHash221,
    handleSweep,
    isAnySweepBusy,
  }
}
