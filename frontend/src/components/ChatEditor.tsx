import { AutoformatKit } from "@/components/editor/plugins/autoformat-kit"
import { BasicBlocksKit } from "@/components/editor/plugins/basic-blocks-kit"
import { BasicMarksKit } from "@/components/editor/plugins/basic-marks-kit"
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit"
import { EmojiKit } from "@/components/editor/plugins/emoji-kit"
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit"
import EmojiPickerBox from "@/components/EmojiPickerBox"
import { Button } from "@/components/ui/button"
import { Editor, EditorContainer } from "@/components/ui/editor"
import { formatBytes } from "@/lib/formatBytes"
import { uploadFile } from "@/lib/uploadFile"
import type { MessageResp } from "@eggplant/shared/api"
import { Plate, useEditorSelector, usePlateEditor } from "platejs/react"
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react"
import { useTranslation } from "react-i18next"
import { FiLoader, FiPaperclip, FiSend, FiX } from "react-icons/fi"
import { useFilePicker } from "use-file-picker"

type Props = {
  onSend: (text: string, fileIds: string[]) => void
  onTypingChange?: (typing: boolean) => void
  replyTo?: MessageResp | null
  onClearReply: () => void
  onJumpToParent: (messageId: number) => void
}

export type ChatEditorHandle = {
  attachFiles: (files: FileList | File[]) => void
  focus: () => void
}

type PendingAttachment = {
  id: string
  name: string
  size: number
  status: "uploading" | "done" | "error"
  progress: number
  fileId?: string
}

const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches

const ChatEditor = forwardRef<ChatEditorHandle, Props>(
  ({ onSend, onTypingChange, replyTo, onClearReply, onJumpToParent }, ref) => {
    const { t } = useTranslation()
    const onTypingChangeRef = useRef(onTypingChange)

    useEffect(() => {
      onTypingChangeRef.current = onTypingChange
    }, [onTypingChange])

    const editor = usePlateEditor({
      plugins: [
        ...AutoformatKit,
        ...BasicBlocksKit,
        ...BasicMarksKit,
        ...CodeBlockKit,
        ...EmojiKit,
        ...MarkdownKit,
      ],
      handlers: {
        onChange: ({ editor }) => {
          onTypingChangeRef.current?.(!editor.api.isEmpty())
        },
      },
    })

    const [attachments, setAttachments] = useState<PendingAttachment[]>([])

    const patchAttachment = (
      id: string,
      update: Partial<PendingAttachment>,
    ) => {
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...update } : a)),
      )
    }

    const removeAttachment = (id: string) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id))
    }

    const attachFiles = (incoming: FileList | File[]) => {
      const files = Array.from(incoming)
      if (files.length === 0) return

      const newEntries: PendingAttachment[] = files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        status: "uploading",
        progress: 0,
      }))
      setAttachments((prev) => [...prev, ...newEntries])

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
          })
          .catch(() => {
            patchAttachment(entry.id, { status: "error", progress: 0 })
          })
      })
    }

    useImperativeHandle(ref, () => ({
      attachFiles,
      focus: () => {
        editor.tf.focus({ edge: "endEditor" })
      },
    }))

    const { openFilePicker } = useFilePicker({
      accept: ["*"],
      multiple: true,
      readFilesContent: false,
      onFilesSelected: (data) => {
        if ("errors" in data) return
        attachFiles(data.plainFiles)
      },
    })

    const handleSend = () => {
      const markdown = editor.api.markdown.serialize().trim()
      const hasText = !editor.api.isEmpty()

      const hasUploading = attachments.some((a) => a.status !== "done")
      const readyFileIds = attachments
        .filter((a) => a.status === "done" && a.fileId)
        .map((a) => a.fileId!)

      if (!hasText && readyFileIds.length === 0) return
      if (hasUploading) return

      onSend(markdown, readyFileIds)
      editor.tf.reset()
      setAttachments([])
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !isTouchDevice()) {
        e.preventDefault()
        handleSend()
      }
    }

    const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      attachFiles(files)
      return true
    }

    const insertEmoji = (emoji: string) => {
      editor.tf.focus()
      editor.tf.insertText(emoji)
    }

    const SendButton = ({ onSend }: { onSend: () => void }) => {
      const isEmpty = useEditorSelector((editor) => editor.api.isEmpty(), [])
      const hasReadyFiles = attachments.some(
        (a) => a.status === "done" && a.fileId,
      )
      const hasUploading = attachments.some((a) => a.status !== "done")
      const disabled = (isEmpty && !hasReadyFiles) || hasUploading

      return (
        <Button
          className="p-1"
          aria-label={
            hasUploading
              ? t("chatEditor.waitForUpload")
              : t("chatEditor.sendMessage")
          }
          variant="ghost"
          onClick={onSend}
          disabled={disabled}
        >
          {hasUploading ? (
            <FiLoader className="size-5 text-primary animate-spin" />
          ) : (
            <FiSend className="size-5 text-primary" />
          )}
        </Button>
      )
    }

    return (
      <div className="flex flex-col gap-2">
        {replyTo && (
          <div className="flex items-center rounded-md border bg-muted/30 px-2 py-1">
            <button
              type="button"
              onClick={() => onJumpToParent(replyTo.id)}
              className="flex-1 text-left"
              aria-label={t("chatEditor.jumpToReplied")}
            >
              <div className="text-xs text-muted-foreground">
                {t("chatEditor.replyingTo", { sender: replyTo.sender })}
              </div>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClearReply}
              aria-label={t("chatEditor.clearReply")}
            >
              <FiX className="size-4" />
            </Button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5 shrink-0"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={t("chatEditor.removeAttachment", {
                    name: attachment.name,
                  })}
                >
                  <FiX className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Plate editor={editor}>
            <EditorContainer className="w-full">
              <Editor
                variant="none"
                className="p-2 min-h-[2lh] max-h-50 overflow-y-auto"
                placeholder={t("chatEditor.placeholder")}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
              />
            </EditorContainer>

            <SendButton onSend={handleSend} />
          </Plate>

          <Button
            variant="ghost"
            className="p-1 shrink-0"
            onClick={() => openFilePicker()}
            aria-label={t("chatEditor.attachFile")}
          >
            <FiPaperclip className="size-5 text-primary" />
          </Button>

          <EmojiPickerBox onEmojiClick={insertEmoji} />
        </div>
      </div>
    )
  },
)

export default ChatEditor
