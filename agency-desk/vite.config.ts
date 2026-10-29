import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Each app has its own fixed port (traveler 5174, captain 5175, admin 5176, agency 5177).
// strictPort: fail loudly instead of silently taking another app's port.
// VITE_BASE=/agency/ when served next to the admin console (deploy/nginx.Dockerfile).
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: { port: 5177, strictPort: true },
  preview: { port: 5177, strictPort: true },
});
