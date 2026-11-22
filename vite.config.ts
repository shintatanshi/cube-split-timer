/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Solver tests build ~16MB pruning tables and assert timing; running files in
    // parallel makes those timings meaningless, so run test files one at a time.
    fileParallelism: false,
  },
  worker: {
    // cubing.js (used only inside src/lib/scrambleWorker.ts) splits its search code
    // into dynamic imports, which needs ES-module workers.
    format: "es",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }

          if (id.includes("@supabase")) {
            return "supabase-vendor";
          }

          if (id.includes("three")) {
            return "three-vendor";
          }

          return "vendor";
        },
      },
    },
  },
});
