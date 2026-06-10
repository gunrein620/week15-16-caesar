import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function assertContains(relativePath, expected) {
  const contents = read(relativePath);
  if (!contents.includes(expected)) {
    throw new Error(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

function assertMatches(relativePath, pattern, description) {
  const contents = read(relativePath);
  if (!pattern.test(contents)) {
    throw new Error(`${relativePath} must ${description}`);
  }
}

assertContains("src/app/(auth)/auth/complete/page.tsx", "currentUser()");
assertContains("src/app/(auth)/auth/complete/page.tsx", 'redirect("/login")');
assertContains("src/app/(auth)/auth/complete/page.tsx", 'redirect(user.nickname ? "/" : "/signup")');

assertMatches(
  "src/components/auth/LoginButtons.tsx",
  /signIn\(s\.id,\s*\{\s*redirectTo:\s*"\/auth\/complete"\s*\}\)/s,
  "send social OAuth callbacks through /auth/complete",
);
assertMatches(
  "src/components/auth/LoginButtons.tsx",
  /signIn\("guest",\s*\{\s*redirectTo:\s*"\/auth\/complete"\s*\}\)/s,
  "send guest login callbacks through /auth/complete",
);

assertContains("src/app/(main)/layout.tsx", "currentUser()");
assertContains("src/app/(main)/layout.tsx", "viewer=");
assertContains("src/components/layout/TopBar.tsx", "viewer");
assertContains("src/components/layout/TopBar.tsx", 'href="/login"');
assertMatches(
  "src/components/layout/TopBar.tsx",
  /signOut\(\{\s*redirectTo:\s*"\/"\s*\}\)/s,
  "send signout through redirectTo",
);

assertContains(".env.example", 'AUTH_URL="http://localhost:3000"');
assertContains(".env.example", 'NEXTAUTH_URL="http://localhost:3000"');
assertContains(".env.example", 'AUTH_GOOGLE_ID=""');
assertContains(".env.example", 'AUTH_GOOGLE_SECRET=""');

assertContains("package.json", '"sync:rpi-auth-env": "node scripts/sync-rpi-auth-env.mjs"');
assertContains("scripts/sync-rpi-auth-env.mjs", "AUTH_GOOGLE_ID");
assertContains("scripts/sync-rpi-auth-env.mjs", "AUTH_GOOGLE_SECRET");
assertContains("scripts/sync-rpi-auth-env.mjs", "SYNC_AUTH_ORIGIN");
assertContains("scripts/sync-rpi-auth-env.mjs", "REMOTE_SCRIPT_B64");
assertContains("scripts/sync-rpi-auth-env.mjs", ".next/standalone/.env");
assertContains("scripts/deploy-rpi.sh", ".next/standalone/.next/static");
assertContains("README.md", "npm run sync:rpi-auth-env");
assertContains("README.md", "SYNC_AUTH_ORIGIN=1 npm run sync:rpi-auth-env");

console.log("Auth flow verification passed.");
