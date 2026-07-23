import tokenHttpClient from "@/lib/tokenHttpClient"
import type { UploadFileResp } from "@eggplant/shared/api"

export async function uploadFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadFileResp> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await tokenHttpClient.post<UploadFileResp>(
    "/api/files/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (event) => {
        if (!event.total) return
        const pct = Math.round((event.loaded / event.total) * 100)
        onProgress?.(Math.min(pct, 100))
      },
    },
  )

  return response.data
}
