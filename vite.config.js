import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const srcDir = path.resolve(import.meta.dirname, "./src");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Dùng 127.0.0.1 thay vì localhost: Node 17+ phân giải localhost ra ::1 trước, nên nếu
  // tiến trình khác đang giữ [::1]:<port> thì proxy sẽ im lặng đi nhầm chỗ.
  const beProxy = env.VITE_BE_PROXY || "http://127.0.0.1:3011";
  const aiProxy = env.VITE_MEDIA_PROXY || "http://127.0.0.1:8787";

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
