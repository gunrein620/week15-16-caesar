export const passwordRequirementText = '8~72자, 영문/숫자/특수문자 포함, 공백 불가'

type PasswordRule = {
  id: 'length' | 'letter' | 'number' | 'special' | 'no_space'
  label: string
  valid: boolean
}

export function getPasswordRuleStatus(password: string): PasswordRule[] {
  return [
    {
      id: 'length',
      label: '8~72자',
      valid: password.length >= 8 && password.length <= 72,
    },
    {
      id: 'letter',
      label: '영문 포함',
      valid: /[A-Za-z]/.test(password),
    },
    {
      id: 'number',
      label: '숫자 포함',
      valid: /\d/.test(password),
    },
    {
      id: 'special',
      label: '특수문자 포함',
      valid: /[^A-Za-z0-9\s]/.test(password),
    },
    {
      id: 'no_space',
      label: '공백 불가',
      valid: !/\s/.test(password),
    },
  ]
}

export function isStrongPassword(password: string) {
  return getPasswordRuleStatus(password).every((rule) => rule.valid)
}
