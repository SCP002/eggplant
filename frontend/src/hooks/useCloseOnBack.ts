import { backClosableStore } from "@/lib/backClosable"
import * as React from "react"

export const useCloseOnBack = (isOpen: boolean, onClose: () => void) => {
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!isOpen) return
    return backClosableStore.register(() => {
      onCloseRef.current()
      return true
    })
  }, [isOpen])
}
