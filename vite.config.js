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
  },
});
