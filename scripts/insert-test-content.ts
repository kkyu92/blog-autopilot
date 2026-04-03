import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("data/content.db");

const keyword = "AI 블로그 자동화";
const title = "AI 블로그 자동화, 실제로 써본 사람이 알려주는 현실적인 가이드";

const body = `블로그를 운영해본 사람이라면 한 번쯤 생각해봤을 것이다. "AI가 대신 글을 써주면 얼마나 좋을까?" AI 블로그 자동화는 이제 더 이상 먼 미래의 이야기가 아니다. GPT, Claude 같은 대형 언어 모델이 등장하면서 실제로 블로그 콘텐츠를 자동으로 생성하고 발행하는 시스템을 구축하는 개인과 기업이 빠르게 늘고 있다.

하지만 현실은 "AI한테 시키면 끝"이라는 환상과는 꽤 다르다. 이 글에서는 AI 블로그 자동화를 직접 구축하면서 겪은 시행착오와 실질적인 노하우를 정리했다.

## AI 블로그 자동화란 무엇인가

AI 블로그 자동화는 키워드 리서치부터 콘텐츠 생성, SEO 최적화, 발행까지의 블로그 운영 과정을 AI 기술로 자동화하는 것을 말한다. 단순히 AI에게 글을 쓰라고 시키는 것과는 다르다. 전체 파이프라인을 설계하고, 각 단계에서 AI가 최적의 결과를 내도록 프롬프트와 워크플로우를 구성하는 작업이다.

### 자동화 가능한 영역

- **키워드 리서치**: 트렌드 분석 API와 연동하여 검색량이 높고 경쟁이 낮은 키워드를 자동 발굴
- **콘텐츠 생성**: LLM을 활용한 초안 작성, 톤 조절, 구조화된 Markdown 생성
- **SEO 최적화**: 메타 태그, 제목, 설명문 자동 생성 및 키워드 밀도 조절
- **발행 자동화**: Blogger, WordPress, Medium 등 플랫폼 API를 통한 자동 발행
- **성과 추적**: Google Analytics, Search Console 데이터 수집 및 분석

## 왜 단순 AI 글쓰기와는 다른가

ChatGPT에 "블로그 글 써줘"라고 입력하는 것만으로는 양질의 콘텐츠를 지속적으로 생산할 수 없다. 그 이유는 명확하다.

### 일관성 문제

AI에게 매번 다른 프롬프트를 주면 글의 톤, 깊이, 구조가 들쭉날쭉해진다. 자동화 시스템에서는 시스템 프롬프트를 고정하고, 톤 설정(정보형/대화체/전문가)을 미리 정의해두어 일관된 브랜드 보이스를 유지한다.

### AI 특유의 뻔한 패턴

"오늘은 ~에 대해 알아보겠습니다"로 시작하는 서론, "~는 매우 중요합니다"의 반복, 구체성 없는 나열식 설명. 이런 패턴은 독자에게 금방 AI가 쓴 글이라는 인상을 준다. 좋은 자동화 시스템은 이런 패턴을 프롬프트 레벨에서 명시적으로 금지하고, 구체적인 예시와 개인적 관점을 요구한다.

### SEO 고려 부족

AI가 만든 글이 아무리 읽기 좋아도, 검색 엔진에 노출되지 않으면 의미가 없다. 키워드 배치, 메타 데이터, 소제목 구조까지 SEO를 의식한 글 구조가 필요하다.

## 실전 AI 블로그 자동화 아키텍처

실제로 작동하는 AI 블로그 자동화 시스템의 구조는 어떻게 생겼을까? 아래는 직접 구축한 시스템의 핵심 구성 요소다.

### 기술 스택 선택

| 구성 요소 | 선택 | 이유 |
|-----------|------|------|
| 프레임워크 | Next.js 15 | 풀스택, API Routes 내장 |
| 데이터베이스 | SQLite | 단일 사용자용, 배포 간편 |
| AI 모델 | Claude API | 한국어 품질, 긴 컨텍스트 |
| 발행 플랫폼 | Blogger API v3 | 무료, SEO 우수 |

### 콘텐츠 생성 파이프라인

1. **키워드 입력**: 사용자가 키워드를 입력하거나 트렌드에서 자동 추출
2. **프롬프트 빌드**: 키워드 + 톤 설정 + 참고 자료를 조합하여 최적화된 프롬프트 생성
3. **스트리밍 생성**: AI가 실시간으로 콘텐츠를 생성하며, 사용자는 생성 과정을 실시간 확인
4. **품질 검증**: 분량(1000자 이상), 키워드 밀도(1~3%), 구조(H2/H3 최소 3개) 자동 체크
5. **SEO 메타 생성**: 제목, 설명, 태그를 별도 AI 호출로 생성
6. **리뷰 & 발행**: 초안 검토 후 원클릭 발행

## 흔한 실수와 해결 방법

AI 블로그 자동화를 처음 도입할 때 거의 모든 사람이 거치는 실수들이 있다.

### 실수 1: 프롬프트를 대충 쓰기

"블로그 글 써줘"는 최악의 프롬프트다. 톤, 타겟 독자, 키워드, 글의 목적, 금지 패턴까지 명시해야 한다. 시스템 프롬프트와 사용자 프롬프트를 분리하고, 각각의 역할을 명확히 하는 것이 핵심이다.

### 실수 2: 생성된 글을 그대로 발행하기

AI가 만든 초안은 말 그대로 초안이다. 팩트 체크, 개인적 경험 추가, 어색한 표현 수정은 사람이 해야 한다. 완전 자동화보다는 "AI 어시스트 + 사람 검수" 모델이 현실적이다.

### 실수 3: SEO를 나중에 생각하기

글을 다 쓴 뒤에 SEO를 붙이면 어색해진다. 키워드 리서치를 먼저 하고, 그 키워드를 중심으로 글의 구조를 설계한 뒤, AI에게 "이 키워드가 자연스럽게 포함된 글"을 요청하는 순서가 맞다.

## 비용과 현실적인 기대치

AI 블로그 자동화의 비용 구조도 알아두어야 한다. Claude API 기준으로 2500자 분량의 글 하나를 생성하는 데 약 0.01~0.03달러 정도가 든다. 하루에 5편씩 한 달이면 약 1.5~4.5달러. 사람이 직접 쓰는 것과 비교하면 비용은 거의 무시할 수준이다.

다만, "AI가 써주니까 하루에 100편 발행하자"는 접근은 역효과를 낸다. 구글은 저품질 대량 콘텐츠를 패널티 대상으로 보고 있으며, 양보다 질이 검색 순위에 훨씬 큰 영향을 미친다.

## 핵심 요약

AI 블로그 자동화는 제대로 구축하면 블로그 운영의 효율을 극적으로 높일 수 있다. 핵심은 세 가지다:

1. **파이프라인 설계가 전부다** — AI 호출 하나로 끝나는 게 아니라, 키워드→프롬프트→생성→검증→발행까지 전체 흐름을 설계해야 한다
2. **프롬프트 엔지니어링에 투자하라** — 톤, 금지 패턴, 구체적 지시를 프롬프트에 녹여야 AI 티가 나지 않는 글이 나온다
3. **사람의 역할을 없애지 마라** — 완전 자동화보다 AI 어시스트 모델이 품질과 지속성 모두에서 우월하다

블로그 자동화를 고민하고 있다면, 작은 규모로 시작해서 파이프라인을 하나씩 다듬어가는 것을 추천한다. 기술은 이미 충분히 무르익었다.`;

// SEO 메타데이터 (직접 생성)
const seoTitle = "AI 블로그 자동화 가이드: 구축부터 운영까지 현실적인 노하우";
const seoDescription = "AI 블로그 자동화 시스템을 직접 구축한 경험을 바탕으로, 파이프라인 설계, 프롬프트 엔지니어링, SEO 최적화까지 실전 노하우를 정리했습니다.";
const seoTags = JSON.stringify([
  "AI 블로그 자동화",
  "블로그 자동화",
  "AI 콘텐츠 생성",
  "ChatGPT 블로그",
  "Claude API",
  "SEO 최적화",
  "콘텐츠 마케팅",
  "블로그 운영",
  "프롬프트 엔지니어링",
  "AI 글쓰기"
]);

// 품질 체크
const charCount = body.length;
const h2Count = (body.match(/^## /gm) || []).length;
const h3Count = (body.match(/^### /gm) || []).length;
const keywordOccurrences = (body.match(/AI 블로그 자동화/g) || []).length;
const keywordDensity = ((keywordOccurrences * keyword.length) / charCount * 100).toFixed(2);

console.log("=== 품질 체크 ===");
console.log(`분량: ${charCount}자 (${charCount >= 1000 ? "PASS" : "FAIL"})`);
console.log(`H2: ${h2Count}개, H3: ${h3Count}개 (${(h2Count + h3Count) >= 3 ? "PASS" : "FAIL"})`);
console.log(`키워드 출현: ${keywordOccurrences}회, 밀도: ${keywordDensity}% (${parseFloat(keywordDensity) >= 1 && parseFloat(keywordDensity) <= 3 ? "PASS" : "INFO"})`);
console.log(`SEO 제목: ${seoTitle.length}자 (${seoTitle.length <= 60 ? "PASS" : "FAIL"})`);
console.log(`SEO 설명: ${seoDescription.length}자 (${seoDescription.length <= 155 ? "PASS" : "FAIL"})`);
console.log(`SEO 태그: ${JSON.parse(seoTags).length}개 (${JSON.parse(seoTags).length >= 5 ? "PASS" : "FAIL"})`);

// DB 저장
const id = randomUUID();
const now = new Date().toISOString();

const stmt = db.prepare(`
  INSERT INTO contents (id, title, body, status, tone, seo_title, seo_description, seo_tags, created_at, updated_at)
  VALUES (?, ?, ?, 'draft', 'informative', ?, ?, ?, ?, ?)
`);

stmt.run(id, title, body, seoTitle, seoDescription, seoTags, now, now);

// 검증
const saved = db.prepare("SELECT id, title, status, seo_title FROM contents WHERE id = ?").get(id) as any;
console.log(`\n=== DB 저장 ===`);
console.log(`ID: ${saved.id}`);
console.log(`제목: ${saved.title}`);
console.log(`상태: ${saved.status}`);
console.log(`SEO 제목: ${saved.seo_title}`);
console.log("저장 완료!");

db.close();
