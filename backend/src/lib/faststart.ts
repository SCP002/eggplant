import { execFile } from "child_process"
import { existsSync } from "fs"
import { rename, rm } from "fs/promises"
import { promisify } from "util"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"

const execFileAsync = promisify(execFile)

/**
 * Rewrites an MP4 so its moov atom is at the front.
 *
 * Returns `true` when the file was rewritten.
 */
export async function rewriteFileFaststart(srcPath: string): Promise<boolean> {
  const ffmpegPath = ffmpegInstaller?.path
  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    return false
  }

  const tmpPath = `${srcPath}.faststart.mp4`
  try {
    await execFileAsync(
      ffmpegPath,
      ["-y", "-i", srcPath, "-c", "copy", "-movflags", "+faststart", tmpPath],
      {
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        encoding: "buffer",
      },
    )

    await rename(tmpPath, srcPath)
    return true
  } catch {
    await rm(tmpPath, { force: true }).catch(() => {})
    return false
  }
}
