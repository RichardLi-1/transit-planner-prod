import { type Metadata } from "next";
import Link from "next/link";
import { InfoNav } from "../_components/InfoNav";
import { InfoFooter } from "../_components/InfoFooter";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms of Use for Transit Planner — usage guidelines, limitations, and conditions for using the platform.",
  robots: { index: true, follow: false },
};

const LAST_UPDATED = "March 16, 2026";

const termsSections = [
  {
    number: "1",
    title: "Summary",
    content: (
      <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>
        Transit Planner is a planning and visualization tool. It may include experimental features such as
        AI-generated suggestions. It is provided on an "as is" basis and is not a substitute for professional
        engineering, legal, or policy advice.
      </p>
    ),
  },
  {
    number: "2",
    title: "Eligibility",
    content: (
      <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>
        You must be able to form a binding agreement where you live to use the service. If you are using
        Transit Planner on behalf of an organization, you represent that you have authority to bind that organization.
      </p>
    ),
  },
  {
    number: "3",
    title: "Acceptable Use",
    content: (
      <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          "Do not attempt to disrupt the service, reverse engineer protected components, or bypass security controls.",
          "Do not upload content you do not have rights to use.",
          "Do not use the service to create or disseminate unlawful, harmful, or discriminatory content.",
        ].map((item, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#2563eb", marginTop: 9, flexShrink: 0 }} />
            <span style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>{item}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    number: "4",
    title: "AI Outputs and Planning Limitations",
    content: (
      <>
        <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75, marginBottom: 12 }}>
          AI outputs may be inaccurate, incomplete, or biased. You are responsible for independently verifying
          outputs before using them in any planning, operational, or policy decision.
        </p>
        <div
          style={{
            padding: "14px 16px", borderRadius: 10,
            backgroundColor: "#fffbeb", border: "1px solid #fde68a",
          }}
        >
          <p style={{ fontSize: 13.5, color: "#92400e", lineHeight: 1.65, margin: 0 }}>
            <strong>Important:</strong> Transit Planner does not guarantee that generated routes, GTFS feeds, or
            metrics are correct or fit for a specific purpose. Always consult qualified professionals for
            infrastructure decisions.
          </p>
        </div>
      </>
    ),
  },
  {
    number: "5",
    title: "Your Content",
    content: (
      <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>
        You retain ownership of the content you submit (such as custom routes and datasets). By using the service,
        you grant the operator of your deployment a license to host, process, and display your content for the
        purpose of providing the service.
      </p>
    ),
  },
  {
    number: "6",
    title: "Third-Party Services",
    content: (
      <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>
        Transit Planner may integrate third-party services — for example, map tile providers, authentication
        providers, and AI model providers. Your use of those services may be subject to their own terms and policies.
        We encourage you to review those policies before use.
      </p>
    ),
  },
  {
    number: "7",
    title: "Disclaimer of Warranties",
    content: (
      <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>
        To the maximum extent permitted by law, Transit Planner is provided without warranties of any kind,
        whether express or implied, including implied warranties of merchantability, fitness for a particular
        purpose, and non-infringement.
      </p>
    ),
  },
  {
    number: "8",
    title: "Limitation of Liability",
    content: (
      <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>
        To the maximum extent permitted by law, the operator of your deployment will not be liable for indirect,
        incidental, special, consequential, or punitive damages, or any loss of profits, data, or goodwill,
        arising from or related to your use of Transit Planner.
      </p>
    ),
  },
  {
    number: "9",
    title: "Changes",
    content: (
      <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>
        These Terms may be updated from time to time. Continued use of the service after changes become effective
        constitutes acceptance of the updated Terms. We will update the "Last updated" date at the top of this page
        when changes are made.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#ffffff" }}>
      <InfoNav />

      {/* Page header */}
      <div style={{ borderBottom: "1px solid #e7e5e4", backgroundColor: "#fafaf9", padding: "40px 24px 36px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Link href="/docs" style={{ fontSize: 13, color: "#a8a29e", textDecoration: "none" }}>Docs</Link>
            <span style={{ color: "#d6d3d1" }}>/</span>
            <span style={{ fontSize: 13, color: "#57534e", fontWeight: 500 }}>Terms of Use</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 40, height: 40, borderRadius: 10,
                backgroundColor: "#eff6ff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h1
              style={{
                fontFamily: "Google Sans Display",
                fontSize: "clamp(26px, 3.5vw, 36px)",
                fontWeight: 700, color: "#1c1917",
                letterSpacing: "-0.02em",
              }}
            >
              Terms of Use
            </h1>
          </div>
          <p style={{ fontSize: 15, color: "#78716c", maxWidth: 560 }}>
            Please read these Terms carefully before using Transit Planner.
          </p>
          <p style={{ fontSize: 12, color: "#a8a29e", marginTop: 10 }}>Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* TOC */}
        <div
          style={{
            padding: "20px 24px", borderRadius: 12,
            border: "1px solid #e7e5e4", backgroundColor: "#fafaf9",
            marginBottom: 40,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: "#1c1917", marginBottom: 12 }}>Table of Contents</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 0", flexDirection: "column" }}>
            {termsSections.map((s) => (
              <a
                key={s.number}
                href={`#section-${s.number}`}
                style={{
                  fontSize: 13.5, color: "#57534e", textDecoration: "none",
                  padding: "3px 0", display: "flex", gap: 8, alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "#a8a29e", width: 16 }}>{s.number}.</span>
                {s.title}
              </a>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {termsSections.map((section, i) => (
            <div
              key={section.number}
              id={`section-${section.number}`}
              style={{
                paddingTop: i === 0 ? 0 : 36,
                paddingBottom: 36,
                borderBottom: i < termsSections.length - 1 ? "1px solid #f5f5f4" : "none",
                scrollMarginTop: 80,
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 28, height: 28, borderRadius: 7,
                    backgroundColor: "#eff6ff", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#2563eb" }}>{section.number}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <h2
                    style={{
                      fontSize: 18, fontWeight: 700, color: "#1c1917",
                      marginBottom: 12, fontFamily: "Google Sans Display",
                    }}
                  >
                    {section.title}
                  </h2>
                  {section.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div
          style={{
            marginTop: 48, padding: "20px 24px", borderRadius: 12,
            border: "1px solid #e7e5e4", backgroundColor: "#fafaf9",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" stroke="#78716c" strokeWidth="2" />
            <path d="M12 8v4M12 16h.01" stroke="#78716c" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: 13.5, color: "#78716c", lineHeight: 1.65, margin: 0 }}>
            Questions about these terms? Contact the operator of your deployment. If you are running Transit Planner
            locally or in your organization's infrastructure, your organization's legal team should review these terms
            for your specific use case.
          </p>
        </div>
      </div>

      <InfoFooter />
    </div>
  );
}
