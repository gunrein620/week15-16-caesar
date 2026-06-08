import assert from "node:assert/strict"
import test from "node:test"

import {
  BACK_TO_TOP_SCROLL_THRESHOLD,
  desktopTabPanelsForRole,
  MOBILE_BOTTOM_TAB_PANELS,
  nextBoardMode,
  shouldScrollToTopOnRepeatedMobileTab,
  shouldShowDesktopBoardSidebar,
  shouldShowBackToTopButton,
} from "./boardNavigation.ts"

test("mobile bottom tabs keep the app-style primary destinations only", () => {
  assert.deepEqual(MOBILE_BOTTOM_TAB_PANELS, ["home", "board", "rag", "youtube", "saved"])
  assert.equal(MOBILE_BOTTOM_TAB_PANELS.includes("briefing"), false)
  assert.equal(MOBILE_BOTTOM_TAB_PANELS.includes("admin"), false)
})

test("board mode transitions separate list detail write and edit screens", () => {
  assert.equal(nextBoardMode("list", "open-post"), "detail")
  assert.equal(nextBoardMode("detail", "start-write"), "write")
  assert.equal(nextBoardMode("detail", "start-edit"), "edit")
  assert.equal(nextBoardMode("write", "cancel"), "list")
  assert.equal(nextBoardMode("edit", "cancel"), "detail")
  assert.equal(nextBoardMode("detail", "back-to-list"), "list")
  assert.equal(nextBoardMode("write", "saved"), "detail")
  assert.equal(nextBoardMode("edit", "saved"), "detail")
})

test("desktop sidebar appears only inside the board panel", () => {
  assert.equal(shouldShowDesktopBoardSidebar("home"), false)
  assert.equal(shouldShowDesktopBoardSidebar("board"), true)
  assert.equal(shouldShowDesktopBoardSidebar("rag"), false)
  assert.equal(shouldShowDesktopBoardSidebar("youtube"), false)
  assert.equal(shouldShowDesktopBoardSidebar("saved"), false)
  assert.equal(shouldShowDesktopBoardSidebar("admin"), false)
})

test("desktop tabs hide admin-only briefing tools from normal users", () => {
  assert.deepEqual(desktopTabPanelsForRole(undefined), ["home", "board", "rag", "youtube", "saved"])
  assert.deepEqual(desktopTabPanelsForRole("user"), ["home", "board", "rag", "youtube", "saved"])
  assert.deepEqual(desktopTabPanelsForRole("admin"), [
    "home",
    "board",
    "rag",
    "youtube",
    "briefing",
    "saved",
    "admin",
  ])
})

test("re-tapping the current mobile bottom tab scrolls the same panel to the top", () => {
  assert.equal(shouldScrollToTopOnRepeatedMobileTab("home", "home"), true)
  assert.equal(shouldScrollToTopOnRepeatedMobileTab("youtube", "youtube"), true)
  assert.equal(shouldScrollToTopOnRepeatedMobileTab("home", "youtube"), false)
  assert.equal(shouldScrollToTopOnRepeatedMobileTab("admin", "admin"), false)
})

test("desktop back-to-top button appears only after the scroll threshold", () => {
  assert.equal(shouldShowBackToTopButton(0), false)
  assert.equal(shouldShowBackToTopButton(BACK_TO_TOP_SCROLL_THRESHOLD), false)
  assert.equal(shouldShowBackToTopButton(BACK_TO_TOP_SCROLL_THRESHOLD + 1), true)
})
