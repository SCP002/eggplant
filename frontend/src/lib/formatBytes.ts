import { filesize } from "filesize"

export function formatBytes(
  bytes: number,
  opts: {
    decimals?: number
    sizeType?: "accurate" | "normal"
  } = {},
): string {
  const { decimals = 0, sizeType = "normal" } = opts

  if (bytes === 0) return "0 Byte"

  return filesize(bytes, {
    round: decimals,
    standard: sizeType === "accurate" ? "iec" : "jedec",
    spacer: " ",
  })
}
