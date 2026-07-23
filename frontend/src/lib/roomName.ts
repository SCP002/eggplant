import type { RoomResp } from "@eggplant/shared/api"
import type { TFunction } from "i18next"

export function roomDisplayName(
  room: Pick<RoomResp, "name" | "is_general">,
  t: TFunction,
): string {
  return room.is_general ? t("rooms.general") : room.name
}
