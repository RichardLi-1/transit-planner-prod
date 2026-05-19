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

export default function Page() {
  return <TechnicalDocsPage />;
}
