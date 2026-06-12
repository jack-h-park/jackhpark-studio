import { Geist, Geist_Mono } from "next/font/google";

// Shared next/font instances. next/font requires module-scope const
// initialization; importing from here lets multiple shells (admin, chat,
// landing) expose the same --font-geist-* variables without duplicate loads.
export const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
