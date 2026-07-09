import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Antigravity Consumption Dashboard",
  description: "Track your Antigravity AI usage and costs per user with real token counts.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUser();

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <NavBar user={user} />
        <main style={{ flex: 1, padding: '24px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
