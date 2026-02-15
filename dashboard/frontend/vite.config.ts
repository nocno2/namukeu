import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8002",
      "/health": "http://127.0.0.1:8002",
      "/proxy": "http://127.0.0.1:8002",
    },
  },
});
