import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";
import type { NextConfig } from "next";

// 레포 루트 .env를 Next 프로세스에 주입한다.
// (OPENAI_API_KEY 등은 루트 .env에만 있고 Next는 apps/web 기준 .env만 자동 로드하기 때문)
try {
  const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
  process.loadEnvFile(rootEnv);
} catch {
  // .env가 없거나 이미 주입된 경우는 무시
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@junglebob/ai", "@junglebob/db"]
};

export default nextConfig;
