import { defineConfig } from "vite";

export default defineConfig({
  root: "examples/browser",
  define: {
    global: "globalThis"
  },
  resolve: {
    alias: {
      buffer: "buffer"
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis"
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 4175
  },
  preview: {
    host: "127.0.0.1",
    port: 4175
  },
  build: {
    outDir: "../../dist-browser-harness",
    emptyOutDir: true
  }
});
