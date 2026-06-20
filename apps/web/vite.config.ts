import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["img/zopy.png", "img/tabimage1.png"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      manifest: {
        id: "/",
        name: "Zopy",
        short_name: "Zopy",
        description: "Print from anywhere",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "browser"],
        background_color: "#09090b",
        theme_color: "#09090b",
        lang: "en",
        // Tells Chrome to reuse an existing PWA window instead of opening a new browser tab
        launch_handler: { client_mode: "navigate-existing" },
        // Required for getInstalledRelatedApps() to detect this PWA
        related_applications: [{ platform: "webapp", url: "/manifest.webmanifest" }],
        icons: [
          {
            src: "/img/zopy.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      } as any,
      workbox: {
        navigateFallback: "/",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Never cache API responses — always go to network
            urlPattern: /\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});
