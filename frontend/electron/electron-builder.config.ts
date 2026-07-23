import type { Configuration } from "electron-builder"

const config: Configuration = {
  appId: "com.eggplant.app",
  productName: "Eggplant",
  directories: {
    output: "packed",
  },
  files: ["dist/main.js", "dist/preload.js", "app-config.json", "assets/**/*"],
  asar: true,
  win: {
    target: ["nsis"],
    icon: "assets/icon.png",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "eggplant-setup.${ext}",
  },
}

export default config
