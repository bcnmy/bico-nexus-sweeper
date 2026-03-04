import * as React from 'react'
import Image from 'next/image'

import { formatUSD } from '@/lib/utils'
import { getChainIdFromDebankId, getChainName } from '@/lib/chains'
import type { Token } from '@/lib/debank/types'

interface TokenGridProps {
  tokens: Token[]
}

export const TokenGrid: React.FC<TokenGridProps> = ({ tokens }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {tokens.map((token) => {
      const tokenSymbol = token.display_symbol ?? token.symbol ?? token.name
      const usdValue = formatUSD(token.amount * token.price)
      const initial = tokenSymbol?.charAt(0) ?? 'T'
      const tokenLogo = token.logo_url && token.logo_url.length > 0 ? token.logo_url : null
      const chainName = getChainName(getChainIdFromDebankId(token.chain) ?? 0)

      return (
        <div
          key={`${token.chain}-${token.id}`}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm transition-colors hover:bg-slate-50"
        >
          <div className="relative h-10 w-10 shrink-0">
            {tokenLogo ? (
              <Image
                src={tokenLogo}
                alt={`${tokenSymbol} logo`}
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
                {initial}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-900">{tokenSymbol}</p>
            <p className="text-xs text-slate-500">{chainName}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900">{usdValue}</p>
            <p className="text-xs text-slate-500">{token.amount.toFixed(4)}</p>
          </div>
        </div>
      )
    })}
  </div>
)
