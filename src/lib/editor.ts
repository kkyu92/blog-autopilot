import { callClaude } from './llm';
import { factcheck } from './factcheck';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_PATH = path.resolve(__dirname, '../../prompts/agents/content-editor.md');
const PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8');

export interface EditorReviewInput {
  draft: {
    title: string;
    content_html: string;
    word_count: number;
    image_slots?: Array<{ slot_id: string; search_query: string; alt_text: string }>;
    faq?: Array<{ q: string; a: string }>;
    keyword: string;
    [key: string]: unknown; // allow extra writer agent fields without breaking
  };
  niche: 'WS' | 'TS' | 'AS';
}

export interface EditorReviewResult {
  verdict: 'pass' | 'revision_needed';
  score: number;
  reason?: string;
  feedback?: string;
  disclaimer_inserted?: boolean; // signals caller to update draft.content_html
  modified_html?: string;        // returned separately — caller decides to apply
  final_html?: string;           // from LLM persona output, present when LLM approves (status='approved')
  final_meta?: {                 // from LLM persona output, present when LLM approves
    title: string;
    meta_description: string;
    slug: string;
    labels: string[];
  };
}

export async function review(input: EditorReviewInput): Promise<EditorReviewResult> {
  const { draft, niche } = input;

  // Step 1: Quantitative checks (synchronous, fast)
  const issues: string[] = [];
  if (draft.word_count < 1200) {
    issues.push('word_count < 1200, 더 길게 써야 함 (최소 1200 단어 필요)');
  }
  if (!draft.image_slots || draft.image_slots.length < 2) {
    issues.push('image_slots 최소 2개 필요 (현재 부족)');
  }

  // Step 2: YMYL factcheck (WS/AS niche only)
  let disclaimerInserted = false;
  let modifiedHtml: string | undefined;

  if (niche === 'WS' || niche === 'AS') {
    const fc = await factcheck({ niche, draft });
    if (fc.verdict === 'needs_revision') {
      const fcDescriptions = fc.issues?.map((i) => i.description).join('; ') ?? 'factcheck 실패';
      issues.push(`factcheck: ${fcDescriptions}`);
    }
    // Disclaimer was added by factcheck — return separately, do NOT mutate input
    if (fc.disclaimer_added && fc.modified_html) {
      disclaimerInserted = true;
      modifiedHtml = fc.modified_html;
    }
  }

  // Step 3: LLM qualitative review (tone, structure, CTA)
  const raw = await callClaude({
    systemPrompt: PROMPT,
    userMessage: JSON.stringify(draft),
    expectJson: true,
  });

  const parsed = JSON.parse(raw);
  // Persona schema는 'status' = 'approved'|'revision_needed' 이지만 LLM이 verdict/approved/quality_score만
  // 반환하는 drift 케이스 대응 (운영 중 발견). 다양한 키 fallback.
  const inferStatus = (p: Record<string, unknown>): 'approved' | 'revision_needed' => {
    if (p.status === 'approved' || p.status === 'revision_needed') return p.status;
    if (p.verdict === 'approved' || p.verdict === 'pass') return 'approved';
    if (p.verdict === 'revision_needed' || p.verdict === 'fail') return 'revision_needed';
    if (typeof p.approved === 'boolean') return p.approved ? 'approved' : 'revision_needed';
    const score =
      typeof p.quality_score === 'number'
        ? p.quality_score
        : typeof p.score === 'number'
          ? p.score
          : null;
    if (score !== null) return score >= 80 ? 'approved' : 'revision_needed';
    throw new Error(
      `editor: missing status/verdict (raw keys: ${Object.keys(p).join(',')})`,
    );
  };
  const status = inferStatus(parsed);

  const llmRevisionNeeded = status === 'revision_needed';
  const score = parsed.quality_score ?? parsed.score ?? (llmRevisionNeeded ? 60 : 85);
  const llmFeedback = parsed.revision_notes ?? '';

  // Combine all failure signals
  if (issues.length > 0 || llmRevisionNeeded) {
    const feedbackParts = [...issues];
    if (llmFeedback) feedbackParts.push(llmFeedback);

    return {
      verdict: 'revision_needed',
      score,
      reason: feedbackParts.join('; '),
      feedback: feedbackParts.join('\n'),
      ...(disclaimerInserted && { disclaimer_inserted: true, modified_html: modifiedHtml }),
    };
  }

  // LLM approved — carry through final_html and final_meta from persona output
  return {
    verdict: 'pass',
    score,
    ...(disclaimerInserted && { disclaimer_inserted: true, modified_html: modifiedHtml }),
    ...(parsed.final_html !== undefined && { final_html: parsed.final_html }),
    ...(parsed.final_meta !== undefined && { final_meta: parsed.final_meta }),
  };
}
