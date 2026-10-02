"use client"

import { useEffect, useRef } from "react"

interface Props {
  label: string
  checked: boolean
  mixed?: boolean
  disabled?: boolean
  onChange: () => void
}

export function ApprovalSelectionCheckbox({ label, checked, mixed = false, disabled, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
  return (
    <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg has-disabled:cursor-not-allowed">
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 rounded border-border accent-primary outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 disabled:opacity-30"
      />
    </label>
  )
}
