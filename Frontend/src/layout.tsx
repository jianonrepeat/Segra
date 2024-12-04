import "./globals.css";
import {SelectedVideoProvider} from "./Context/SelectedVideoContext";
import {useEffect} from "react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    import("theme-change").then(({themeChange}) => themeChange());

    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  return (
    <html lang="en">
      <body>
        <SelectedVideoProvider>
          {children}
        </SelectedVideoProvider>
      </body>
    </html>
  );
}
