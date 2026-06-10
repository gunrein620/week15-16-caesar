// 표기 규칙: 숫자는 최소·의미 중심 (디자인 readme의 CONTENT FUNDAMENTALS)

/** 0 → 나눔, 10만원 이상 만원 단위 → "42만원", 그 외 → "25,000원" */
export function formatPrice(price: number): string {
  if (price === 0) return "나눔";
  if (price >= 100_000 && price % 10_000 === 0) return `${price / 10_000}만원`;
  return `${price.toLocaleString("ko-KR")}원`;
}

/** 상대 시간: 방금 / N분 전 / N시간 전 / 어제 / N일 전 */
export function timeAgo(date: Date): string {
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/** 채팅 목록용 짧은 시각: 오후 5:24 / 어제 / 6월 3일 */
export function shortTime(date: Date): string {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "어제";
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/** 거래 약속: "오늘 오후 5:30" / "내일 오전 10:00" / "6월 12일 오후 2:00" */
export function meetTime(date: Date): string {
  const now = new Date();
  const time = date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `오늘 ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `내일 ${time}`;
  return `${date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} ${time}`;
}

/** 약속까지 남은 시간: "30분 뒤 약속" / "2시간 뒤 약속" / "지난 약속" */
export function untilMeet(date: Date): string {
  const diffMin = Math.round((date.getTime() - Date.now()) / 60_000);
  if (diffMin < 0) return "지난 약속";
  if (diffMin < 60) return `${diffMin}분 뒤 약속`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 뒤 약속`;
  return `${Math.round(diffHour / 24)}일 뒤 약속`;
}
