import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = {
  title: "Meet — Video Meetings",
  description: "Real-time video meetings powered by LiveKit",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
