type BackHandler = () => boolean

const handlers = new Set<BackHandler>()

export const backClosableStore = {
  /**
   * Register a handler that consumes the Android back button. Returns an
   * unregister function. Handlers are consulted in LIFO order.
   */
  register(handler: BackHandler): () => void {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  },

  /** Consume the back press; returns true if some handler handled it. */
  handleBack(): boolean {
    for (const handler of Array.from(handlers).reverse()) {
      if (handler()) return true
    }
    return false
  },
}
