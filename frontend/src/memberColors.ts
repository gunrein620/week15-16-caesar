export type MemberKey = 'Woni' | 'Liv' | 'Minami' | 'May' | 'Zena'

export const MEMBER_ORDER: MemberKey[] = ['Woni', 'Liv', 'Minami', 'May', 'Zena']

export const MEMBER_COLORS: Record<
  MemberKey,
  { ko: string; light: string; dark: string; onLight: string; onDark: string }
> = {
  Woni: { ko: '원이', light: '#045A42', dark: '#0C7E5C', onLight: '#fff', onDark: '#fff' },
  Liv: { ko: '리브', light: '#141414', dark: '#E6E4E0', onLight: '#fff', onDark: '#141414' },
  Minami: { ko: '미나미', light: '#2B99C4', dark: '#3FB0DB', onLight: '#fff', onDark: '#06222E' },
  May: { ko: '메이', light: '#ECD25B', dark: '#ECD25B', onLight: '#241F12', onDark: '#241F12' },
  Zena: { ko: '제나', light: '#BA92DB', dark: '#C9A6E6', onLight: '#fff', onDark: '#2A1B3A' },
}

export const memberColor = (key: string, theme: 'light' | 'dark') =>
  (MEMBER_COLORS as Record<string, (typeof MEMBER_COLORS)[MemberKey]>)[key]
    ? theme === 'dark'
      ? MEMBER_COLORS[key as MemberKey].dark
      : MEMBER_COLORS[key as MemberKey].light
    : 'var(--border-strong)'

export const memberOn = (key: string, theme: 'light' | 'dark') =>
  (MEMBER_COLORS as Record<string, (typeof MEMBER_COLORS)[MemberKey]>)[key]
    ? theme === 'dark'
      ? MEMBER_COLORS[key as MemberKey].onDark
      : MEMBER_COLORS[key as MemberKey].onLight
    : 'var(--text)'
