'use client'

import * as React from 'react'
import { useAccount, useChainId, useSwitchChain, useWalletClient } from 'wagmi'
import { createPublicClient, http, type Address, type Hex } from 'viem'
import { ArrowDown, ExternalLink, Loader2, Wallet } from 'lucide-react'
import {
  MEEVersion,
  getMEEVersion,
  toMultichainNexusAccount,
  createMeeClient,
} from '@biconomy/abstractjs'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getRpcUrl } from '@/lib/rpc'
import { buildSweepInstructions, fromTokenInfo, type SweepToken } from '@/lib/sweep'
import { SUPPORTED_CHAINS, SUPPORTED_DEBANK_CHAIN_IDS, isSupportedChainId, getChainIdFromDebankId, getDebankChainIdentifier } from '@/lib/chains'
import { fetchPortfolio, selectEligibleTokens } from '@/lib/debank/api'
import type { Token } from '@/lib/debank/types'
import { fetchTokenInfo, type TokenInfo } from '@/lib/tokens'

import {
  SmartAccountCopyButton,
  WalletButton,
  VersionSelector,
  FeeTokenSelector,
  SweepHistory,
} from './components'
import { TokenInput } from './components/TokenInput'
import { ManualTokenList } from './components/ManualTokenList'
import { useNexusAccounts, useSweepHistory } from './hooks'
import type { SelectedVersion, SweepState } from './types'
import { formatSupertxHash, getMEEVersionFromSelected, getTokenId, sleep } from './utils'

export const ManualSweeper: React.FC = () => {
  const { isConnected, address: walletAddress } = useAccount()
  const { data: walletClient } = useWalletClient()
  const currentChainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const [selectedVersion, setSelectedVersion] = React.useState<SelectedVersion>('2.1.0')
  const [manualTokens, setManualTokens] = React.useState<TokenInfo[]>([])

  // EOA tokens for fee token selection (v2.2.1)
  const [eoaTokens, setEoaTokens] = React.useState<Token[]>([])
  const [loadingEoaTokens, setLoadingEoaTokens] = React.useState(false)
  const [selectedFeeTokenId, setSelectedFeeTokenId] = React.useState<string | null>(null)

  // Sweep state
  const [sweepState, setSweepState] = React.useState<SweepState>('idle')
  const [sweepError, setSweepError] = React.useState<string | null>(null)
  const [supertxHash, setSupertxHash] = React.useState<string | null>(null)

  const {
    nexusAddress210,
    nexusAddress221,
    resolvingAccount,
    accountError,
  } = useNexusAccounts()

  const { sweepHistory, addEntry } = useSweepHistory()

  const isV210 = selectedVersion === '2.1.0'
  const nexusAddress = isV210 ? nexusAddress210 : nexusAddress221

  // Fee token options (top 10 EOA tokens by USD)
  const feeTokenOptions = React.useMemo(() => {
    return [...eoaTokens]
      .sort((a, b) => (b.amount * b.price) - (a.amount * a.price))
      .slice(0, 10)
  }, [eoaTokens])

  const selectedFeeToken = React.useMemo(() => {
    if (!selectedFeeTokenId) return feeTokenOptions[0] ?? null
    return feeTokenOptions.find((t) => getTokenId(t) === selectedFeeTokenId) ?? feeTokenOptions[0] ?? null
  }, [selectedFeeTokenId, feeTokenOptions])

  // Auto-select first fee token
  React.useEffect(() => {
    if (feeTokenOptions.length > 0 && !selectedFeeTokenId) {
      setSelectedFeeTokenId(getTokenId(feeTokenOptions[0]))
    }
  }, [feeTokenOptions, selectedFeeTokenId])

  // Fetch EOA tokens for fee selection
  const fetchEoaTokens = React.useCallback(async () => {
    if (!walletAddress) return

    setLoadingEoaTokens(true)
    try {
      const chainIds = [...SUPPORTED_DEBANK_CHAIN_IDS]
      const portfolio = await fetchPortfolio(walletAddress, chainIds)
      setEoaTokens(selectEligibleTokens(portfolio.tokens))
    } catch (error) {
      console.error('Failed to fetch EOA tokens:', error)
    } finally {
      setLoadingEoaTokens(false)
    }
  }, [walletAddress])

  // Fetch EOA tokens on mount
  React.useEffect(() => {
    if (walletAddress) {
      void fetchEoaTokens()
    }
  }, [walletAddress, fetchEoaTokens])

  // Clear manual tokens when version changes
  React.useEffect(() => {
    setManualTokens([])
    setSweepState('idle')
    setSweepError(null)
    setSupertxHash(null)
  }, [selectedVersion])

  // Reset when wallet changes
  React.useEffect(() => {
    if (!walletAddress) {
      setManualTokens([])
      setEoaTokens([])
      setSelectedFeeTokenId(null)
      setSweepState('idle')
      setSweepError(null)
      setSupertxHash(null)
    }
  }, [walletAddress])

  // Add token handler
  const handleAddToken = async (chainId: number, tokenAddress: string) => {
    if (!nexusAddress) {
      throw new Error('Smart account not resolved')
    }

    // Check for duplicates
    const exists = manualTokens.some(
      (t) => t.chainId === chainId && t.address.toLowerCase() === tokenAddress.toLowerCase()
    )
    if (exists) {
      throw new Error('Token already added')
    }

    const tokenInfo = await fetchTokenInfo(chainId, tokenAddress as Address, nexusAddress)
    setManualTokens((prev) => [...prev, tokenInfo])
  }

  // Remove token handler
  const handleRemoveToken = (index: number) => {
    setManualTokens((prev) => prev.filter((_, i) => i !== index))
  }

  // Sweep handler
  const handleSweep = async () => {
    if (!walletClient || !nexusAddress || !walletAddress || manualTokens.length === 0) {
      return
    }

    // Filter tokens that can be swept (have balance AND on supported chain)
    const tokensToSweep = manualTokens.filter((t) => t.balance > 0n && t.isSupported)
    if (tokensToSweep.length === 0) {
      setSweepError('No sweepable tokens. Tokens must have balance and be on a supported chain.')
      return
    }

    // Check if only native tokens exist (no ERC20)
    const hasErc20Tokens = tokensToSweep.some((t) => !t.isNative)
    // Use EOA mode when: v2.2.1 (always) OR v2.1.0 with only native tokens
    const useEoaMode = !isV210 || !hasErc20Tokens

    // For EOA mode, check fee token and switch chain if needed
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
      const meeVersion = getMEEVersionFromSelected(selectedVersion)

      // Get unique chain IDs from tokens
      const tokenChainIds = tokensToSweep.map((t) => t.chainId).filter(isSupportedChainId)

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

      // Create multichain Nexus account
      const nexusAccount = await toMultichainNexusAccount({
        signer: walletClient,
        chainConfigurations,
      })

      // Create MEE client
      const meeClient = await createMeeClient({
        account: nexusAccount,
      })

      // Refetch native token balances to get the latest values
      // (ERC20 tokens use runtimeERC20BalanceOf which handles this at execution time)
      const updatedTokens = await Promise.all(
        tokensToSweep
          .filter((t) => isSupportedChainId(t.chainId))
          .map(async (token) => {
            if (token.isNative) {
              // Refetch native balance to get the latest value
              const chain = SUPPORTED_CHAINS.find((c) => c.id === token.chainId)!
              const client = createPublicClient({
                chain,
                transport: http(getRpcUrl(token.chainId)),
              })
              const latestBalance = await client.getBalance({ address: nexusAddress })
              return { ...token, balance: latestBalance }
            }
            return token
          })
      )

      // Convert manual tokens to normalized SweepToken format
      const sweepTokens: SweepToken[] = updatedTokens.map((token) => fromTokenInfo(token))

      // Build sweep instructions using shared utility (same as auto mode)
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

        setSweepState('awaiting-signature')
        const signedQuote = await meeClient.signOnChainQuote({ fusionQuote: onChainQuote })

        setSweepState('executing')
        const result = await meeClient.executeSignedQuote({ signedQuote })
        hash = result.hash
      } else {
        // Smart Account mode: v2.1.0 with ERC20 tokens available
        // Use first ERC20 token as fee
        const erc20Tokens = tokensToSweep.filter((t) => !t.isNative)
        const feeToken = erc20Tokens[0]

        const quote = await meeClient.getQuote({
          instructions,
          feeToken: {
            address: feeToken.address,
            chainId: feeToken.chainId,
          },
        })

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
        // Record to history
        addEntry({
          hash,
          timestamp: Date.now(),
          tokenCount: tokensToSweep.length,
          version: selectedVersion,
        })
        // Clear tokens after successful sweep
        setTimeout(() => setManualTokens([]), 3000)
      } else {
        throw new Error(`Transaction failed: ${receipt.transactionStatus}`)
      }
    } catch (error) {
      console.error('Sweep failed:', error)
      setSweepState('error')
      setSweepError(error instanceof Error ? error.message : 'Sweep failed. Please try again.')
    }
  }

  const isSweepBusy = sweepState === 'quote' || sweepState === 'awaiting-signature' || sweepState === 'executing'
  // Only sweep tokens that are on supported chains AND have balance
  const sweepableTokens = manualTokens.filter((t) => t.balance > 0n && t.isSupported)
  // Check if only native tokens exist in sweepable tokens
  const onlyNativeTokens = sweepableTokens.length > 0 && sweepableTokens.every((t) => t.isNative)
  // Show fee selector when: v2.2.1 OR v2.1.0 with only native tokens
  const needsFeeSelector = !isV210 || onlyNativeTokens
  // Can sweep if: has tokens AND (doesn't need fee selector OR has fee options)
  const canSweep = sweepableTokens.length > 0 && (!needsFeeSelector || feeTokenOptions.length > 0)

  const meeScanUrl = supertxHash ? `https://meescan.biconomy.io/details/${supertxHash}` : null

  // Filter history by selected version
  const filteredHistory = React.useMemo(() => {
    return sweepHistory.filter((entry) => entry.version === selectedVersion)
  }, [sweepHistory, selectedVersion])

  const statusMessage = {
    idle: null,
    quote: 'Building sweep transaction...',
    'awaiting-signature': 'Please sign the transaction in your wallet.',
    executing: 'Executing sweep...',
    success: null,
    error: null,
  }[sweepState]

  // Not connected state
  if (!isConnected) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600">
              <Wallet className="h-8 w-8" />
            </div>
          </div>
          <CardTitle className="text-lg normal-case">Connect Your Wallet</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <p className="text-slate-500">
            Connect your wallet to manually sweep tokens from your Nexus account.
          </p>
          <div className="flex justify-center">
            <WalletButton />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Manual Sweep</h1>
          <p className="text-slate-500 text-sm mt-1">Manually specify tokens to sweep</p>
        </div>
        <div className="shrink-0">
          <WalletButton />
        </div>
      </div>

      {/* Smart Account Info */}
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle>Smart Account</CardTitle>
          <VersionSelector
            selectedVersion={selectedVersion}
            onVersionChange={setSelectedVersion}
          />
        </CardHeader>
        <CardContent>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Address
              </span>
              {resolvingAccount ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resolving...
                </div>
              ) : accountError ? (
                <span className="text-sm text-rose-600">{accountError}</span>
              ) : (
                <span className="font-mono text-sm font-medium text-slate-700">
                  {nexusAddress ?? '—'}
                </span>
              )}
            </div>
            <SmartAccountCopyButton address={nexusAddress} />
          </div>
        </CardContent>
      </Card>

      {/* Token Input & List */}
      <Card>
        <CardHeader>
          <CardTitle>Tokens to Sweep</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TokenInput
            onAdd={handleAddToken}
            disabled={!nexusAddress || isSweepBusy}
          />

          <ManualTokenList
            tokens={manualTokens}
            onRemove={handleRemoveToken}
            disabled={isSweepBusy}
          />

          {manualTokens.length > 0 && (
            <>
              {/* Status Messages */}
              {statusMessage && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {statusMessage}
                </div>
              )}

              {/* Supertransaction Hash */}
              {supertxHash && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">Supertransaction</span>
                    <span
                      className={cn(
                        'font-semibold',
                        sweepState === 'success' ? 'text-emerald-600' : sweepState === 'error' ? 'text-rose-600' : 'text-slate-600'
                      )}
                    >
                      {sweepState === 'success' ? 'Success' : sweepState === 'error' ? 'Failed' : 'Pending'}
                    </span>
                  </div>
                  {meeScanUrl && (
                    <a
                      className="mt-1 inline-flex items-center gap-1 font-mono text-sm font-medium text-slate-700 underline-offset-4 transition-colors hover:text-slate-900 hover:underline"
                      href={meeScanUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {formatSupertxHash(supertxHash)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Error Message */}
              {sweepError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                  {sweepError}
                </div>
              )}

              {/* Fee Token Selector - shown for v2.2.1 or v2.1.0 with only native tokens */}
              {needsFeeSelector && feeTokenOptions.length > 0 && (
                <FeeTokenSelector
                  tokens={feeTokenOptions}
                  selectedTokenId={selectedFeeTokenId}
                  onSelect={setSelectedFeeTokenId}
                  disabled={isSweepBusy}
                />
              )}

              {/* Sweep Button */}
              <Button
                className={cn(
                  'w-full h-12 text-base font-bold tracking-wide text-white transition-all hover:scale-[1.01] active:scale-[0.99] rounded-xl shadow-lg',
                  isV210
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-500/20'
                )}
                disabled={isSweepBusy || !canSweep || !nexusAddress}
                onClick={handleSweep}
              >
                {isSweepBusy ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {sweepState === 'quote' ? 'Building...' : sweepState === 'awaiting-signature' ? 'Sign in wallet...' : 'Executing...'}
                  </>
                ) : (
                  <>
                    <ArrowDown className="mr-2 h-5 w-5" />
                    Sweep {sweepableTokens.length} token{sweepableTokens.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sweep History for Selected Version */}
      <SweepHistory
        history={filteredHistory}
        supertxHash210={isV210 ? supertxHash : null}
        supertxHash221={isV210 ? null : supertxHash}
        sweepState210={isV210 ? sweepState : 'idle'}
        sweepState221={isV210 ? 'idle' : sweepState}
      />
    </div>
  )
}
