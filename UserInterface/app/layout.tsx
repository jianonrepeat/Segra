'use client'
import type {Metadata} from "next";
import {Inter} from "next/font/google";
import "./globals.css";
import {SelectedVideoProvider} from "./Context/SelectedVideoContext";
import {useEffect} from "react";

const inter = Inter({subsets: ["latin"]});



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    // Initialize theme-change
    import("theme-change").then(({themeChange}) => themeChange());

    // Optional: Set default theme from localStorage or other logic
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  return (
    <html lang="en">
      <body className={inter.className}>
        <SelectedVideoProvider>
          {children}
        </SelectedVideoProvider>
      </body>
    </html>
  );
}
