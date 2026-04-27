import { aggregateAsSignals } from '../src/lib/realestate-news';

async function main() {
  console.log('Fetching 4 sources (windowHours=72)...\n');
  const start = Date.now();
  const results = await aggregateAsSignals({ windowHours: 72, maxItems: 80 });
  const elapsed = Date.now() - start;
  console.log(`✅ ${results.length} signals in ${elapsed}ms\n`);

  const bySource: Record<string, number> = {};
  for (const r of results) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  console.log('Source 분포:', bySource, '\n');

  console.log('First 30 titles:');
  results.slice(0, 30).forEach((s, i) => {
    console.log(`  ${i + 1}. [${s.source}] ${s.title.slice(0, 80)}`);
  });

  const cats = {
    청약: 0,
    정책: 0,
    시세_거래: 0,
    세금: 0,
    신혼_청년: 0,
    재건축_재개발: 0,
    신도시_GTX: 0,
    임대_LH_SH: 0,
    기타: 0,
  };
  for (const s of results) {
    const t = s.title;
    if (/청약|분양|특별공급/.test(t)) cats.청약++;
    else if (/LTV|DTI|DSR|규제|상한제|법|개정/.test(t)) cats.정책++;
    else if (/시세|매매|전세|월세|거래|가격/.test(t)) cats.시세_거래++;
    else if (/양도세|취득세|종부세|재산세|세금/.test(t)) cats.세금++;
    else if (/신혼|청년|행복주택/.test(t)) cats.신혼_청년++;
    else if (/재건축|재개발|리모델링/.test(t)) cats.재건축_재개발++;
    else if (/신도시|GTX|광역|택지/.test(t)) cats.신도시_GTX++;
    else if (/LH|SH|GH|HUG|임대|매입임대|장기안심/.test(t)) cats.임대_LH_SH++;
    else cats.기타++;
  }
  console.log('\n카테고리 추정:', cats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
