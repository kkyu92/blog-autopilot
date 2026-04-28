// LLM 호출 시 현재 날짜 동적 inject + title outdated 연도 검증.
// 4/28 사고 (post 30 "장기안심주택 ... 2025" 발행) 근본해결.
//
// 배경: writer/factcheck/editor 호출 시 현재 날짜 정보를 LLM 에 안 줘서 sonnet 학습 데이터
// cutoff 기준 또는 정책 발표 연도를 그대로 title 에 표기. fact-checker prompt 에 hardcoded
// "2026 기준" 있지만 시간 흐르면 outdated. dynamic inject 가 sustainable.

export interface CurrentDateInfo {
  /** YYYY-MM-DD (KST) */
  date: string;
  /** YYYY (KST) */
  year: number;
}

/** 현재 KST 날짜·연도 반환. 호출 시점 기준. */
export function getCurrentDate(now: Date = new Date()): CurrentDateInfo {
  // toLocaleDateString 'ko-KR' 으로 KST 자연 변환 (BCP-47 'Asia/Seoul' 명시)
  const kstStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
  return {
    date: kstStr,
    year: parseInt(kstStr.slice(0, 4), 10),
  };
}

/**
 * LLM system prompt 에 prepend 할 현재 날짜 컨텍스트 헤더.
 * writer/factcheck/editor 호출 시 사용.
 */
export function buildCurrentDateHeader(now: Date = new Date()): string {
  const { date, year } = getCurrentDate(now);
  return [
    '[CURRENT CONTEXT]',
    `현재 날짜: ${date} (Asia/Seoul, KST)`,
    `현재 연도: ${year}`,
    `title 에 연도 표기 시 ${year} 만 허용. ${year - 1} 이전 연도는 학습 데이터 cutoff/정책 발표 연도라도 title 에 표기 금지.`,
    '',
  ].join('\n');
}

/**
 * title 에 outdated 연도 (current_year 미만) 가 들어있는지 검증.
 * 4 자리 연도 (20XX) 매치. 미래 연도는 통과 (예약·일정 토픽 허용).
 */
export function findOutdatedYearInTitle(
  title: string,
  currentYear: number,
): number | null {
  const matches = title.match(/(20\d{2})/g);
  if (!matches) return null;
  for (const m of matches) {
    const y = parseInt(m, 10);
    if (y < currentYear) return y;
  }
  return null;
}
