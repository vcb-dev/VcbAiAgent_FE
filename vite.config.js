import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const srcDir = path.resolve(import.meta.dirname, "./src");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const beProxy = env.VITE_BE_PROXY || "http://localhost:3001";
  const aiProxy = env.VITE_MEDIA_PROXY || "http://localhost:8787";

  console.log(`[vite] API proxy /api/v1 → ${beProxy}`);
  console.log(`[vite] media proxy /media → ${aiProxy}`);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": srcDir,
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api/v1": { target: beProxy, changeOrigin: true, secure: false },
        "/media": { target: aiProxy, changeOrigin: true, secure: false },
      },
    },
  };
});
