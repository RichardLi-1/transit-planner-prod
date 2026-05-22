import { type Metadata } from "next";
import TechnicalDocsPage from "./TechnicalDocsPage";

export const metadata: Metadata = {
  title: "Technical Reference",
  description:
    "Architecture overview, primary modules, deployment notes, and environment variable reference for the Transit Planner application.",
  openGraph: {
    title: "Technical Reference — Transit Planner Docs",
    description:
      "Architecture, modules, and deployment notes for Transit Planner. Built on Next.js 15, Mapbox GL, and Anthropic Claude.",
    url: "/docs/technical",
  },
  twitter: {
    title: "Technical Reference — Transit Planner Docs",
    description:
      "Architecture, modules, and deployment notes for Transit Planner.",
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://transitplanner.app" },
    { "@type": "ListItem", position: 2, name: "Docs", item: "https://transitplanner.app/docs" },
    { "@type": "ListItem", position: 3, name: "Technical Reference", item: "https://transitplanner.app/docs/technical" },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <TechnicalDocsPage />
    </>
  );
}
