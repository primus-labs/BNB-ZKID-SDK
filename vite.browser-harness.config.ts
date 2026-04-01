import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = dirname(fileURLToPath(import.meta.url));

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) {
      copyDirRecursive(from, to);
    } else {
      copyFileSync(from, to);
    }
  }
}

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
    port: 4175,
    proxy: {
      // Same-origin in dev; browser never hits foreign origins (no CORS preflight failures).
      "/brevis-gateway": {
        target: "http://44.226.158.196:8038",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/brevis-gateway/, "")
      },
      "/pado-api": {
        target: "https://api-dev.padolabs.org",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/pado-api/, "")
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4175
  },
  build: {
    outDir: "../../dist-browser-harness",
    emptyOutDir: true
  },
  plugins: [
    {
      name: "copy-browser-fixtures",
      closeBundle() {
        copyDirRecursive(
          resolve(repoRoot, "examples/browser/fixtures"),
          resolve(repoRoot, "dist-browser-harness/fixtures")
        );
      }
    }
  ]
});
