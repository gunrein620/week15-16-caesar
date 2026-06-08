import assert from 'node:assert/strict'
import test from 'node:test'

import { emailVerificationStatusText } from './emailVerification.ts'

test('emailVerificationStatusText explains resend results in Korean', () => {
  assert.equal(emailVerificationStatusText({ status: 'sent' }), '인증 메일을 보냈습니다.')
  assert.equal(emailVerificationStatusText({ status: 'already_verified' }), '이미 이메일 인증이 완료되었습니다.')
  assert.equal(emailVerificationStatusText({ status: 'email_disabled' }), '이메일 발송 설정이 필요합니다.')
})
