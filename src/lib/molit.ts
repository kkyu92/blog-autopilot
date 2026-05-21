/**
 * 국토교통부 아파트 매매 실거래가 API (공공데이터포털)
 * Requires: User-Agent header to bypass WAF
 */

const MOLIT_API_BASE =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
const UA = 'Mozilla/5.0 (compatible; blog-autopilot/1.0)';

// 지역명 키워드 → LAWD_CD (법정동코드 앞 5자리) + 표시명
const REGION_MAP: Array<{ keywords: string[]; code: string; name: string }> = [
  // 서울 강남권
  { keywords: ['강남구', '강남', '압구정', '대치', '도곡', '개포', '일원', '역삼', '논현', '청담', '삼성동', '은마', '래미안대치', '디에이치', '아크로', '타워팰리스'], code: '11680', name: '서울 강남구' },
  { keywords: ['서초구', '서초', '반포', '방배', '잠원', '양재'], code: '11650', name: '서울 서초구' },
  { keywords: ['송파구', '송파', '잠실', '문정', '가락', '석촌', '위례'], code: '11710', name: '서울 송파구' },
  { keywords: ['강동구', '강동', '고덕', '천호', '암사', '길동', '둔촌'], code: '11740', name: '서울 강동구' },
  // 서울 서남권
  { keywords: ['마포구', '마포', '공덕', '합정', '망원', '홍대', '연남', '상암'], code: '11440', name: '서울 마포구' },
  { keywords: ['양천구', '양천', '목동', '신정'], code: '11470', name: '서울 양천구' },
  { keywords: ['강서구', '강서', '마곡', '화곡', '방화'], code: '11500', name: '서울 강서구' },
  { keywords: ['영등포구', '영등포', '여의도', '당산', '문래'], code: '11560', name: '서울 영등포구' },
  { keywords: ['동작구', '동작', '흑석', '노량진', '사당', '이수'], code: '11590', name: '서울 동작구' },
  { keywords: ['관악구', '관악', '봉천', '신림', '낙성대'], code: '11620', name: '서울 관악구' },
  { keywords: ['금천구', '금천', '시흥', '가산'], code: '11545', name: '서울 금천구' },
  { keywords: ['구로구', '구로', '오류', '개봉', '고척'], code: '11530', name: '서울 구로구' },
  // 서울 도심권
  { keywords: ['용산구', '용산', '이촌', '한남', '이태원', '한강로'], code: '11170', name: '서울 용산구' },
  { keywords: ['성동구', '성동', '왕십리', '행당', '금호', '옥수', '응봉', '성수'], code: '11200', name: '서울 성동구' },
  { keywords: ['광진구', '광진', '구의', '자양', '건대', '능동'], code: '11215', name: '서울 광진구' },
  { keywords: ['중구', '명동', '을지로', '충무로', '신당', '황학'], code: '11140', name: '서울 중구' },
  { keywords: ['종로구', '종로', '평창', '혜화', '청운', '사직'], code: '11110', name: '서울 종로구' },
  { keywords: ['서대문구', '서대문', '홍제', '홍은', '연희', '북아현'], code: '11410', name: '서울 서대문구' },
  // 서울 북부권
  { keywords: ['은평구', '은평', '불광', '응암', '연신내', '갈현'], code: '11380', name: '서울 은평구' },
  { keywords: ['성북구', '성북', '길음', '종암', '돈암', '정릉'], code: '11290', name: '서울 성북구' },
  { keywords: ['강북구', '강북', '미아', '번동', '수유'], code: '11305', name: '서울 강북구' },
  { keywords: ['도봉구', '도봉', '방학', '창동', '쌍문', '우이'], code: '11320', name: '서울 도봉구' },
  { keywords: ['노원구', '노원', '상계', '중계', '하계', '공릉', '월계'], code: '11350', name: '서울 노원구' },
  { keywords: ['중랑구', '중랑', '망우', '면목', '상봉', '신내'], code: '11260', name: '서울 중랑구' },
  { keywords: ['동대문구', '동대문', '전농', '답십리', '장안', '이문', '회기'], code: '11230', name: '서울 동대문구' },

  // 경기 성남
  { keywords: ['분당구', '분당', '판교', '정자', '수내', '야탑', '이매', '서현', '백현'], code: '41135', name: '경기 성남시 분당구' },
  { keywords: ['수정구'], code: '41111', name: '경기 성남시 수정구' },
  { keywords: ['중원구'], code: '41113', name: '경기 성남시 중원구' },

  // 경기 수원
  { keywords: ['영통구', '영통', '광교', '망포', '원천'], code: '41117', name: '경기 수원시 영통구' },
  { keywords: ['팔달구', '팔달', '인계', '우만'], code: '41115', name: '경기 수원시 팔달구' },
  { keywords: ['권선구', '권선', '세류', '탑동'], code: '41113', name: '경기 수원시 권선구' },
  { keywords: ['장안구', '장안', '조원'], code: '41111', name: '경기 수원시 장안구' },

  // 경기 용인
  { keywords: ['수지구', '수지', '풍덕천', '죽전', '동천'], code: '41461', name: '경기 용인시 수지구' },
  { keywords: ['기흥구', '기흥', '구성', '보정', '동백'], code: '41463', name: '경기 용인시 기흥구' },
  { keywords: ['처인구', '처인', '역북', '모현'], code: '41465', name: '경기 용인시 처인구' },

  // 경기 고양
  { keywords: ['일산동구', '일산동', '장항', '풍동', '식사'], code: '41285', name: '경기 고양시 일산동구' },
  { keywords: ['일산서구', '일산서', '일산', '덕이', '가좌'], code: '41287', name: '경기 고양시 일산서구' },
  { keywords: ['덕양구', '덕양', '화정', '행신', '능곡'], code: '41281', name: '경기 고양시 덕양구' },

  // 경기 기타
  { keywords: ['하남시', '하남', '미사', '풍산', '덕풍'], code: '41450', name: '경기 하남시' },
  { keywords: ['과천시', '과천', '별양', '중앙동'], code: '41290', name: '경기 과천시' },
  { keywords: ['광명시', '광명', '소하', '하안', '철산'], code: '41210', name: '경기 광명시' },
  { keywords: ['부천시', '부천', '원미', '소사', '오정'], code: '41190', name: '경기 부천시' },
  { keywords: ['안양시', '안양', '평촌', '범계', '호계'], code: '41173', name: '경기 안양시 동안구' },
  { keywords: ['의왕시', '의왕', '내손', '청계'], code: '41430', name: '경기 의왕시' },
  { keywords: ['군포시', '군포', '산본', '당정'], code: '41410', name: '경기 군포시' },
  { keywords: ['남양주시', '남양주', '다산', '별내', '퇴계원'], code: '41360', name: '경기 남양주시' },
  { keywords: ['구리시', '구리', '인창', '교문', '토평'], code: '41310', name: '경기 구리시' },
  { keywords: ['화성시', '화성', '동탄', '봉담', '반월'], code: '41590', name: '경기 화성시' },
  { keywords: ['평택시', '평택', '고덕', '브레인시티'], code: '41220', name: '경기 평택시' },
  { keywords: ['파주시', '파주', '운정', '교하'], code: '41480', name: '경기 파주시' },
  { keywords: ['안산시', '안산', '고잔', '중앙', '선부'], code: '41271', name: '경기 안산시 상록구' },
  { keywords: ['시흥시', '시흥', '배곧', '정왕', '은행'], code: '41390', name: '경기 시흥시' },
];

export interface AptTrade {
  aptNm: string;
  umdNm: string;
  excluUseAr: number;
  floor: number;
  dealAmount: number;
  dealYear: number;
  dealMonth: number;
  dealDay: number;
  buildYear: number;
}

function parseDealAmount(raw: string): number {
  return parseInt(raw.replace(/,/g, '').trim(), 10) || 0;
}

function getTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : '';
}

function parseXmlItems(xml: string): AptTrade[] {
  const items: AptTrade[] = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/g);
  if (!matches) return items;
  for (const item of matches) {
    items.push({
      aptNm: getTag(item, 'aptNm'),
      umdNm: getTag(item, 'umdNm'),
      excluUseAr: parseFloat(getTag(item, 'excluUseAr')) || 0,
      floor: parseInt(getTag(item, 'floor'), 10) || 0,
      dealAmount: parseDealAmount(getTag(item, 'dealAmount')),
      dealYear: parseInt(getTag(item, 'dealYear'), 10) || 0,
      dealMonth: parseInt(getTag(item, 'dealMonth'), 10) || 0,
      dealDay: parseInt(getTag(item, 'dealDay'), 10) || 0,
      buildYear: parseInt(getTag(item, 'buildYear'), 10) || 0,
    });
  }
  return items;
}

async function fetchMonthTrades(lawdCd: string, dealYmd: string): Promise<AptTrade[]> {
  const apiKey = process.env.MOLIT_API_KEY;
  if (!apiKey) throw new Error('MOLIT_API_KEY not set');

  const allItems: AptTrade[] = [];
  let pageNo = 1;
  let totalCount = 999;
  const PAGE_CAP = 4; // max 400 items (enough for summary)

  while (pageNo <= PAGE_CAP && (pageNo - 1) * 100 < totalCount) {
    const url = `${MOLIT_API_BASE}?LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=100&pageNo=${pageNo}&serviceKey=${apiKey}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const xml = await res.text();

    const resultCode = getTag(xml, 'resultCode');
    if (resultCode && resultCode !== '000') {
      throw new Error(`MOLIT API: ${resultCode} ${getTag(xml, 'resultMsg')}`);
    }

    if (pageNo === 1) {
      const tc = getTag(xml, 'totalCount');
      totalCount = tc ? parseInt(tc, 10) : 0;
      if (totalCount === 0) break;
    }

    const items = parseXmlItems(xml);
    allItems.push(...items);
    if (items.length < 100) break;
    pageNo++;
  }

  return allItems;
}

function toEokwon(manwon: number): string {
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000);
    const rem = manwon % 10000;
    return rem > 0 ? `${eok}억 ${rem.toLocaleString()}만` : `${eok}억`;
  }
  return `${manwon.toLocaleString()}만`;
}

function formatSummary(regionName: string, trades: AptTrade[], dealYmd: string): string {
  const year = dealYmd.slice(0, 4);
  const month = parseInt(dealYmd.slice(4, 6), 10);

  const small = trades.filter((t) => t.excluUseAr <= 59);
  const medium = trades.filter((t) => t.excluUseAr > 59 && t.excluUseAr <= 85);
  const large = trades.filter((t) => t.excluUseAr > 85);
  const avg = (arr: AptTrade[]) =>
    arr.length === 0 ? 0 : Math.round(arr.reduce((s, t) => s + t.dealAmount, 0) / arr.length);

  const sorted = [...trades].sort((a, b) => b.dealAmount - a.dealAmount);
  const topTrades = sorted.slice(0, 5);

  let s = `[${regionName} 아파트 실거래가 — ${year}년 ${month}월 (국토교통부 공공데이터)]\n`;
  s += `총 거래 건수: ${trades.length}건\n\n`;

  s += `전용면적별 평균 거래가:\n`;
  if (small.length > 0) s += `  59㎡ 이하: 평균 ${toEokwon(avg(small))} (${small.length}건)\n`;
  if (medium.length > 0) s += `  60~85㎡: 평균 ${toEokwon(avg(medium))} (${medium.length}건)\n`;
  if (large.length > 0) s += `  85㎡ 초과: 평균 ${toEokwon(avg(large))} (${large.length}건)\n`;

  s += `\n주요 거래 사례 (고가 Top 5):\n`;
  for (const t of topTrades) {
    s += `  ${t.aptNm} (${t.umdNm}, 전용 ${t.excluUseAr}㎡, ${t.floor}층, ${t.buildYear}년 건축) `;
    s += `→ ${toEokwon(t.dealAmount)} (${t.dealYear}.${String(t.dealMonth).padStart(2, '0')}.${String(t.dealDay).padStart(2, '0')} 거래)\n`;
  }

  return s;
}

export function extractRegion(keyword: string): { lawdCd: string; regionName: string } | null {
  for (const entry of REGION_MAP) {
    for (const kw of entry.keywords) {
      if (keyword.includes(kw)) {
        return { lawdCd: entry.code, regionName: entry.name };
      }
    }
  }
  return null;
}

/**
 * Returns a formatted real-transaction context string for the LLM writer,
 * or null if no region is detected or API call fails.
 */
export async function buildTransactionContext(keyword: string): Promise<string | null> {
  const region = extractRegion(keyword);
  if (!region) return null;

  // Use 2 months back (data registration lag: ~1~2 months behind real date)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth(); // 0-based

  const prevMonth = new Date(Date.UTC(y, m - 1, 1));
  const prev2Month = new Date(Date.UTC(y, m - 2, 1));

  const ym1 = `${prev2Month.getUTCFullYear()}${String(prev2Month.getUTCMonth() + 1).padStart(2, '0')}`;
  const ym2 = `${prevMonth.getUTCFullYear()}${String(prevMonth.getUTCMonth() + 1).padStart(2, '0')}`;

  try {
    const [trades1, trades2] = await Promise.all([
      fetchMonthTrades(region.lawdCd, ym1),
      fetchMonthTrades(region.lawdCd, ym2),
    ]);

    const primary = trades2.length > 0 ? trades2 : trades1;
    const primaryYmd = trades2.length > 0 ? ym2 : ym1;
    if (primary.length === 0) return null;

    let summary = formatSummary(region.regionName, primary, primaryYmd);

    // Add MoM trend if both months available
    if (trades1.length > 0 && trades2.length > 0) {
      const avg1 = Math.round(trades1.reduce((s, t) => s + t.dealAmount, 0) / trades1.length);
      const avg2 = Math.round(trades2.reduce((s, t) => s + t.dealAmount, 0) / trades2.length);
      const diff = avg2 - avg1;
      const pct = ((diff / avg1) * 100).toFixed(1);
      const trend = diff > 0 ? `상승 (+${pct}%)` : diff < 0 ? `하락 (${pct}%)` : '보합';
      const m1 = parseInt(ym1.slice(4, 6), 10);
      const m2 = parseInt(ym2.slice(4, 6), 10);
      summary += `\n전월 대비 평균 거래가: ${ym1.slice(0, 4)}년 ${m1}월 → ${ym2.slice(0, 4)}년 ${m2}월 ${trend}\n`;
    }

    summary += `\n출처: 국토교통부 실거래가 공개시스템 (https://rt.molit.go.kr)\n`;
    return summary;
  } catch (err) {
    console.warn(
      `[molit] ${region.regionName} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
