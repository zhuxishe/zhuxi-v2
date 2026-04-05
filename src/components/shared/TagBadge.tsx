import { cn } from "@/lib/utils"

type TagVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info"

interface TagBadgeProps {
  label: string
  variant?: TagVariant
  className?: string
}

const variantClasses: Record<TagVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-foreground bg-transparent",
  success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
}

export function TagBadge({ label, variant = "secondary", className }: TagBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {label}
    </span>
  )
}
