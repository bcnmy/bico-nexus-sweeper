import * as React from 'react'
import Link from 'next/link'
import { ArrowDown, ExternalLink, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatUSD } from '@/lib/utils'

import type { SweepSectionProps } from '../types'
import { formatSupertxHash } from '../utils'
import { TokenGrid } from './TokenGrid'
import { FeeTokenSelector } from './FeeTokenSelector'

export const SweepSection: React.FC<SweepSectionProps> = ({
  version,
  tokens,
  canSweep,
  feeTokenOptions,
  selectedFeeTokenId,
  onFeeTokenChange,
  loading,
  error,
  sweepState,
  sweepError,
  supertxHash,
  onRefresh,
  onSweep,
  disabled,
}) => {
  const isV221 = version === '2.2.1'
  const totalValue = tokens.reduce((sum, t) => sum + t.amount * t.price, 0)
  const isSweepBusy = sweepState === 'quote' || sweepState === 'awaiting-signature' || sweepState === 'executing'
  const meeScanUrl = supertxHash ? `https://meescan.biconomy.io/details/${supertxHash}` : null

  const statusMessage = {
    idle: null,
    quote: 'Building sweep transaction...',
    'awaiting-signature': 'Please sign the transaction in your wallet.',
    executing: 'Executing sweep...',
    success: null,
    error: null,
  }[sweepState]

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>Available Tokens</CardTitle>
          </div>
          {tokens.length > 0 && (
            <p className="text-slate-500 text-sm mt-1">
              Total: {formatUSD(totalValue)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading || disabled}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Link
            href="/manual"
            className="text-xs text-slate-500 hover:text-emerald-600 transition-colors"
          >
            Can&apos;t find tokens?
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading token balances...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No tokens found in your Nexus account.</p>
          </div>
        ) : (
          <>
            <TokenGrid tokens={tokens} />

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

            {/* When fee token selector is needed (v2.1.0 native-only) but no EOA tokens available */}
            {feeTokenOptions && feeTokenOptions.length === 0 && tokens.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                To sweep with v2.1.0 when you only have native tokens, you need a token in your <strong>connected wallet</strong> to pay for the transaction. Add some native token or USDC on a supported network, then click Refresh.
              </div>
            )}

            {/* Fee Token Selector - shown when feeTokenOptions is provided */}
            {feeTokenOptions && feeTokenOptions.length > 0 && onFeeTokenChange && (
              <FeeTokenSelector
                tokens={feeTokenOptions}
                selectedTokenId={selectedFeeTokenId}
                onSelect={onFeeTokenChange}
                disabled={isSweepBusy || disabled}
              />
            )}

            {/* Sweep Button */}
            <Button
              className={cn(
                'w-full h-12 text-base font-bold tracking-wide text-white transition-all hover:scale-[1.01] active:scale-[0.99] rounded-xl shadow-lg',
                isV221
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-500/20'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'
              )}
              disabled={isSweepBusy || !canSweep || disabled}
              onClick={onSweep}
            >
              {isSweepBusy ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {sweepState === 'quote' ? 'Building...' : sweepState === 'awaiting-signature' ? 'Sign in wallet...' : 'Executing...'}
                </>
              ) : (
                <>
                  <ArrowDown className="mr-2 h-5 w-5" />
                  Sweep {tokens.length} token{tokens.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
