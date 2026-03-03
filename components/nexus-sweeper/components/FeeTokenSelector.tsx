import * as React from 'react'
import Image from 'next/image'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getChainIdFromDebankId, getChainName } from '@/lib/chains'
import type { Token } from '@/lib/debank/types'

import type { FeeTokenSelectorProps } from '../types'
import { getTokenId } from '../utils'

const renderTokenIcon = (token: Token) => {
  const tokenSymbol = token.display_symbol ?? token.symbol ?? token.name
  const initial = tokenSymbol?.charAt(0) ?? 'T'
  const tokenLogo = token.logo_url && token.logo_url.length > 0 ? token.logo_url : null

  return tokenLogo ? (
    <Image
      src={tokenLogo}
      alt={`${tokenSymbol} logo`}
      width={24}
      height={24}
      unoptimized
      className="h-6 w-6 rounded-full border border-slate-200 object-cover"
    />
  ) : (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
      {initial}
    </div>
  )
}

export const FeeTokenSelector: React.FC<FeeTokenSelectorProps> = ({
  tokens,
  selectedTokenId,
  onSelect,
  disabled,
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const selectedToken = React.useMemo(() => {
    if (!selectedTokenId) return tokens[0] ?? null
    return tokens.find((t) => getTokenId(t) === selectedTokenId) ?? tokens[0] ?? null
  }, [selectedTokenId, tokens])

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!selectedToken) return null

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-slate-500 mb-1.5">Fee Token (from your wallet)</label>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors',
          disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-slate-300 hover:bg-slate-50'
        )}
      >
        <div className="flex items-center gap-2.5">
          {renderTokenIcon(selectedToken)}
          <div>
            <span className="font-medium text-slate-900">
              {selectedToken.display_symbol ?? selectedToken.symbol}
            </span>
            <span className="ml-1.5 text-xs text-slate-500">
              {getChainName(getChainIdFromDebankId(selectedToken.chain) ?? 0)}
            </span>
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {tokens.map((token) => {
            const tokenId = getTokenId(token)
            const isSelected = tokenId === (selectedTokenId ?? getTokenId(tokens[0]))
            return (
              <button
                key={tokenId}
                type="button"
                onClick={() => {
                  onSelect(tokenId)
                  setIsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                )}
              >
                {renderTokenIcon(token)}
                <div>
                  <span className="font-medium text-slate-900">
                    {token.display_symbol ?? token.symbol}
                  </span>
                  <span className="ml-1.5 text-xs text-slate-500">
                    {getChainName(getChainIdFromDebankId(token.chain) ?? 0)}
                  </span>
                </div>
                {isSelected && <Check className="ml-auto h-4 w-4 text-emerald-600" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
