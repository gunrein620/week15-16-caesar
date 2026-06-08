import assert from 'node:assert/strict'
import test from 'node:test'

import { getPasswordRuleStatus, isStrongPassword, passwordRequirementText } from './passwordRules.ts'

test('isStrongPassword requires length, letters, numbers, special characters, and no spaces', () => {
  assert.equal(isStrongPassword('Rescene123!'), true)
  assert.equal(isStrongPassword('password123'), false)
  assert.equal(isStrongPassword('Rescene!!'), false)
  assert.equal(isStrongPassword('Rescene 123!'), false)
})

test('getPasswordRuleStatus reports each password requirement', () => {
  const status = getPasswordRuleStatus('Rescene123!')

  assert.deepEqual(
    status.map((item) => item.valid),
    [true, true, true, true, true],
  )
})

test('passwordRequirementText is concise enough for signup and admin forms', () => {
  assert.equal(passwordRequirementText, '8~72자, 영문/숫자/특수문자 포함, 공백 불가')
})
