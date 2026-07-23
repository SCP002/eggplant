import { Button } from "@/components/ui/button"
import { formatBytes } from "@/lib/formatBytes"
import { uploadFile } from "@/lib/uploadFile"
import type { MessageAttachment } from "@eggplant/shared/api"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FiLoader, FiPaperclip, FiX } from "react-icons/fi"
import { useFilePicker } from "use-file-picker"

type NewAttachment = {
  id: string
  name: string
  size: number
  status: "uploading" | "done" | "error"
  progress: number
  fileId?: string
}

type Props = {
  existing: MessageAttachment[]
  onRemove: (fileId: string) => void
  onAdd: (fileId: string) => void
}

const AttachmentManager = ({ existing, onRemove, onAdd }: Props) => {
  const { t } = useTranslation()
  const [newAttachments, setNewAttachments] = useState<NewAttachment[]>([])

  const patchAttachment = (id: string, update: Partial<NewAttachment>) => {
    setNewAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...update } : a)),
    )
  }

  const removeNewAttachment = (id: string) => {
    setNewAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const attachFiles = (incoming: FileList | File[]) => {
    const files = Array.from(incoming)
    if (files.length === 0) return

    const newEntries: NewAttachment[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      status: "uploading",
      progress: 0,
    }))
    setNewAttachments((prev) => [...prev, ...newEntries])

    files.forEach((file, index) => {
      const entry = newEntries[index]
      uploadFile(file, (progress) => {
        patchAttachment(entry.id, { progress })
      })
        .then((resp) => {
          patchAttachment(entry.id, {
            status: "done",
            progress: 100,
            fileId: resp.file_id,
          })
          onAdd(resp.file_id)
        })
        .catch(() => {
          patchAttachment(entry.id, { status: "error", progress: 0 })
        })
    })
  }

  const { openFilePicker } = useFilePicker({
    accept: ["*"],
    multiple: true,
    readFilesContent: false,
    onFilesSelected: (data) => {
      if ("errors" in data) return
      attachFiles(data.plainFiles)
    },
  })

  return (
    <div className="flex flex-wrap gap-2">
      {existing.map((attachment) => (
        <div
          key={attachment.file_id}
          className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm"
        >
          <FiPaperclip className="size-4 shrink-0 text-muted-foreground" />
          <div className="max-w-40 truncate">
            {attachment.name ?? t("attachments.file")}
          </div>
          <div className="text-xs text-muted-foreground shrink-0">
            {attachment.size != null ? formatBytes(attachment.size) : ""}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5 shrink-0"
            onClick={() => onRemove(attachment.file_id)}
            aria-label={t("attachments.remove", {
              name: attachment.name ?? t("attachments.file"),
            })}
          >
            <FiX className="size-3.5" />
          </Button>
        </div>
      ))}

      {newAttachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm"
        >
          <FiPaperclip className="size-4 shrink-0 text-muted-foreground" />
          <div className="max-w-40 truncate">{attachment.name}</div>
          <div className="text-xs text-muted-foreground shrink-0">
            {attachment.status === "uploading" && (
              <>
                {attachment.progress}% · {formatBytes(attachment.size)}
              </>
            )}
            {attachment.status === "done" && formatBytes(attachment.size)}
            {attachment.status === "error" && (
              <span className="text-destructive">
                {t("common.uploadFailed")}
              </span>
            )}
          </div>
          {attachment.status === "uploading" && (
            <div className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${attachment.progress}%` }}
              />
            </div>
          )}
          {attachment.status === "done" || attachment.status === "error" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 shrink-0"
              onClick={() => {
                if (attachment.fileId) onRemove(attachment.fileId)
                removeNewAttachment(attachment.id)
              }}
              aria-label={t("attachments.remove", { name: attachment.name })}
            >
              <FiX className="size-3.5" />
            </Button>
          ) : (
            <FiLoader className="size-3.5 shrink-0 text-muted-foreground animate-spin" />
          )}
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1"
        onClick={() => openFilePicker()}
        aria-label={t("chatEditor.attachFile")}
      >
        <FiPaperclip className="size-4" />
        {t("common.attach")}
      </Button>
    </div>
  )
}

export default AttachmentManager
