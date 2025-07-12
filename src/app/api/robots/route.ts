import { NextResponse } from 'next/server'

export async function GET() {
  const robotsTxt = `# Obsidian Publish Downloader robots.txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /api/download/
Disallow: /_next/

# Sitemap
Sitemap: https://obsidian.strahil.dev/sitemap.xml

# Crawl delay (be respectful)
Crawl-delay: 1
`

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}