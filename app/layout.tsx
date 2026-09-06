import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { DashboardProvider } from "@/lib/dashboardData";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Budget — Year at a Glance",
  description: "Premium personal finance dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-cream text-primary-text">
        <ThemeProvider>
          <DashboardProvider>{children}</DashboardProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}