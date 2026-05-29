import { callClaude } from './llm';
import { buildCurrentDateHeader } from './current-date';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_PATH = path.resolve(__dirname, '../../prompts/agents/fact-checker.md');
const PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8');

export interface FactCheckInput {
  niche: 'HS' | 'TS' | 'AS';
  draft: { content_html: string; title: string; keyword: string };
}

export interface FactCheckIssue {
  type: 'source' | 'recency' | 'disclaimer' | 'forbidden';
  description: string;
  suggested_fix: string;
  severity?: 'critical' | 'warn';
}

export interface FactCheckResult {
  verdict: 'pass' | 'needs_revision' | 'skipped';
  issues?: FactCheckIssue[];
  disclaimer_added?: boolean;
  modified_html?: string;
}

// 5/29 AdSense reject family ("가치 있는 인벤토리 부족"): factcheck soft-warn only 였으나
// 출처 전무 / URL 미제공 / 발화자 미명시 / URL-데이터 불일치 류는 AI slop signal 로
// AdSense reviewer 가 직접 본다. severity='critical' 라벨링 → editor 에서 hard escalation.
const CRITICAL_DESCRIPTION_PATTERNS: RegExp[] = [
  /출처\s*전무/,
  /출처\s*전혀\s*없/,
  /출처\s*없음/,
  /출처\s*불명/,
  /구체적\s*출처\s*없/,
  /구체적\s*출처\s*전무/,
  /구체적\s*출처\s*전혀/,
  /URL\s*미제공/,
  /URL[-\s]*데이터\s*불일치/,
  /발화자\s*미명시/,
  /발화자[·、,\s]*소속[·、,\s]*출처\s*전혀\s*없/,
  /URL\s*없음/,
];

function classifySeverity(issue: FactCheckIssue): 'critical' | 'warn' {
  if (issue.type !== 'source') return 'warn';
  return CRITICAL_DESCRIPTION_PATTERNS.some((re) => re.test(issue.description)) ? 'critical' : 'warn';
}

export async function factcheck(input: FactCheckInput): Promise<FactCheckResult> {
  if (input.niche === 'TS') return { verdict: 'skipped' };

  const userMessage = JSON.stringify({
    niche: input.niche,
    title: input.draft.title,
    keyword: input.draft.keyword,
    content_html: input.draft.content_html,
  });

  const raw = await callClaude({
    systemPrompt: buildCurrentDateHeader() + PROMPT,
    userMessage,
    expectJson: true,
  });

  const parsed = JSON.parse(raw) as FactCheckResult;
  if (parsed.verdict !== 'pass' && parsed.verdict !== 'needs_revision') {
    throw new Error(`factcheck: unexpected verdict "${parsed.verdict}" from LLM`);
  }
  if (Array.isArray(parsed.issues)) {
    parsed.issues = parsed.issues.map((i) => ({
      ...i,
      severity: i.severity ?? classifySeverity(i),
    }));
  }
  return parsed;
}
