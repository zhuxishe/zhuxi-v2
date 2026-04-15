export interface MiniScriptAccessView {
  view: 'pages' | 'pdf' | 'restricted'
  pages: string[]
  pdfUrl: string | null
}

export function resolveMiniScriptAccessView(
  canViewFull: boolean,
  pageImages: string[],
  pdfUrl: string | null
): MiniScriptAccessView {
  if (canViewFull && pageImages.length > 0) {
    return { view: 'pages', pages: pageImages, pdfUrl }
  }
  if (canViewFull && pdfUrl) {
    return { view: 'pdf', pages: pageImages, pdfUrl }
  }
  return { view: 'restricted', pages: pageImages, pdfUrl }
}
