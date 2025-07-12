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
  redis
} from '@/lib/utils'

const requestSchema = z.object({
  url: z.string().url(),
  consent: z.boolean(),
  timestamp: z.string()
})

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()
  
  // Parse and validate request
  try {
    const body = await req.json()
    const { url, consent, timestamp } = requestSchema.parse(body)
    
    if (!consent) {
      return NextResponse.json({ error: 'Consent required' }, { status: 400 })
    }
    
    if (!validateObsidianUrl(url)) {
      return NextResponse.json({ error: 'Invalid Obsidian Publish URL' }, { status: 400 })
    }
    
    const vaultId = extractVaultId(url)
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
    await logConsent({ ip, url, vaultId, timestamp })
    
    // Check robots.txt
    const robotsAllowed = await checkRobotsTxt(url)
    if (!robotsAllowed) {
      return NextResponse.json({ 
        error: 'This vault disallows crawling via robots.txt' 
      }, { status: 403 })
    }
    
    // Create a readable stream for progress updates
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial progress
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'progress', 
            value: 10 
          }) + '\n'))
          
          // Fetch vault structure
          const vaultData = await fetchVaultData(url, (progress) => {
            controller.enqueue(encoder.encode(JSON.stringify({ 
              type: 'progress', 
              value: Math.min(70, 10 + progress * 0.6) 
            }) + '\n'))
          })
          
          // Update progress
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'progress', 
            value: 80 
          }) + '\n'))
          
          // Create archive
          const downloadId = generateDownloadId()
          const archiveBuffer = await createArchive(vaultData, vaultId)
          
          // Store temporarily (expires in 10 minutes)
          await redis.setex(
            `download:${downloadId}`, 
            600, 
            archiveBuffer.toString('base64')
          )
          
          // Send completion
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'progress', 
            value: 100 
          }) + '\n'))
          
          controller.enqueue(encoder.encode(JSON.stringify({ 
            type: 'complete', 
            downloadId 
          }) + '\n'))
          
        } catch (error: any) {
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
    return NextResponse.json({ 
      error: error.message || 'Invalid request' 
    }, { status: 400 })
  }
}

async function fetchVaultData(url: string, onProgress: (progress: number) => void) {
  const vaultData: Map<string, { content: string; metadata: any }> = new Map()
  const visited = new Set<string>()
  const toVisit = [url]
  
  while (toVisit.length > 0) {
    const currentUrl = toVisit.pop()!
    if (visited.has(currentUrl)) continue
    
    visited.add(currentUrl)
    onProgress((visited.size / (visited.size + toVisit.length)) * 100)
    
    try {
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const response = await fetch(currentUrl)
      if (!response.ok) continue
      
      const html = await response.text()
      const dom = new JSDOM(html)
      const document = dom.window.document
      
      // Extract content
      const content = document.querySelector('.markdown-preview-view')?.textContent || ''
      const title = document.querySelector('title')?.textContent || 'Untitled'
      
      // Store the page
      const path = new URL(currentUrl).pathname.replace('/publish.obsidian.md/', '')
      vaultData.set(path, {
        content,
        metadata: { title, url: currentUrl }
      })
      
      // Find links to other pages
      const links = document.querySelectorAll('a[href^="/"]')
      links.forEach(link => {
        const href = link.getAttribute('href')
        if (href && !visited.has(href)) {
          const fullUrl = new URL(href, url).toString()
          if (fullUrl.includes('publish.obsidian.md')) {
            toVisit.push(fullUrl)
          }
        }
      })
      
    } catch (error) {
      console.error(`Failed to fetch ${currentUrl}:`, error)
    }
  }
  
  return vaultData
}

async function createArchive(
  vaultData: Map<string, { content: string; metadata: any }>, 
  vaultId: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const archive = archiver('zip', { zlib: { level: 9 } })
    
    archive.on('data', (chunk) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    
    // Add metadata
    archive.append(JSON.stringify({
      vault_id: vaultId,
      download_date: new Date().toISOString(),
      total_pages: vaultData.size,
      notice: 'This archive was created for personal/offline use only. Please respect copyright.'
    }), { name: 'metadata.json' })
    
    // Add pages
    vaultData.forEach((data, path) => {
      const filename = path.endsWith('.md') ? path : `${path}.md`
      archive.append(data.content, { name: filename })
    })
    
    archive.finalize()
  })
}