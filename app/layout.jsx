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
      <body className="bg-[#19242F] text-[#F8F8F2] antialiased selection:bg-[#5C98CD]/35 selection:text-[#F8F8F2] min-h-screen">
        {children}
      </body>
    </html>
  );
}
