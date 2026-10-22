import { Plus_Jakarta_Sans, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-heading",
});

const ibmSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Diablo Finance — Personal Wealth & Expense Intelligence",
  description:
    "AI Financial Butler on Telegram & Web Dashboard powered by Gemini & Firebase Firestore",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="id"
      className={`dark ${jakarta.variable} ${ibmSans.variable} ${ibmMono.variable}`}
    >
      <body className="bg-[#020617] text-[#F8FAFC] antialiased selection:bg-[#22C55E]/25 selection:text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
