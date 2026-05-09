import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "dist/editor",
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/editor/main.tsx"),
      output: {
        entryFileNames: "main.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
