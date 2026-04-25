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
  if (parsed.verdict !== 'pass' && parsed.verdict !== 'revision_needed') {
    throw new Error(`editor: unexpected verdict "${parsed.verdict}" from LLM`);
  }

  const llmResult = parsed as {
    verdict: 'pass' | 'revision_needed';
    score?: number;
    reason?: string;
    feedback?: string;
  };

  // Combine all failure signals
  if (issues.length > 0 || llmResult.verdict === 'revision_needed') {
    const feedbackParts = [...issues];
    if (llmResult.feedback) feedbackParts.push(llmResult.feedback);

    const reasonParts = [...issues];
    if (llmResult.reason) reasonParts.push(llmResult.reason);

    return {
      verdict: 'revision_needed',
      score: llmResult.score ?? 60,
      reason: reasonParts.join('; '),
      feedback: feedbackParts.join('\n'),
      ...(disclaimerInserted && { disclaimer_inserted: true, modified_html: modifiedHtml }),
    };
  }

  return {
    verdict: 'pass',
    score: llmResult.score ?? 85,
    ...(disclaimerInserted && { disclaimer_inserted: true, modified_html: modifiedHtml }),
  };
}
