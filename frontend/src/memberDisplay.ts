const memberLabels: Record<string, string> = {
  Woni: '원이',
  Liv: '리브',
  Minami: '미나미',
  May: '메이',
  Zena: '제나',
}

export function memberLabel(name: string) {
  return memberLabels[name] ?? name
}

export function memberNamesText(names: string[]) {
  return names.length ? names.map(memberLabel).join(', ') : 'RESCENE'
}

export function compactMemberNamesText(names: string[], visibleCount = 2) {
  if (names.length === 0) return 'RESCENE'
  const safeVisibleCount = Math.max(1, visibleCount)
  if (names.length <= safeVisibleCount) return memberNamesText(names)
  const visible = names.slice(0, safeVisibleCount).map(memberLabel).join(', ')
  return `${visible} 외 ${names.length - safeVisibleCount}명`
}
