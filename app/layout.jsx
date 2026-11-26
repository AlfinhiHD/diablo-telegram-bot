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
  title: "Diablo Finance: Personal Wealth & Expense Intelligence",
  description:
    "AI Financial Butler on Telegram & Web Dashboard powered by Gemini & Firebase Firestore",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("diablo_theme")==="light"?"light":"dark";var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",t==="dark");}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`dark ${jakarta.variable} ${ibmSans.variable} ${ibmMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-[var(--bg-canvas)] text-[var(--color-text)] antialiased selection:bg-[#63A4DE]/30 selection:text-[var(--color-text)] min-h-screen">
        {children}
      </body>
    </html>
  );
}
