import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig } from "vite";

const packageVersion = process.env.npm_package_version ?? "0.1.0";
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
const appVersion = commitSha ? `${packageVersion}+${commitSha}` : packageVersion;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
