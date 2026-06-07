import assert from "node:assert/strict"
import test from "node:test"

import {
  MOBILE_BOTTOM_TAB_PANELS,
  nextBoardMode,
  shouldShowDesktopBoardSidebar,
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

test("desktop sidebar stays visible outside the home feed", () => {
  assert.equal(shouldShowDesktopBoardSidebar("home"), false)
  assert.equal(shouldShowDesktopBoardSidebar("board"), true)
  assert.equal(shouldShowDesktopBoardSidebar("rag"), true)
})
