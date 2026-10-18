import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { SiteHeader } from "@/components/chrome/site-header";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hack University - Compiler",
    template: "Hack University - %s",
  },
  description:
    "Write, compile, and run Python, JavaScript, C++, Java, and Go, sandboxed on your own machine.",
};

/**
 * Applies the saved theme and contrast before first paint so there is no
 * light/dark flash. See the "Preventing Flash" guide. Keep the dark list in
 * sync with lib/theme. High contrast follows the OS "increase contrast"
 * setting until the user picks in the theme menu.
 */
const themeBootstrap = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("hu-theme")||"light";d.setAttribute("data-theme",t);if(t==="dark"||t==="dracula"||t==="monokai"||t==="nord"||t==="solarized")d.setAttribute("data-dark","");else d.removeAttribute("data-dark");d.setAttribute("data-code-theme",localStorage.getItem("hu-code-theme")||"midnight");var c=localStorage.getItem("hu-contrast");if(c==="high"||(c===null&&window.matchMedia&&matchMedia("(prefers-contrast: more)").matches))d.setAttribute("data-contrast","high");else d.removeAttribute("data-contrast");window.addEventListener("blur",function(){d.setAttribute("data-window-blurred","")});window.addEventListener("focus",function(){d.removeAttribute("data-window-blurred")})}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-code-theme="midnight"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        <InlineScript html={themeBootstrap} />
      </head>
      <body className="min-h-full">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="flex min-h-[100dvh] flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
