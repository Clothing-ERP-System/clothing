import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = {
  title: "ERPDOST — Garment ERP",
  description: "Garment manufacturing and business operations workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#EEF2FF] text-[#1E293B] antialiased selection:bg-indigo-500 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
