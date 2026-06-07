export type AppPanel = "home" | "board" | "rag" | "youtube" | "briefing" | "saved" | "admin"
export type BoardMode = "list" | "detail" | "write" | "edit"
export type BoardAction =
  | "open-post"
  | "start-write"
  | "start-edit"
  | "cancel"
  | "back-to-list"
  | "saved"
  | "deleted"

export const MOBILE_BOTTOM_TAB_PANELS = ["home", "board", "rag", "youtube", "saved"] as const

export function nextBoardMode(current: BoardMode, action: BoardAction): BoardMode {
  if (action === "open-post") return "detail"
  if (action === "start-write") return "write"
  if (action === "start-edit") return "edit"
  if (action === "back-to-list" || action === "deleted") return "list"
  if (action === "saved") return "detail"
  if (action === "cancel") return current === "edit" ? "detail" : "list"
  return current
}

export function shouldShowDesktopBoardSidebar(panel: AppPanel): boolean {
  return panel !== "home"
}
