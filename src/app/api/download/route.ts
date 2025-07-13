import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import archiver from 'archiver'
import { JSDOM } from 'jsdom'
import { 
  validateObsidianUrl, 
  extractVaultId, 
  isVaultBlocked,
  rateLimiter,
  logConsent,
  checkRobotsTxt,
  generateDownloadId,
  redis,
  incrementDownloadCount
} from '../../../lib/utils'

const requestSchema = z.object({
  url: z.string().url(),
  consent: z.boolean(),
  timestamp: z.string()
})

// Enhanced content type detection
const SUPPORTED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/plain'
]

// Enhanced URL validation for Obsidian Publish
function validateAndCleanUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    
    // Must be Obsidian Publish domain
    if (parsed.hostname !== 'publish.obsidian.md') {
      return null
    }
    
    // Clean the URL - remove fragments, normalize path
    parsed.hash = ''
    parsed.search = ''
    
    // Ensure it's not just the root domain
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return null
    }
    
    return parsed.toString()
  } catch {
    return null
  }
}

// Enhanced robots.txt checking with more robust parsing and proper timeout
async function checkRobotsAdvanced(baseUrl: string): Promise<{ allowed: boolean; crawlDelay: number }> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl)
    
    // Use AbortController for timeout instead of timeout property
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(robotsUrl.toString(), {
      headers: {
        'User-Agent': 'ObsidianDownloader/1.0 (+https://obsidian.strahil.dev)'
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      return { allowed: true, crawlDelay: 1000 } // Default if no robots.txt
    }
    
    const text = await response.text()
    const lines = text.split('\n').map(line => line.trim())
    
    let userAgentMatch = false
    let allowed = true
    let crawlDelay = 1000 // Default 1 second
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      
      // Check for user-agent directive
      if (line.startsWith('user-agent:')) {
        const agent = line.split(':')[1]?.trim()
        userAgentMatch = agent === '*' || agent === 'obsidiandownloader'
        continue
      }
      
      if (userAgentMatch) {
        if (line.startsWith('disallow:')) {
          const path = line.split(':')[1]?.trim()
          if (path === '/' || path === '') {
            allowed = false
          }
        }
        
        if (line.startsWith('crawl-delay:')) {
          const delay = parseInt(line.split(':')[1]?.trim() || '1')
          if (!isNaN(delay)) {
            crawlDelay = Math.max(delay * 1000, 500) // Min 500ms, max from robots.txt
          }
        }
      }
    }
    
    return { allowed, crawlDelay }
  } catch {
    return { allowed: true, crawlDelay: 1000 }
  }
}

// Enhanced content fetching with better error handling and proper timeout
async function fetchPageContent(url: string, timeout = 10000): Promise<{ content: string; title: string } | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ObsidianDownloader/1.0 (+https://obsidian.strahil.dev)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
      return null
    }
    
    const contentType = response.headers.get('content-type') || ''
    if (!SUPPORTED_CONTENT_TYPES.some(type => contentType.includes(type))) {
      console.warn(`Unsupported content type for ${url}: ${contentType}`)
      return null
    }
    
    const html = await response.text()
    
    // Parse with JSDOM
    const dom = new JSDOM(html)
    const document = dom.window.document
    
    // Extract content more robustly
    const contentElement = document.querySelector('.markdown-preview-view') || 
                          document.querySelector('.mod-cm6') ||
                          document.querySelector('main') ||
                          document.querySelector('article') ||
                          document.querySelector('.content')
    
    const content = contentElement?.textContent || document.body?.textContent || ''
    const title = document.querySelector('title')?.textContent || 
                 document.querySelector('h1')?.textContent || 
                 'Untitled'
    
    return { content: content.trim(), title: title.trim() }
    
  } catch (error) {
    console.error(`Error fetching ${url}:`, error)
    return null
  }
}

// Enhanced link extraction with proper iteration
function extractLinks(document: Document, baseUrl: string): string[] {
  const links: string[] = []
  const linkElements = document.querySelectorAll('a[href]')
  
  linkElements.forEach(link => {
    const href = link.getAttribute('href')
    if (!href) return
    
    try {
      let fullUrl: string
      
      if (href.startsWith('/')) {
        // Relative to domain
        fullUrl = new URL(href, baseUrl).toString()
      } else if (href.startsWith('http')) {
        // Absolute URL
        fullUrl = href
      } else {
        // Relative to current page
        fullUrl = new URL(href, baseUrl).toString()
      }
      
      // Only include Obsidian Publish URLs
      const parsedUrl = new URL(fullUrl)
      if (parsedUrl.hostname === 'publish.obsidian.md') {
        links.push(fullUrl)
      }
    } catch {
      // Skip invalid URLs
    }
  })
  
  // Use Array.from to handle Set properly for TypeScript
  return Array.from(new Set(links)) // Remove duplicates
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()
  
  try {
    const body = await req.json()
    const { url, consent, timestamp } = requestSchema.parse(body)
    
    if (!consent) {
      return NextResponse.json({ error: 'Consent required' }, { status: 400 })
    }
    
    const cleanUrl = validateAndCleanUrl(url)
    if (!cleanUrl) {
      return NextResponse.json({ error: 'Invalid Obsidian Publish URL' }, { status: 400 })
    }
    
    const vaultId = extractVaultId(cleanUrl)
    if (!vaultId) {
      return NextResponse.json({ error: 'Could not extract vault ID' }, { status: 400 })
    }
    
    // Check if vault is blocked
    if (await isVaultBlocked(vaultId)) {
      return NextResponse.json({ 
        error: 'This vault has been blocked by the owner' 
      }, { status: 403 })
    }
    
    // Rate limiting
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const { success } = await rateLimiter.limit(ip)
    
    if (!success) {
      return NextResponse.json({ 
        error: 'Rate limit exceeded. Please try again later.' 
      }, { status: 429 })
    }
    
    // Log consent for legal compliance
    await logConsent({ ip, url: cleanUrl, vaultId, timestamp })
    
    // Enhanced robots.txt check
    const { allowed: robotsAllowed, crawlDelay } = await checkRobotsAdvanced(cleanUrl)
    if (!robotsAllowed) {
      return NextResponse.json({ 
        error: 'This vault disallows crawling via robots.txt' 
      }, { status: 403 })
    }
    
    // Create response stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'progress', 
            value: 5,
            message: 'Starting vault discovery...'
          }) + '\n'))
          
          // Fetch vault data with enhanced crawling
          const vaultData = await fetchVaultData(cleanUrl, crawlDelay, (progress, message) => {
            controller.enqueue(encoder.encode(JSON.stringify({ 
              type: 'progress', 
              value: 5 + Math.floor(progress * 0.7), // 5-75%
              message
            }) + '\n'))
          })
          
          if (vaultData.size === 0) {
            throw new Error('No content found in vault')
          }
          
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'progress', 
            value: 80,
            message: 'Creating archive...'
          }) + '\n'))
          
          // Create archive
          const downloadId = generateDownloadId()
          const archiveBuffer = await createArchive(vaultData, vaultId)
          
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'progress', 
            value: 95,
            message: 'Preparing download...'
          }) + '\n'))
          
          // Store temporarily (expires in 10 minutes)
          await redis.setex(
            `download:${downloadId}`, 
            600, 
            archiveBuffer.toString('base64')
          )
          
          // Increment download statistics
          await incrementDownloadCount(vaultId)
          
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'progress', 
            value: 100,
            message: 'Complete!'
          }) + '\n'))
          
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'complete', 
            downloadId,
            stats: {
              totalPages: vaultData.size,
              archiveSize: Math.round(archiveBuffer.length / 1024) + ' KB'
            }
          }) + '\n'))
          
        } catch (error: any) {
          console.error('Download error:', error)
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'error', 
            message: error.message || 'Failed to download vault' 
          }) + '\n'))
        } finally {
          controller.close()
        }
      }
    })
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
    
  } catch (error: any) {
    console.error('Request error:', error)
    return NextResponse.json({ 
      error: error.message || 'Invalid request' 
    }, { status: 400 })
  }
}

async function fetchVaultData(
  startUrl: string, 
  crawlDelay: number,
  onProgress: (progress: number, message: string) => void
): Promise<Map<string, { content: string; metadata: any }>> {
  const vaultData = new Map<string, { content: string; metadata: any }>()
  const visited = new Set<string>()
  const toVisit = [startUrl]
  const maxPages = 500 // Safety limit
  let pageCount = 0
  
  onProgress(0, 'Discovering pages...')
  
  while (toVisit.length > 0 && pageCount < maxPages) {
    const currentUrl = toVisit.pop()!
    if (visited.has(currentUrl)) continue
    
    visited.add(currentUrl)
    pageCount++
    
    const progress = (pageCount / Math.max(pageCount + toVisit.length, 1)) * 100
    onProgress(progress, `Processing page ${pageCount}...`)
    
    // Respect crawl delay
    if (pageCount > 1) {
      await new Promise(resolve => setTimeout(resolve, crawlDelay))
    }
    
    const pageData = await fetchPageContent(currentUrl)
    if (!pageData) continue
    
    // Generate a clean file path
    const urlPath = new URL(currentUrl).pathname
    const cleanPath = urlPath.replace(/^\//, '').replace(/\/$/, '') || 'index'
    const fileName = cleanPath.endsWith('.md') ? cleanPath : `${cleanPath}.md`
    
    // Store the page
    vaultData.set(fileName, {
      content: pageData.content,
      metadata: { 
        title: pageData.title, 
        url: currentUrl,
        crawledAt: new Date().toISOString()
      }
    })
    
    // Find additional links (only if we haven't hit our limit)
    if (pageCount < maxPages) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)
        
        const response = await fetch(currentUrl, {
          headers: { 'User-Agent': 'ObsidianDownloader/1.0' },
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const html = await response.text()
          const dom = new JSDOM(html)
          const links = extractLinks(dom.window.document, currentUrl)
          
          for (const link of links) {
            if (!visited.has(link) && !toVisit.includes(link)) {
              toVisit.push(link)
            }
          }
        }
      } catch (error) {
        console.error(`Failed to extract links from ${currentUrl}:`, error)
      }
    }
  }
  
  onProgress(100, `Discovered ${vaultData.size} pages`)
  return vaultData
}

async function createArchive(
  vaultData: Map<string, { content: string; metadata: any }>, 
  vaultId: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const archive = archiver('zip', { 
      zlib: { level: 9 },
      comment: `Obsidian Vault Archive - Downloaded from https://publish.obsidian.md/${vaultId}`
    })
    
    archive.on('data', (chunk) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    
    // Add metadata file
    const metadata = {
      vault_id: vaultId,
      download_date: new Date().toISOString(),
      total_pages: vaultData.size,
      downloader: 'ObsidianDownloader/1.0',
      source: 'https://obsidian.strahil.dev',
      notice: 'This archive was created for personal/offline use only. Please respect copyright and licensing.',
      pages: Array.from(vaultData.entries()).map(([path, data]) => ({
        path,
        title: data.metadata.title,
        url: data.metadata.url,
        crawled_at: data.metadata.crawledAt
      }))
    }
    
    archive.append(JSON.stringify(metadata, null, 2), { name: 'vault-metadata.json' })
    
    // Add README
    const readme = `# Obsidian Vault Archive

This archive contains a backup of an Obsidian Publish vault.

## Contents
- ${vaultData.size} pages in Markdown format
- vault-metadata.json: Archive information and page index

## Usage
Extract this archive and open the folder in Obsidian as a vault.

## Legal Notice
This archive was created in compliance with applicable laws and website terms of service.
If you are the original content owner and wish to request removal, please contact:
https://obsidian.strahil.dev/api/report

Generated on: ${new Date().toISOString()}
Source: https://obsidian.strahil.dev
`
    
    archive.append(readme, { name: 'README.md' })
    
    // Add all pages using Array.from for proper iteration
    const entries = Array.from(vaultData.entries())
    for (const [path, data] of entries) {
      let content = data.content
      
      // Add frontmatter with metadata
      const frontmatter = `---
title: "${data.metadata.title.replace(/"/g, '\\"')}"
source_url: "${data.metadata.url}"
archived_at: "${data.metadata.crawledAt}"
---

`
      content = frontmatter + content
      
      archive.append(content, { name: path })
    }
    
    archive.finalize()
  })
}