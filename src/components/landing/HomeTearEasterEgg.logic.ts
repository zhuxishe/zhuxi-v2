type TearStyles = Record<string, string>

type TearElements = {
  root: HTMLDivElement
  paper: HTMLDivElement
  tear: HTMLButtonElement
  posterReturn: HTMLButtonElement
  styles: TearStyles
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const smoothstep = (value: number) => value * value * (3 - 2 * value)

function splitText(paper: HTMLElement, styles: TearStyles) {
  let textIndex = 0
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      return !parent || parent.closest("nav, footer, a, button, svg, script, style, noscript, [data-no-tear]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    },
  })
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
  textNodes.forEach((node) => {
    const fragment = document.createDocumentFragment()
    Array.from(node.nodeValue ?? "").forEach((char) => {
      if (/\s/.test(char)) return fragment.appendChild(document.createTextNode(char))
      const span = document.createElement("span")
      span.className = styles.tearText
      span.textContent = char
      span.dataset.tearIndex = String(textIndex++)
      fragment.appendChild(span)
    })
    node.parentNode?.replaceChild(fragment, node)
  })
}

function assignMotion(root: HTMLElement, styles: TearStyles) {
  root.querySelectorAll<HTMLElement>(`.${styles.tearText}`).forEach((span, index) => {
    const rect = span.getBoundingClientRect()
    const seed = Math.sin((index + 1) * 91.73) * 10000
    const rand = seed - Math.floor(seed)
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const fromCorner = Math.hypot(centerX, centerY - window.innerHeight)
    span.style.setProperty("--tear-x", `${(90 + Math.min(620, fromCorner * 0.16) + rand * 460).toFixed(1)}px`)
    span.style.setProperty("--tear-y", `${(-58 - Math.min(420, Math.max(0, window.innerHeight - centerY) * 0.13) - rand * 300).toFixed(1)}px`)
    span.style.setProperty("--tear-r", `${(-24 + rand * 48).toFixed(2)}deg`)
    span.style.setProperty("--tear-delay", `${Math.min(120, Math.max(0, fromCorner * 0.045 + rand * 42)).toFixed(1)}`)
  })
}

export function initHomeTearEasterEgg({ root, paper, tear, posterReturn, styles }: TearElements) {
  const videos = Array.from(root.querySelectorAll("video"))
  const state = { progress: 0, dragging: false, suppressClick: false, timer: 0, startX: 0, startY: 0, startProgress: 0 }
  splitText(paper, styles)

  const playPoster = () => {
    const portrait = window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches
    videos.forEach((video) => {
      if (video.dataset.variant !== (portrait ? "portrait" : "landscape")) return video.pause()
      video.currentTime = 0
      void video.play()
    })
  }
  const setProgress = (value: number) => {
    state.progress = clamp(value)
    const posterAlpha = smoothstep(clamp((state.progress - 0.08) / 0.92))
    root.style.setProperty("--tear-progress", state.progress.toFixed(3))
    root.style.setProperty("--poster-alpha", posterAlpha.toFixed(3))
    root.style.setProperty("--paper-alpha", (1 - posterAlpha * 0.86).toFixed(3))
    root.classList.toggle(styles.active, state.progress > 0.001)
    if (state.progress > 0.08) playPoster()
  }
  const settle = (nextOpen: boolean) => {
    window.clearTimeout(state.timer)
    assignMotion(root, styles)
    root.classList.remove(styles.complete)
    if (nextOpen) root.classList.add(styles.active)
    setProgress(nextOpen ? 1 : 0)
    if (nextOpen) {
      playPoster()
      state.timer = window.setTimeout(() => root.classList.add(styles.complete), 780)
    } else {
      videos.forEach((video) => video.pause())
      window.setTimeout(() => root.classList.remove(styles.active), 640)
    }
  }
  const updateBottom = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    root.classList.toggle(styles.atBottom, max <= 0 || window.scrollY >= max - 80)
  }
  const onPointerDown = (event: PointerEvent) => {
    state.dragging = true
    state.startX = event.clientX
    state.startY = event.clientY
    state.startProgress = state.progress
    root.classList.add(styles.dragging, styles.active)
    tear.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!state.dragging) return
    const dx = (event.clientX - state.startX) / Math.max(280, window.innerWidth * 0.62)
    const dy = (state.startY - event.clientY) / Math.max(220, window.innerHeight * 0.44)
    setProgress(state.startProgress + Math.max(dx, dy))
    state.suppressClick = true
  }
  const finishDrag = (event: PointerEvent) => {
    if (!state.dragging) return
    state.dragging = false
    root.classList.remove(styles.dragging)
    tear.releasePointerCapture(event.pointerId)
    settle(state.progress > 0.38)
  }
  const onClick = () => state.suppressClick ? (state.suppressClick = false) : settle(state.progress < 0.5)
  const onReturn = () => settle(false)
  const onResize = () => assignMotion(root, styles)
  assignMotion(root, styles)
  updateBottom()
  tear.addEventListener("pointerdown", onPointerDown)
  tear.addEventListener("pointermove", onPointerMove)
  tear.addEventListener("pointerup", finishDrag)
  tear.addEventListener("pointercancel", finishDrag)
  tear.addEventListener("click", onClick)
  posterReturn.addEventListener("click", onReturn)
  window.addEventListener("scroll", updateBottom, { passive: true })
  window.addEventListener("resize", onResize)
  return () => {
    window.clearTimeout(state.timer)
    tear.removeEventListener("pointerdown", onPointerDown)
    tear.removeEventListener("pointermove", onPointerMove)
    tear.removeEventListener("pointerup", finishDrag)
    tear.removeEventListener("pointercancel", finishDrag)
    tear.removeEventListener("click", onClick)
    posterReturn.removeEventListener("click", onReturn)
    window.removeEventListener("scroll", updateBottom)
    window.removeEventListener("resize", onResize)
    videos.forEach((video) => video.pause())
  }
}
