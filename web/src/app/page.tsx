import LandingPage from "~/app/_components/LandingPage";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Transit Planner",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web",
  url: "https://transitplanner.app",
  description:
    "AI-powered urban transit design tool. Draw subway, streetcar, and bus routes on an interactive map of Toronto, then watch an AI council debate ridership, cost, and community impact.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "CAD",
  },
  featureList: [
    "Interactive map editor for drawing transit routes",
    "AI planning council with six specialized agents",
    "GTFS import and export",
    "Population and ridership data",
    "Neighbourhood intelligence",
  ],
  inLanguage: "en-CA",
  applicationSubCategory: "Urban Planning",
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
