import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Operatr — Private Agentic Operating System",
  description:
    "A private, adaptive AI agent operating system designed for personalized business intelligence tasking, growth, efficiency, and auditable capital return.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
