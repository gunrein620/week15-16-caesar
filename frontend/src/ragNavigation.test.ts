import assert from "node:assert/strict"
import test from "node:test"

import {
  consumeRagInitialQuestion,
  nextRagInitialQuestionFromSubmit,
} from "./ragNavigation.ts"

test("rag initial question is consumed after one automatic search", () => {
  const submitted = nextRagInitialQuestionFromSubmit(" 최근 원이 영상 ")

  assert.equal(submitted, "최근 원이 영상")
  assert.equal(consumeRagInitialQuestion(submitted), "")
})

test("opening AI search without a submitted query does not reuse the previous query", () => {
  const consumed = consumeRagInitialQuestion("최근 원이 영상")

  assert.equal(consumed, "")
  assert.equal(nextRagInitialQuestionFromSubmit(""), "")
})
