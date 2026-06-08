export type EmailVerificationSendResponse = {
  status: 'sent' | 'already_verified' | 'email_disabled'
}

export function emailVerificationStatusText(response: EmailVerificationSendResponse) {
  if (response.status === 'sent') return '인증 메일을 보냈습니다.'
  if (response.status === 'already_verified') return '이미 이메일 인증이 완료되었습니다.'
  return '이메일 발송 설정이 필요합니다.'
}
