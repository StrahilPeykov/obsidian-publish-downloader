import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// Initialize Redis client
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Rate limiter: 5 downloads per hour per IP
export const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
})

// Validate Obsidian Publish URL
export function validateObsidianUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'publish.obsidian.md'
  } catch {
    return false
  }
}

// Extract vault ID from URL
export function extractVaultId(url: string): string {
  const parsed = new URL(url)
  return parsed.pathname.split('/')[1] || ''
}

// Generate download ID
export function generateDownloadId(): string {
  return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Check if vault is blocked
export async function isVaultBlocked(vaultId: string): Promise<boolean> {
  try {
    const blocked = await redis.sismember('blocked_vaults', vaultId)
    return !!blocked
  } catch {
    return false
  }
}

// Log consent for legal compliance
export async function logConsent(data: {
  ip: string
  url: string
  vaultId: string
  timestamp: string
}) {
  const key = `consent:${data.vaultId}:${Date.now()}`
  await redis.setex(key, 30 * 24 * 60 * 60, JSON.stringify(data)) // Keep for 30 days
}

// Check robots.txt
export async function checkRobotsTxt(baseUrl: string): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl)
    const response = await fetch(robotsUrl.toString())
    
    if (!response.ok) return true // If no robots.txt, assume allowed
    
    const text = await response.text()
    const lines = text.split('\n')
    
    for (const line of lines) {
      if (line.toLowerCase().includes('user-agent: *')) {
        const nextLine = lines[lines.indexOf(line) + 1]
        if (nextLine?.toLowerCase().includes('disallow: /')) {
          return false
        }
      }
    }
    
    return true
  } catch {
    return true // On error, assume allowed
  }
}

// Sanitize filename for archive
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200) // Limit length
}