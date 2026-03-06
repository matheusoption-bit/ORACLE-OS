import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ORACLE-OS · Autonomous Agent',
  description: 'Agente autônomo de desenvolvimento: planeja, executa, revisa e aprende.',
  keywords: ['ORACLE-OS', 'AI', 'agente autônomo', 'desenvolvimento', 'LangGraph'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-zinc-100 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
