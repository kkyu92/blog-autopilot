#!/usr/bin/env node
/**
 * About 페이지 업데이트 스크립트 — AdSense E-E-A-T 강화
 * 사용법: node scripts/update-about-pages.mjs
 */
import { readFileSync } from 'fs';
import { URL } from 'url';

const ENV_FILE = new URL('../.env.local', import.meta.url).pathname;

function loadEnv(path) {
  const vars = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
  return vars;
}

const env = loadEnv(ENV_FILE);
const CLIENT_ID = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = env.GOOGLE_REFRESH_TOKEN;

const BLOG_IDS = {
  AS: env.GOOGLE_BLOG_ID_APT ?? env.GOOGLE_BLOG_ID,
  TS: env.GOOGLE_BLOG_ID_TRIP,
  HS: env.GOOGLE_BLOG_ID_HEALTH,
};

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function listPages(blogId, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages?status=live`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  return data.items ?? [];
}

async function updatePage(blogId, pageId, title, content, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages/${pageId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: pageId, title, content }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(`Page update failed: ${JSON.stringify(data.error)}`);
  return data;
}

async function createPage(blogId, title, content, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, content }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(`Page create failed: ${JSON.stringify(data.error)}`);
  return data;
}

const ABOUT_CONTENT = {
  AS: {
    title: '소개 | apt-signal',
    content: `<div style="max-width:720px;margin:0 auto;padding:0 16px;font-family:'Noto Sans KR',-apple-system,sans-serif;">
<h2 style="font-size:22px;font-weight:700;color:#1A1A1A;line-height:1.3;margin:32px 0 12px 0;padding-bottom:8px;border-bottom:2px solid #4285F4;">apt-signal 소개</h2>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">apt-signal은 수도권 아파트 분양·청약·재건축 시장을 분석하고 실용적인 정보를 전달하는 부동산 정보 블로그입니다. 국토교통부 실거래가 데이터, 청약홈 통계, 한국부동산원 자료를 기반으로 시장 흐름을 꾸준히 분석합니다.</p>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">다루는 주제</h3>
<ul style="margin:12px 0;padding-left:24px;">
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">수도권 신규 분양 단지 분석 및 청약 전략</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://rt.molit.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국토교통부 실거래가</a> 데이터 기반 시세 분석</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">LH·SH 공공분양 및 <a href="https://www.applyhome.co.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">청약홈</a> 정보 정리</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">아파트 재건축·재개발 현황 및 추진 단계</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">부동산 정책 변화 및 세금 규제 분석</li>
</ul>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">데이터 출처</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">이 블로그의 모든 수치와 분석은 다음 공공기관 공식 자료를 기반으로 합니다:</p>
<ul style="margin:12px 0;padding-left:24px;">
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://rt.molit.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국토교통부 실거래가 공개시스템</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.applyhome.co.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">청약홈 (한국부동산원 운영)</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.reb.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">한국부동산원 통계</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://apply.lh.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">LH 청약센터</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.kbland.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">KB부동산 시세</a></li>
</ul>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">운영 방침</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">apt-signal은 투자 권유나 전문 재무·세무 상담을 제공하지 않습니다. 모든 콘텐츠는 정보 제공 목적이며, 실제 부동산 거래 시 반드시 공인중개사·세무사 등 전문가와 상담하시기 바랍니다. 시장 상황과 정책은 수시로 변하므로 최신 공식 정보를 직접 확인하시기 바랍니다.</p>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">연락처</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">콘텐츠 오류 제보, 제안, 문의는 각 포스트 댓글 또는 이메일(<a href="mailto:kyusikkyu@gmail.com" style="color:#4285F4;">kyusikkyu@gmail.com</a>)로 보내주세요.</p>
</div>`,
  },

  HS: {
    title: '소개 | health-signal',
    content: `<div style="max-width:720px;margin:0 auto;padding:0 16px;font-family:'Noto Sans KR',-apple-system,sans-serif;">
<h2 style="font-size:22px;font-weight:700;color:#1A1A1A;line-height:1.3;margin:32px 0 12px 0;padding-bottom:8px;border-bottom:2px solid #4285F4;">health-signal 소개</h2>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">health-signal은 보건복지부·질병관리청 공식 가이드라인과 의학 연구를 기반으로 정확하고 신뢰할 수 있는 건강 정보를 큐레이션하는 블로그입니다. 검증된 출처의 정보를 이해하기 쉽게 정리해 전달하는 것을 목표로 합니다.</p>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">다루는 주제</h3>
<ul style="margin:12px 0;padding-left:24px;">
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">만성 질환(고혈압·당뇨·고지혈증) 관리 및 예방</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.kdca.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">질병관리청</a> 기반 감염병·백신 최신 정보</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.nhis.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국민건강보험공단</a> 건강검진 항목 해설</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">영양·운동·수면 등 생활 습관 과학적 근거 정리</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">의약품·건강기능식품 성분 및 부작용 분석</li>
</ul>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">정보 출처</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">이 블로그의 건강 정보는 다음 공신력 있는 기관의 공식 자료를 기반으로 작성됩니다:</p>
<ul style="margin:12px 0;padding-left:24px;">
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.mohw.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">보건복지부</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.kdca.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">질병관리청 (KDCA)</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.nhis.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국민건강보험공단</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.ncc.re.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국립암센터</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.mfds.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">식품의약품안전처 (MFDS)</a></li>
</ul>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">중요 고지</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">health-signal의 모든 콘텐츠는 정보 제공 목적이며, 전문 의료 상담을 대체하지 않습니다. 건강 관련 결정을 내리기 전에 반드시 의사·약사 등 전문 의료인과 상담하시기 바랍니다. 의학 정보와 가이드라인은 수시로 업데이트되므로 최신 공식 정보를 직접 확인하시기 바랍니다.</p>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">연락처</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">콘텐츠 오류 제보, 제안, 문의는 각 포스트 댓글 또는 이메일(<a href="mailto:kyusikkyu@gmail.com" style="color:#4285F4;">kyusikkyu@gmail.com</a>)로 보내주세요.</p>
</div>`,
  },

  TS: {
    title: '소개 | trip-signal',
    content: `<div style="max-width:720px;margin:0 auto;padding:0 16px;font-family:'Noto Sans KR',-apple-system,sans-serif;">
<h2 style="font-size:22px;font-weight:700;color:#1A1A1A;line-height:1.3;margin:32px 0 12px 0;padding-bottom:8px;border-bottom:2px solid #4285F4;">trip-signal 소개</h2>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">trip-signal은 국내외 여행지 정보와 실용적인 여행 팁을 큐레이션하는 여행 정보 블로그입니다. 한국관광공사 공식 데이터, 각 지자체 관광 정보, 직접 수집한 현장 정보를 바탕으로 실질적으로 도움이 되는 여행 가이드를 제공합니다.</p>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">다루는 주제</h3>
<ul style="margin:12px 0;padding-left:24px;">
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">국내 여행지 상세 가이드 (서울·제주·부산·강원 등)</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">계절별·테마별 여행 코스 추천</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.visitkorea.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">한국관광공사</a> 인증 관광지 및 축제 정보</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">숙소·맛집·교통 실용 정보</li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;">황금연휴·명절 여행 일정 플래닝</li>
</ul>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">정보 출처</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">이 블로그의 여행 정보는 다음 공공기관 및 공신력 있는 출처를 기반으로 합니다:</p>
<ul style="margin:12px 0;padding-left:24px;">
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.visitkorea.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">한국관광공사 (Korea Tourism Organization)</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.mcst.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">문화체육관광부</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://korean.visitseoul.net" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">서울관광재단</a></li>
  <li style="font-size:16px;color:#333333;line-height:1.8;margin-bottom:6px;"><a href="https://www.jeju.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">제주특별자치도청</a></li>
</ul>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">운영 방침</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">여행 정보는 현지 상황, 계절, 운영 시간 등에 따라 변경될 수 있습니다. 방문 전 최신 정보를 공식 채널에서 직접 확인하시기 바랍니다.</p>

<h3 style="font-size:18px;font-weight:600;color:#333333;line-height:1.3;margin:24px 0 8px 0;">연락처</h3>
<p style="font-size:16px;color:#333333;line-height:1.8;margin:0 0 16px 0;">콘텐츠 오류 제보, 제안, 문의는 각 포스트 댓글 또는 이메일(<a href="mailto:kyusikkyu@gmail.com" style="color:#4285F4;">kyusikkyu@gmail.com</a>)로 보내주세요.</p>
</div>`,
  },
};

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Missing env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN');
  }

  console.log('Getting access token...');
  const accessToken = await getAccessToken();
  console.log('Access token obtained.\n');

  for (const niche of ['AS', 'TS', 'HS']) {
    const blogId = BLOG_IDS[niche];
    if (!blogId) {
      console.warn(`[${niche}] BLOG_ID missing — skip`);
      continue;
    }

    const { title: newTitle, content: newContent } = ABOUT_CONTENT[niche];
    console.log(`[${niche}] blog_id=${blogId}`);

    const pages = await listPages(blogId, accessToken);
    console.log(`[${niche}] ${pages.length} pages found: ${pages.map(p => `"${p.title}"(${p.id})`).join(', ')}`);

    // About 페이지 찾기 (제목에 '소개' 또는 'About' 포함)
    const aboutPage = pages.find(p =>
      /소개|about|introduce/i.test(p.title)
    );

    if (!aboutPage) {
      console.log(`[${niche}] About 페이지 없음 — 신규 생성 중...`);
      const result = await createPage(blogId, newTitle, newContent, accessToken);
      console.log(`[${niche}] Created: ${result.url ?? result.selfLink ?? 'ok'}\n`);
      continue;
    }

    console.log(`[${niche}] Updating "${aboutPage.title}" (id=${aboutPage.id})...`);
    const result = await updatePage(blogId, aboutPage.id, newTitle, newContent, accessToken);
    console.log(`[${niche}] Updated: ${result.url ?? result.selfLink ?? 'ok'}\n`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
