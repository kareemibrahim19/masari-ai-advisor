import type { Metadata, Viewport } from "next"
import { JetBrains_Mono, Readex_Pro, Sora } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/components/masari/app-shell"
import { I18nProvider } from "@/lib/i18n"
import { StudentProvider } from "@/lib/student-context"
import "./globals.css"

// Runs while the HTML is parsed, before the first paint, so the saved theme never flashes.
// The page is prerendered in Arabic; for English it is hidden until React swaps the text (max 1.5 s).
// Same keys as app-shell.tsx (masari.theme) and i18n.tsx (masari.lang).
const prePaintScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("masari.theme")||"light";if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark");if(localStorage.getItem("masari.lang")==="en"){d.lang="en";d.dir="ltr";d.setAttribute("data-lang-pending","");setTimeout(function(){d.removeAttribute("data-lang-pending")},1500)}}catch(e){}})()`

// Brand type (masari-colors.json): Sora for Latin, Readex Pro for Arabic, JetBrains Mono for codes.
// Sora has no Arabic glyphs, so Arabic text falls through to Readex Pro character by character.
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" })
const readex = Readex_Pro({ variable: "--font-readex", subsets: ["arabic", "latin"], display: "swap" })
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"], display: "swap" })

export const metadata: Metadata = {
  title: "Masari · مساري",
  description: "AI academic advisor for the AI Engineering program. UI prototype with simulated students.",
  openGraph: { images: ["/brand/masari-lockup-light.png"] },
}

export const viewport: Viewport = {
  // The site opens in light mode whatever the device's setting, so the browser bar matches it.
  themeColor: "#f8f8f7",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${sora.variable} ${readex.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaintScript }} />
      </head>
      <body className="min-h-full">
        <I18nProvider>
          <TooltipProvider delay={300}>
            <StudentProvider>
              <AppShell>{children}</AppShell>
            </StudentProvider>
          </TooltipProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
