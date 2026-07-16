import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ObraHub — IA para Ingeniería y Construcción en Colombia",
  description:
    "El asistente técnico para profesionales de la construcción en Colombia. Consulta la NSR-10 con referencias por página.",

  manifest: "/manifest.json",

  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

// viewport-fit: cover enables env(safe-area-inset-*) for notch/home-indicator handling.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
<html
  lang="es"
  className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
>
  <head>
    <meta name="theme-color" content="#0B1220" />
  </head>

  <body className="min-h-full flex flex-col">
    {children}
  </body>
</html>
  );
}
