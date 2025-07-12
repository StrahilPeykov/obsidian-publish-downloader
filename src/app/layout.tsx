import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Obsidian Publish Downloader - Archive Vaults for Offline Access',
  description: 'Download and archive Obsidian Publish vaults for offline access. Privacy-focused, EU-compliant tool for backing up your own content or accessing openly-licensed materials.',
  keywords: ['obsidian', 'publish', 'download', 'archive', 'backup', 'offline', 'vault'],
  authors: [{ name: 'Strahil Peykov', url: 'https://strahil.dev' }],
  creator: 'Strahil Peykov',
  metadataBase: new URL('https://obsidian.strahil.dev'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://obsidian.strahil.dev',
    title: 'Obsidian Publish Downloader',
    description: 'Archive Obsidian Publish vaults for offline access',
    siteName: 'Obsidian Publish Downloader',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Obsidian Publish Downloader',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Obsidian Publish Downloader',
    description: 'Archive Obsidian Publish vaults for offline access',
    creator: '@StrahilGG',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}