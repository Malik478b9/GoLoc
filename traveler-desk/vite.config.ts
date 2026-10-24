import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Each app has its own fixed port (traveler 5174, captain 5175, admin 5176).
// strictPort: fail loudly instead of silently taking another app's port.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
