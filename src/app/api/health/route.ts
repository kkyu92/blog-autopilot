import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));

export async function GET() {
  return NextResponse.json({ status: "ok", version: pkg.version, timestamp: new Date().toISOString() });
}
