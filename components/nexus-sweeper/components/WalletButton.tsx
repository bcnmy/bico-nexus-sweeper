'use client'

import * as React from 'react'
import Image from 'next/image'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ChevronDown, AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'

interface WalletButtonProps {
  showBalance?: boolean
}

export const WalletButton: React.FC<WalletButtonProps> = ({ showBalance = false }) => {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted
        const connected = ready && account && chain

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Connect Wallet
                  </button>
                )
              }

              const isUnsupportedChain = chain.unsupported

              return (
                <div className="flex items-center gap-2">
                  {/* Chain Button */}
                  <button
                    onClick={openChainModal}
                    type="button"
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                      isUnsupportedChain
                        ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    {isUnsupportedChain ? (
                      <>
                        <AlertTriangle className="h-4 w-4" />
                        <span>Wrong Network</span>
                      </>
                    ) : (
                      <>
                        {chain.hasIcon && chain.iconUrl && (
                          <Image
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            width={20}
                            height={20}
                            unoptimized
                            className="h-5 w-5 rounded-full"
                          />
                        )}
                        <span className="hidden sm:inline">{chain.name}</span>
                      </>
                    )}
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>

                  {/* Account Button */}
                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    {account.ensAvatar && (
                      <Image
                        alt="ENS Avatar"
                        src={account.ensAvatar}
                        width={20}
                        height={20}
                        unoptimized
                        className="h-5 w-5 rounded-full"
                      />
                    )}
                    <span>
                      {account.ensName ?? account.displayName}
                    </span>
                    {showBalance && account.displayBalance && (
                      <span className="text-slate-500">
                        ({account.displayBalance})
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              )
            })()}
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
