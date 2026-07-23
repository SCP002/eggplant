import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("electronAPI", {
  showNotification: (
    title: string,
    body: string,
    data?: { roomId?: string; invitationToken?: string },
  ) => ipcRenderer.send("show-notification", { title, body, data }),
  onWindowStateChanged: (
    callback: (state: { isInTray: boolean; isMinimized: boolean }) => void,
  ) => {
    ipcRenderer.on("window-state-changed", (_event, state) => callback(state))
    return () => {
      ipcRenderer.removeAllListeners("window-state-changed")
    }
  },
  onNavigateTo: (
    callback: (target: {
      type: string
      roomId?: string
      token?: string
    }) => void,
  ) => {
    ipcRenderer.on("navigate-to", (_event, target) => callback(target))
    return () => {
      ipcRenderer.removeAllListeners("navigate-to")
    }
  },
  setTrayLabels: (labels: { show: string; quit: string }) =>
    ipcRenderer.send("set-tray-labels", labels),
  isElectron: true,
})
