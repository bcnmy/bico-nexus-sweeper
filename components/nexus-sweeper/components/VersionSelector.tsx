import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { SelectedVersion } from '../types'

interface VersionSelectorProps {
  selectedVersion: SelectedVersion
  onVersionChange: (version: SelectedVersion) => void
}

const versions: SelectedVersion[] = ['2.1.0', '2.2.1']

export const VersionSelector: React.FC<VersionSelectorProps> = ({
  selectedVersion,
  onVersionChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

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

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-left transition-all',
          selectedVersion === '2.1.0'
            ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-300'
            : 'border-indigo-200 bg-indigo-50 hover:border-indigo-300'
        )}
      >
        <span className={cn(
          'text-base font-bold',
          selectedVersion === '2.1.0' ? 'text-emerald-700' : 'text-indigo-700'
        )}>
          v{selectedVersion}
        </span>
        <ChevronDown className={cn(
          'h-4 w-4 transition-transform',
          selectedVersion === '2.1.0' ? 'text-emerald-500' : 'text-indigo-500',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 min-w-[120px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {versions.map((version) => {
            const isSelected = version === selectedVersion
            return (
              <button
                key={version}
                type="button"
                onClick={() => {
                  onVersionChange(version)
                  setIsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors',
                  isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                )}
              >
                <span className={cn(
                  'font-semibold',
                  version === '2.1.0' ? 'text-emerald-700' : 'text-indigo-700'
                )}>
                  v{version}
                </span>
                {isSelected && (
                  <Check className={cn(
                    'h-4 w-4',
                    version === '2.1.0' ? 'text-emerald-500' : 'text-indigo-500'
                  )} />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
