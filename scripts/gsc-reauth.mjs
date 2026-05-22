#!/usr/bin/env node
/**
 * GSC 재인증 스크립트
 * webmasters + blogger 스코프 포함한 새 refresh token 발급
 */
import http from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { URL } from 'url';

const ENV_FILE = new URL('../.env.local', import.meta.url).pathname;

function loadEnv(path) {
  const vars = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim();
    }
  } catch {}
  return vars;
}

const env = loadEnv(ENV_FILE);
const CLIENT_ID = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3100/api/auth/blogger/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/blogger',
  'https://www.googleapis.com/auth/webmasters',
].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n=== GSC 재인증 ===\n');
console.log('브라우저에서 아래 URL 열기:\n');
console.log(authUrl);
console.log('\n로컬 서버 대기 중 (port 3100)...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3100');
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400);
    res.end(`인증 오류: ${error}`);
    console.error('인증 오류:', error);
    server.close();
    return;
  }

  if (!code) {
    res.writeHead(400);
    res.end('code 파라미터 없음');
    return;
  }

  console.log('인증 코드 수신. 토큰 교환 중...');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    res.writeHead(500);
    res.end(`토큰 교환 실패: ${JSON.stringify(tokenData)}`);
    console.error('토큰 교환 실패:', tokenData);
    server.close();
    return;
  }

  const newRefreshToken = tokenData.refresh_token;
  if (!newRefreshToken) {
    res.writeHead(500);
    res.end('refresh_token 없음 — prompt=consent 빠졌거나 이미 인증됨');
    console.error('refresh_token 없음:', tokenData);
    server.close();
    return;
  }

  // .env.local 업데이트
  const raw = readFileSync(ENV_FILE, 'utf8');
  const updated = raw.replace(
    /^GOOGLE_REFRESH_TOKEN=.*/m,
    `GOOGLE_REFRESH_TOKEN=${newRefreshToken}`
  );
  writeFileSync(ENV_FILE, updated);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h2>✅ 인증 완료. 창 닫으세요.</h2>');

  console.log('\n✅ 새 refresh token 저장 완료 (.env.local)');
  console.log(`   scope: blogger + webmasters`);
  server.close();
  process.exit(0);
});

server.listen(3100, () => {});
