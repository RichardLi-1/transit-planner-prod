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

export default function Page() {
  return <UserDocsPage />;
}
