import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { HoverPrefetch } from "@/components/chrome/hover-prefetch";
import { SiteHeader } from "@/components/chrome/site-header";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hack University - Compiler",
    template: "Hack University - %s",
  },
  description:
    "Write, compile, and run Python, JavaScript, TypeScript, C++, Java, Go, and Bash, sandboxed on your own machine.",
};

/**
 * Applies the saved theme, contrast, and editor zoom before first paint so
 * nothing flashes or shifts on load. See the "Preventing Flash" guide. Keep
 * the dark list in sync with lib/theme and the zoom key/range in sync with
 * components/code/editor-settings. Contrast follows the OS "increase contrast"
 * setting (as High) until the user picks a level. The zoom comes last: a
 * malformed saved value can only skip itself.
 */
const themeBootstrap = `(function(){try{var d=document.documentElement;var n=window.navigation;if(!n||n.canGoBack)d.setAttribute("data-hist-back","");if(!n||n.canGoForward)d.setAttribute("data-hist-fwd","");var t=localStorage.getItem("hu-theme")||"light";d.setAttribute("data-theme",t);if(t==="dark"||t==="dracula"||t==="monokai"||t==="nord"||t==="solarized")d.setAttribute("data-dark","");else d.removeAttribute("data-dark");d.setAttribute("data-code-theme",localStorage.getItem("hu-code-theme")||"midnight");var c=localStorage.getItem("hu-contrast");if(c===null&&window.matchMedia&&matchMedia("(prefers-contrast: more)").matches)c="high";if(c==="high"||c==="super")d.setAttribute("data-contrast",c);else d.removeAttribute("data-contrast");var b=localStorage.getItem("hu-code-bg");if(b&&/^#[0-9a-fA-F]{6}$/.test(b)){d.setAttribute("data-code-bg","");d.style.setProperty("--code-bg-override",b)}var sl=localStorage.getItem("hu-code-sel");if(sl!=="theme"){if(!(sl&&/^#[0-9a-fA-F]{6}$/.test(sl)))sl="#388bfd";d.setAttribute("data-code-sel","");d.style.setProperty("--code-sel-override",sl)}var l=localStorage.getItem("hu-layout-lines");if(l!==null&&/^\\d{1,3}$/.test(l)&&+l<=100)d.style.setProperty("--layout-lines",l+"%");var cl=localStorage.getItem("hu-content-lines");if(cl!==null&&/^\\d{1,3}$/.test(cl)&&+cl<=100)d.style.setProperty("--content-lines",cl+"%");if(localStorage.getItem("hu-code-comments")==="hidden")d.setAttribute("data-code-comments","hidden");if(/[?&]full=1(&|$)/.test(location.search))d.setAttribute("data-full","");if(/[?&](panel=(cheatsheet|challenges)|view=database|hints=\\d+|file=[^&]+|dock=[a-z]+|preview=[^&]*)(&|$)/.test(location.search)||/^#(example(-[23])?|practice|recap)$/.test(location.hash)){d.setAttribute("data-restore","");setTimeout(function(){d.removeAttribute("data-restore")},3000)}else if(/[?&]tab=(code|ex[23])(&|$)/.test(location.search)){d.setAttribute("data-restore-editor","");setTimeout(function(){d.removeAttribute("data-restore-editor")},3000)}window.addEventListener("blur",function(){d.setAttribute("data-window-blurred","")});window.addEventListener("focus",function(){d.removeAttribute("data-window-blurred")});var s=JSON.parse(localStorage.getItem("hu-code-editor-settings-v1")||"null");if(s&&s.fontSize)d.style.setProperty("--code-user-fs",Math.min(22,Math.max(11,Number(s.fontSize)||13))+"px")}catch(e){}})()`;

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
        <HoverPrefetch />
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
