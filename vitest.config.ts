import { defineConfig } from "vitest/config";

// Prüfungen der Oberfläche: Komponenten in einem nachgebauten DOM (jsdom),
// ohne Fenster und ohne Tauri. Der Kern hat seine eigenen (`src/core/selftest.ts`).
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
