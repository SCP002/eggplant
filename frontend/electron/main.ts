import fs from "fs"
import path from "path"
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  session,
  Tray,
} from "electron"

const APP_URL = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "app-config.json"), "utf8"),
).appUrl as string

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayLabels = { show: "Show Eggplant", quit: "Quit" }
let isQuitting = false

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

app.on("before-quit", () => {
  isQuitting = true
})

interface NotificationData {
  roomId?: string
  invitationToken?: string
}

ipcMain.on(
  "show-notification",
  (
    _event,
    {
      title,
      body,
      data,
    }: { title: string; body: string; data?: NotificationData },
  ) => {
    const win = mainWindow
    if (!win) return
    const notification = new Notification({ title, body })
    notification.on("click", () => {
      win.show()
      win.focus()
      if (data?.roomId) {
        win.webContents.send("navigate-to", {
          type: "room",
          roomId: data.roomId,
        })
      } else if (data?.invitationToken) {
        win.webContents.send("navigate-to", {
          type: "invitation",
          token: data.invitationToken,
        })
      }
    })
    notification.show()
  },
)

const APP_ORIGIN = new URL(APP_URL).origin

const AUTO_ALLOW_PERMISSIONS = new Set([
  "clipboard-sanitized-write",
  "fullscreen",
])

const MEDIA_PERMISSION_FILE = path.join(
  app.getPath("userData"),
  "media-permission.json",
)

interface MediaPermissions {
  audio?: boolean
  video?: boolean
  unknown?: boolean
}

function getStoredMediaPermissions(): MediaPermissions | null {
  try {
    return JSON.parse(fs.readFileSync(MEDIA_PERMISSION_FILE, "utf8"))
  } catch {
    return null
  }
}

function storeMediaPermissions(permissions: MediaPermissions) {
  try {
    fs.writeFileSync(MEDIA_PERMISSION_FILE, JSON.stringify(permissions))
  } catch (err) {
    console.error("Failed to store media permission", err)
  }
}

const MEDIA_PROMPT_TEXT: Record<
  "audio" | "video" | "unknown",
  { title: string; message: string; detail: string }
> = {
  audio: {
    title: "Microphone access",
    message: "Allow Eggplant to use your microphone?",
    detail: "Eggplant uses your microphone for voice calls.",
  },
  video: {
    title: "Camera access",
    message: "Allow Eggplant to use your camera?",
    detail: "Eggplant uses your camera for video calls.",
  },
  unknown: {
    title: "Microphone and camera access",
    message: "Allow Eggplant to use your microphone and camera?",
    detail:
      "Eggplant uses the microphone for voice calls and the camera for video calls.",
  },
}

const mediaPermissionPromises = new Map<string, Promise<boolean>>()

async function ensureMediaPermissionDecision(
  webContents: Electron.WebContents,
  mediaType: string,
): Promise<boolean> {
  const key: keyof MediaPermissions =
    mediaType === "audio" || mediaType === "video" ? mediaType : "unknown"

  const stored = getStoredMediaPermissions()
  if (stored && stored[key] !== undefined) return stored[key] as boolean

  if (mediaPermissionPromises.has(key)) return mediaPermissionPromises.get(key)!

  const win = BrowserWindow.fromWebContents(webContents)
  const promise = (async () => {
    const options = {
      type: "question" as const,
      buttons: ["Allow", "Deny"],
      defaultId: 0,
      cancelId: 1,
      ...MEDIA_PROMPT_TEXT[key],
    }
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    const allowed = response === 0
    storeMediaPermissions({
      ...(getStoredMediaPermissions() ?? {}),
      [key]: allowed,
    })
    return allowed
  })()
  mediaPermissionPromises.set(key, promise)
  try {
    return await promise
  } finally {
    mediaPermissionPromises.delete(key)
  }
}

interface MediaPermissionDetails {
  securityOrigin?: string
  mediaType?: string
}

function requestingOrigin(
  webContents: Electron.WebContents,
  details: Electron.PermissionRequest,
): string | null {
  const mediaDetails = details as MediaPermissionDetails
  if (mediaDetails.securityOrigin) return mediaDetails.securityOrigin
  try {
    return new URL(webContents.getURL()).origin
  } catch {
    return null
  }
}

function setupPermissionHandler() {
  session.defaultSession.setPermissionRequestHandler(
    async (webContents, permission, callback, details) => {
      if (requestingOrigin(webContents, details) !== APP_ORIGIN) {
        callback(false)
        return
      }

      if (permission === "media") {
        callback(
          await ensureMediaPermissionDecision(
            webContents,
            (details as MediaPermissionDetails).mediaType ?? "unknown",
          ),
        )
        return
      }

      callback(AUTO_ALLOW_PERMISSIONS.has(permission))
    },
  )

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, permissionOrigin) => {
      if (permissionOrigin !== APP_ORIGIN) return false
      if (permission === "media") return true
      return AUTO_ALLOW_PERMISSIONS.has(permission)
    },
  )
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "..", "assets", "icon-32.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.on("show", () => {
    win.webContents.send("window-state-changed", {
      isInTray: false,
      isMinimized: false,
    })
  })

  win.on("hide", () => {
    win.webContents.send("window-state-changed", {
      isInTray: true,
      isMinimized: false,
    })
  })

  win.on("minimize", () => {
    win.webContents.send("window-state-changed", {
      isInTray: false,
      isMinimized: true,
    })
  })

  win.on("restore", () => {
    win.webContents.send("window-state-changed", {
      isInTray: false,
      isMinimized: false,
    })
  })

  win.loadURL(APP_URL)
  return win
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

function buildTrayMenu() {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: trayLabels.show,
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        },
      },
      { type: "separator" },
      {
        label: trayLabels.quit,
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
}

ipcMain.on(
  "set-tray-labels",
  (_event, labels: { show: string; quit: string }) => {
    trayLabels = { show: labels.show, quit: labels.quit }
    buildTrayMenu()
  },
)

function createTray() {
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, "..", "assets", "tray.ico"),
  )
  tray = new Tray(trayIcon)
  tray.setToolTip("Eggplant")
  buildTrayMenu()
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  setupPermissionHandler()
  mainWindow = createMainWindow()
  createTray()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    app.quit()
  }
})
