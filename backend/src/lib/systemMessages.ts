export type SystemMessageParams = Record<string, string | number>

export type SystemMessageKey =
  | "joined"
  | "left"
  | "removed"
  | "renamed"
  | "avatar"
  | "role"
  | "call_started"
  | "call_joined"
  | "call_ended"
  | "call_missed"
  | "call_cancelled"

export function systemMessage(
  key: SystemMessageKey,
  params?: SystemMessageParams,
): string {
  return JSON.stringify({ key, params: params ?? {} })
}
