declare module "@ffmpeg-installer/ffmpeg" {
  interface FfmpegBinaryInfo {
    /** Absolute path to the bundled ffmpeg executable (may be undefined if the platform binary is absent). */
    path: string | undefined
    /** ffmpeg release/commit identifier. */
    version: string
    /** Download URL of the bundled binary. */
    url: string
  }

  const ffmpeg: FfmpegBinaryInfo
  export default ffmpeg
}
