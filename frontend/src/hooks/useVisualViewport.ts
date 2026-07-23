import * as React from "react"

type VisualViewportState = {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
}

const getVisualViewport = (): VisualViewportState => {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, offsetLeft: 0, offsetTop: 0 }
  }
  const vv = window.visualViewport
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    offsetLeft: vv?.offsetLeft ?? 0,
    offsetTop: vv?.offsetTop ?? 0,
  }
}

export const useVisualViewport = (active = true) => {
  const [viewport, setViewport] = React.useState(getVisualViewport)

  React.useLayoutEffect(() => {
    if (!active) return
    const update = () => setViewport(getVisualViewport())
    update()
    const vv = window.visualViewport
    vv?.addEventListener("resize", update)
    vv?.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    return () => {
      vv?.removeEventListener("resize", update)
      vv?.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [active])

  return viewport
}
