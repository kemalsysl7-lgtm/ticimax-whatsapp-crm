import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only paketi test ortamında boş modüle çözülür.
      "server-only": path.resolve(__dirname, "src/lib/__server-only-stub.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
