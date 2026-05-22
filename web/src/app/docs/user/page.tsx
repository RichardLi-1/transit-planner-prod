import { type Metadata } from "next";
import UserDocsPage from "./UserDocsPage";

export const metadata: Metadata = {
  title: "User Guide",
  description:
    "How to draw transit routes, edit stops, run the AI planning council, and export GTFS files in Transit Planner.",
  openGraph: {
    title: "User Guide — Transit Planner Docs",
    description:
      "How to draw routes, edit stops, run the AI council, and export planning-ready GTFS files.",
    url: "/docs/user",
  },
  twitter: {
    title: "User Guide — Transit Planner Docs",
    description:
      "How to draw routes, edit stops, run the AI council, and export planning-ready GTFS files.",
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://transitplanner.app" },
    { "@type": "ListItem", position: 2, name: "Docs", item: "https://transitplanner.app/docs" },
    { "@type": "ListItem", position: 3, name: "User Guide", item: "https://transitplanner.app/docs/user" },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <UserDocsPage />
    </>
  );
}
