import { type Metadata } from "next";
import TimetableContent from "./TimetableContent";

export const metadata: Metadata = {
  title: "Timetable",
  robots: { index: false, follow: false },
};

export default function TimetablePage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  return <TimetableContent params={params} />;
}
