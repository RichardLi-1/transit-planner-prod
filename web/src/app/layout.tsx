import "~/styles/globals.css";

import { type Metadata } from "next";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import MobileWarningModal from "./_components/MobileWarningModal";
import VercelRedirectModal from "./_components/VercelRedirectModal";
import MixpanelInit from "./_components/MixpanelInit";
import PreviewBuildBadge from "./_components/PreviewBuildBadge";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

export const metadata: Metadata = {
  title: "Transit Planner",
  description: "Urban transit intelligence",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var s=localStorage.getItem("darkMode");var d=(s===null)?window.matchMedia("(prefers-color-scheme: dark)").matches:s==="1";if(d)document.documentElement.classList.add("dark");if(localStorage.getItem("highContrast")==="1")document.documentElement.classList.add("hc");}catch(e){}})();` }} />
        {/* mapbox-gl.css is copied to public/ by the prebuild script.
            We load it here instead of via webpack import because npm workspaces
            hoists mapbox-gl to the monorepo root, and Next.js's CSS pipeline
            can't process CSS files from parent directories. */}
        <link rel="stylesheet" href="/mapbox-gl.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Google+Sans+Display:wght@400;500;700&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Auth0Provider>
          <MixpanelInit />
          <MobileWarningModal />
          <VercelRedirectModal />
          <PreviewBuildBadge />
          {children}
        </Auth0Provider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
