import AttachmentManager from "@/components/AttachmentManager"
import { BasicBlocksKit } from "@/components/editor/plugins/basic-blocks-kit"
import { BasicMarksKit } from "@/components/editor/plugins/basic-marks-kit"
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit"
import { EmojiKit } from "@/components/editor/plugins/emoji-kit"
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit"
import MessageReactions from "@/components/MessageReactions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Editor, EditorContainer } from "@/components/ui/editor"
import { MessageMediaGallery } from "@/components/ui/message-media-gallery"
import { MessageMediaPreview } from "@/components/ui/message-media-preview"
import UserInfoCard from "@/components/UserInfoCard"
import { getMediaType } from "@/lib/attachments"
import { cn, getInitials } from "@/lib/utils"
import type {
  MessageAttachment,
  MessageReplyPreview,
  MessageResp,
} from "@eggplant/shared/api"
import { Plate, usePlateEditor } from "platejs/react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  FiCornerUpLeft,
  FiEdit2,
  FiMoreHorizontal,
  FiTrash2,
  FiX,
} from "react-icons/fi"

const MessageAttachments = ({
  attachments,
  className,
}: {
  attachments: MessageAttachment[]
  className?: string
}) => {
  const media = attachments.filter((a) => {
    const kind = getMediaType(a)
    return kind === "image" || kind === "video"
  })
  const others = attachments.filter((a) => {
    const kind = getMediaType(a)
    return kind !== "image" && kind !== "video"
  })

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {media.length > 0 && <MessageMediaGallery attachments={media} />}

      {others.map((a) => (
        <MessageMediaPreview key={a.file_id} attachment={a} />
      ))}
    </div>
  )
}

const MessageMenuItems = ({
  Item,
  currentUserId,
  senderId,
  onEdit,
  onDelete,
  onReply,
}: {
  Item: React.ComponentType<{
    onClick: () => void
    variant?: "default" | "destructive"
    children?: React.ReactNode
  }>
  currentUserId: number | null
  senderId: number | null
  onEdit: () => void
  onDelete: () => void
  onReply: () => void
}) => {
  const { t } = useTranslation()

  return (
    <>
      {currentUserId === senderId && (
        <>
          <Item onClick={onEdit}>
            <FiEdit2 className="size-4" />
            {t("common.edit")}
          </Item>
          <Item variant="destructive" onClick={onDelete}>
            <FiTrash2 className="size-4" />
            {t("common.delete")}
          </Item>
        </>
      )}
      <Item onClick={onReply}>
        <FiCornerUpLeft className="size-4" />
        {t("common.reply")}
      </Item>
    </>
  )
}

const roleLabels = {
  owner: "chat.roles.owner",
  admin: "chat.roles.admin",
  member: "chat.roles.member",
  guest: "chat.roles.guest",
} as const

const ChatMessage = ({
  message,
  onReply,
  onJumpToParent,
  onEdit,
  onDelete,
  onToggleReaction,
  messageRef,
  isHighlighted,
  currentUserId,
}: {
  message: MessageResp
  onReply: (message: MessageResp) => void
  onJumpToParent: (parentId: number) => void
  onEdit: (
    messageId: number,
    text: string,
    fileIds?: string[],
    removeFileIds?: string[],
  ) => void
  onDelete: (messageId: number) => void
  onToggleReaction: (messageId: number, emoji: string) => void
  messageRef: (element: HTMLDivElement | null) => void
  isHighlighted?: boolean
  currentUserId: number | null
}) => {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editingFileIds, setEditingFileIds] = useState<string[]>(
    message.attachments?.map((a) => a.file_id) ?? [],
  )
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([])

  const editor = usePlateEditor({
    plugins: [
      ...BasicBlocksKit,
      ...BasicMarksKit,
      ...CodeBlockKit,
      ...EmojiKit,
      ...MarkdownKit,
    ],
  })

  const editEditor = usePlateEditor({
    plugins: [
      ...BasicBlocksKit,
      ...BasicMarksKit,
      ...CodeBlockKit,
      ...EmojiKit,
      ...MarkdownKit,
    ],
  })

  const previewEditor = usePlateEditor({
    plugins: [
      ...BasicBlocksKit,
      ...BasicMarksKit,
      ...CodeBlockKit,
      ...EmojiKit,
      ...MarkdownKit,
    ],
  })

  useEffect(() => {
    const markdown = editor.api.markdown.deserialize(message.text)
    editor.tf.setValue(markdown)
  }, [message.text, editor.api.markdown, editor.tf])

  useEffect(() => {
    if (editing) {
      const markdown = editEditor.api.markdown.deserialize(message.text)
      editEditor.tf.setValue(markdown)
      editEditor.tf.focus({ edge: "endEditor" })
    }
  }, [editing, message.text, editEditor.api.markdown, editEditor.tf])

  useEffect(() => {
    if (!message.parent) return
    const previewText = message.parent.deleted
      ? t("chatMessage.messageDeleted")
      : (message.parent.text ?? "")
    const previewMarkdown = previewEditor.api.markdown.deserialize(previewText)
    previewEditor.tf.setValue(previewMarkdown)
  }, [message.parent, previewEditor.api.markdown, previewEditor.tf, t])

  const systemText = useMemo(() => {
    if (message.sender_id !== null) return ""
    let key = ""
    let params: Record<string, string | number> = {}
    try {
      const parsed = JSON.parse(message.text) as {
        key?: string
        params?: Record<string, string | number>
      }
      if (parsed && typeof parsed.key === "string" && parsed.key) {
        key = parsed.key
        params = parsed.params ?? {}
      }
    } catch {
      // legacy plain-text system message
    }
    if (!key) return message.text
    const allParams: Record<string, string | number> = {
      username: message.system_username ?? "",
      ...params,
    }
    if (key === "role") {
      const roleKey =
        roleLabels[allParams.role as keyof typeof roleLabels] ??
        roleLabels.member
      return t("chat.system.role", { ...allParams, role: t(roleKey) })
    }
    return t(`chat.system.${key}` as never, {
      defaultValue: message.text,
      ...allParams,
    })
  }, [message.sender_id, message.text, message.system_username, t])

  const handleSaveEdit = () => {
    const markdown = editEditor.api.markdown.serialize().trim()
    const originalFileIds = message.attachments?.map((a) => a.file_id) ?? []
    const attachmentsChanged =
      JSON.stringify([...editingFileIds].sort()) !==
        JSON.stringify([...originalFileIds].sort()) || removedFileIds.length > 0
    const textChanged = markdown !== (message.text ?? "")

    if (!markdown && editingFileIds.length === 0 && attachmentsChanged) {
      onDelete(message.id)
    } else if (markdown || textChanged || attachmentsChanged) {
      onEdit(message.id, markdown, editingFileIds, removedFileIds)
    }
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditing(false)
  }

  const handleRemoveAttachment = (fileId: string) => {
    setEditingFileIds((prev) => prev.filter((id) => id !== fileId))
    setRemovedFileIds((prev) =>
      prev.includes(fileId) ? prev : [...prev, fileId],
    )
  }

  const handleAddAttachment = (fileId: string) => {
    setEditingFileIds((prev) =>
      prev.includes(fileId) ? prev : [...prev, fileId],
    )
    setRemovedFileIds((prev) => prev.filter((id) => id !== fileId))
  }

  const handleConfirmDelete = () => {
    onDelete(message.id)
    setDeleteConfirmOpen(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    }
    if (e.key === "Escape") {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const renderReplyPreview = (preview: MessageReplyPreview) => (
    <button
      type="button"
      onClick={() => onJumpToParent(preview.id)}
      className="mb-2 w-full text-left rounded-md border bg-muted/30 p-2 hover:bg-muted/50"
      aria-label={t("chatMessage.jumpToReplied")}
    >
      <div className="text-xs text-muted-foreground">
        {t("chatMessage.replyTo", { sender: preview.sender })}
      </div>
      <Plate editor={previewEditor}>
        <EditorContainer className="max-w-2xl">
          <Editor
            variant="none"
            readOnly
            className="p-0 text-sm line-clamp-2"
          />
        </EditorContainer>
      </Plate>
    </button>
  )

  const handleReply = () => {
    onReply(message)
  }

  const handleEdit = () => {
    setEditing(true)
    setEditingFileIds(message.attachments?.map((a) => a.file_id) ?? [])
    setRemovedFileIds([])
  }

  const handleDelete = () => {
    setDeleteConfirmOpen(true)
  }

  if (message.sender_id === null) {
    return (
      <div
        className={cn(
          "group py-2 text-center text-sm text-muted-foreground [overflow-anchor:none] rounded-md",
          "pointer-fine:hover:bg-muted/50 pointer-coarse:active:bg-muted/50",
          isHighlighted && "bg-primary/10 ring-2 ring-primary/40",
        )}
        ref={messageRef}
      >
        <>
          <UserInfoCard
            user={{
              id: message.system_user_id!,
              username: message.system_username!,
              avatar_url: message.system_avatar_url,
            }}
          >
            <span className="font-medium underline decoration-dotted underline-offset-4 cursor-pointer">
              {message.system_username}
            </span>
          </UserInfoCard>
          <span className="italic"> {systemText}</span>
        </>
        <MessageReactions
          message={message}
          currentUserId={currentUserId}
          onToggleReaction={onToggleReaction}
          className="mt-1 justify-center"
        />
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group p-3 rounded-md shadow-sm transition-colors [overflow-anchor:none]",
            "pointer-fine:hover:bg-muted/50 pointer-coarse:active:bg-muted/50",
            isHighlighted && "bg-primary/10 ring-2 ring-primary/40",
          )}
          ref={messageRef}
        >
          <div className="flex gap-3 items-start">
            <Avatar size="lg" className="hidden md:flex">
              {message.avatar_url ? (
                <AvatarImage src={message.avatar_url} />
              ) : (
                <AvatarFallback>{getInitials(message.sender!)}</AvatarFallback>
              )}
            </Avatar>

            <div className="flex-1">
              <div className="flex gap-2 items-center mb-1">
                <UserInfoCard
                  user={{
                    id: message.sender_id!,
                    username: message.sender!,
                    avatar_url: message.avatar_url,
                  }}
                >
                  <button
                    type="button"
                    className="font-medium text-left cursor-pointer hover:underline underline-offset-2"
                  >
                    {message.sender}
                  </button>
                </UserInfoCard>
                <div className="text-sm text-muted-foreground">
                  {new Date(message.created_at).toLocaleTimeString(
                    i18n.language,
                  )}
                </div>
                {message.edited_at && !editing && (
                  <div className="text-xs text-muted-foreground">
                    {t("chatMessage.edited")}
                  </div>
                )}
                {!editing && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("chatMessage.actions")}
                        className="ml-auto rounded-md opacity-0 transition-opacity pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 pointer-fine:data-[state=open]:opacity-100 pointer-fine:focus-visible:opacity-100"
                      >
                        <FiMoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <MessageMenuItems
                        Item={DropdownMenuItem}
                        currentUserId={currentUserId}
                        senderId={message.sender_id}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onReply={handleReply}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {message.parent && !editing
                ? renderReplyPreview(message.parent)
                : null}
              {!editing ? (
                <div>
                  <Plate editor={editor}>
                    <EditorContainer className="max-w-full md:max-w-2xl">
                      <Editor variant="none" readOnly className="p-0" />
                    </EditorContainer>
                  </Plate>
                  {(message.attachments?.length ?? 0) > 0 && (
                    <MessageAttachments
                      attachments={message.attachments!}
                      className="mt-2"
                    />
                  )}
                </div>
              ) : (
                <div>
                  <Plate editor={editEditor}>
                    <EditorContainer className="w-full">
                      <Editor
                        variant="none"
                        className="p-2 min-h-[2lh]"
                        onKeyDown={handleEditKeyDown}
                      />
                    </EditorContainer>
                  </Plate>
                  <AttachmentManager
                    existing={
                      message.attachments?.filter((a) =>
                        editingFileIds.includes(a.file_id),
                      ) ?? []
                    }
                    onRemove={handleRemoveAttachment}
                    onAdd={handleAddAttachment}
                  />
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{t("chatMessage.editHint")}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={handleCancelEdit}
                    >
                      <FiX className="size-3 mr-1" />
                      {t("common.cancel")}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveEdit}
                    >
                      {t("common.save")}
                    </Button>
                  </div>
                </div>
              )}
              {!editing && (
                <MessageReactions
                  message={message}
                  currentUserId={currentUserId}
                  onToggleReaction={onToggleReaction}
                  className="mt-1.5"
                />
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-40">
        <MessageMenuItems
          Item={ContextMenuItem}
          currentUserId={currentUserId}
          senderId={message.sender_id}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onReply={handleReply}
        />
      </ContextMenuContent>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chatMessage.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chatMessage.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  )
}

export default ChatMessage
