import { Info } from 'lucide-react'
import { useState } from 'react'

import { Button } from './button'
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from './tooltip'

/** Brief help, available to mouse, keyboard and touch users. */
export function InfoHint({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const close = () => {
    setPinned(false)
    setOpen(false)
  }
  return (
    <TooltipProvider delayDuration={200}>
      <TooltipRoot open={open || pinned} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={label}
            aria-expanded={open || pinned}
            onClick={() => {
              setPinned(!pinned)
              setOpen(false)
            }}
          >
            <Info aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-[min(20rem,calc(100vw-2rem))] text-pretty"
          onEscapeKeyDown={close}
          onPointerDownOutside={close}
        >
          {children}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
