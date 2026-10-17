import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const srcDir = path.resolve(import.meta.dirname, "./src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/v1": { target: "http://127.0.0.1:3011", changeOrigin: true, secure: false },
      "/media": { target: "http://127.0.0.1:3011", changeOrigin: true, secure: false },
    },
  },
});
