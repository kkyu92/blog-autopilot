// One-shot Google OAuth re-authentication for Blogger + Search Console
// Adds webmasters.readonly scope to existing blogger scope.
// Usage: node --env-file=.env.local scripts/mid-review/reauth.mjs

import { createServer } from "node:http";

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI = "http://localhost:3100/api/auth/blogger/callback",
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in env.");
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/blogger",
  "https://www.googleapis.com/auth/webmasters.readonly",
].join(" ");

const STATE = `mid-review-reauth-${Date.now()}`;

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: STATE,
  }).toString();

const PORT = new URL(GOOGLE_REDIRECT_URI).port || "3100";

console.log("\n=== Google OAuth Re-authentication ===");
console.log("\nOpen this URL in your browser and approve:\n");
console.log(authUrl);
console.log(`\nWaiting for callback on http://localhost:${PORT}/ ...\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (!url.pathname.endsWith("/callback")) {
    res.writeHead(404).end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" }).end(`<h1>OAuth error: ${error}</h1>`);
    console.error("OAuth error:", error);
    server.close();
    process.exit(1);
  }

  if (state !== STATE) {
    res.writeHead(400, { "Content-Type": "text/html" }).end("<h1>State mismatch</h1>");
    console.error("State mismatch — possible CSRF.");
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" }).end("<h1>No code</h1>");
    server.close();
    process.exit(1);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      res.writeHead(500, { "Content-Type": "text/html" }).end(`<h1>Token exchange failed</h1><pre>${errText}</pre>`);
      console.error("Token exchange failed:", errText);
      server.close();
      process.exit(1);
    }

    const tokens = await tokenRes.json();

    // Verify scope
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${tokens.access_token}`);
    const verify = await verifyRes.json();

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
      `<h1>OK — re-auth complete.</h1>
       <p>Granted scope: <code>${verify.scope}</code></p>
       <p>You can close this tab and return to the terminal.</p>`
    );

    console.log("\n=== Token exchange success ===");
    console.log("Granted scope:", verify.scope);
    console.log("\n--- ACTION REQUIRED ---");
    console.log("Update .env.local with this new refresh token:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log("--- END ---\n");

    setTimeout(() => server.close(() => process.exit(0)), 500);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/html" }).end(`<h1>Error</h1><pre>${e.message}</pre>`);
    console.error(e);
    server.close();
    process.exit(1);
  }
});

server.listen(Number(PORT), "127.0.0.1");
