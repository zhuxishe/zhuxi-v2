"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  className,
  ...props
}: PopoverPrimitive.Trigger.Props) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn("cursor-pointer", className)}
      {...props}
    />
  )
}

function PopoverContent({
  className,
  sideOffset = 8,
  align = "start",
  ...props
}: PopoverPrimitive.Popup.Props & {
  sideOffset?: number
  align?: "start" | "center" | "end"
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 w-72 rounded-xl bg-background p-4 text-sm ring-1 ring-foreground/10 shadow-lg outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
