import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SPA on Cloudflare Pages: absolute base "/" so assets resolve under dist/.
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
