export default function AppLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground animate-pulse" aria-live="polite">
        Loading...
      </p>
    </div>
  )
}
