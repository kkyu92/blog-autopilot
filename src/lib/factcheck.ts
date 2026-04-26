import { callClaude } from './llm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_PATH = path.resolve(__dirname, '../../prompts/agents/fact-checker.md');
const PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8');

export interface FactCheckInput {
  niche: 'WS' | 'TS' | 'AS';
  draft: { content_html: string; title: string; keyword: string };
}

export interface FactCheckResult {
  verdict: 'pass' | 'needs_revision' | 'skipped';
  issues?: Array<{
    type: 'source' | 'recency' | 'disclaimer' | 'forbidden';
    description: string;
    suggested_fix: string;
  }>;
  disclaimer_added?: boolean;
  modified_html?: string;
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
    systemPrompt: PROMPT,
    userMessage,
    expectJson: true,
  });

  const parsed = JSON.parse(raw);
  if (parsed.verdict !== 'pass' && parsed.verdict !== 'needs_revision') {
    throw new Error(`factcheck: unexpected verdict "${parsed.verdict}" from LLM`);
  }
  return parsed as FactCheckResult;
}
