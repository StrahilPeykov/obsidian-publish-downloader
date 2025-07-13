import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// Environment variable validation
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.warn('⚠️ Redis environment variables not found. Some features may be disabled.')
}

// Initialize Redis client with fallback
export const redis = UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN 
  ? new Redis({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN,
    })
  : null

// Rate limiter with fallback
export const rateLimiter = redis 
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      analytics: true,
    })
  : {
      // Fallback rate limiter for development
      limit: async () => ({ success: true, limit: 5, remaining: 4, reset: Date.now() + 3600000 })
    }

// Validate Obsidian Publish URL
export function validateObsidianUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'publish.obsidian.md' && parsed.pathname !== '/'
  } catch {
    return false
  }
}

// Extract vault ID from URL
export function extractVaultId(url: string): string {
  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    return pathParts[0] || ''
  } catch {
    return ''
  }
}

// Generate download ID
export function generateDownloadId(): string {
  return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Check if vault is blocked
export async function isVaultBlocked(vaultId: string): Promise<boolean> {
  if (!redis) {
    console.warn('Redis not available, skipping vault block check')
    return false
  }
  
  try {
    const blocked = await redis.sismember('blocked_vaults', vaultId)
    return !!blocked
  } catch (error) {
    console.error('Error checking vault blocked status:', error)
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
  if (!redis) {
    console.warn('Redis not available, consent logging disabled')
    return
  }
  
  try {
    const key = `consent:${data.vaultId}:${Date.now()}`
    await redis.setex(key, 30 * 24 * 60 * 60, JSON.stringify(data)) // Keep for 30 days
    
    // Also log to a general consent list for auditing
    await redis.lpush('consent_log', JSON.stringify({
      ...data,
      loggedAt: new Date().toISOString()
    }))
    
    // Keep only last 10000 consent logs
    await redis.ltrim('consent_log', 0, 9999)
  } catch (error) {
    console.error('Error logging consent:', error)
    // Don't throw - this shouldn't block the download
  }
}

// Enhanced robots.txt checking with proper timeout handling
export async function checkRobotsTxt(baseUrl: string): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl)
    
    // Use AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(robotsUrl.toString(), {
      headers: {
        'User-Agent': 'ObsidianDownloader/1.0 (+https://obsidian.strahil.dev)'
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) return true // If no robots.txt, assume allowed
    
    const text = await response.text()
    const lines = text.split('\n').map(line => line.trim().toLowerCase())
    
    let userAgentMatch = false
    
    for (const line of lines) {
      if (line.startsWith('user-agent:')) {
        const agent = line.split(':')[1]?.trim()
        userAgentMatch = agent === '*' || agent === 'obsidiandownloader'
        continue
      }
      
      if (userAgentMatch && line.startsWith('disallow:')) {
        const path = line.split(':')[1]?.trim()
        if (path === '/' || path === '') {
          return false
        }
      }
    }
    
    return true
  } catch (error) {
    console.error('Error checking robots.txt:', error)
    return true // On error, assume allowed
  }
}

// Sanitize filename for archive
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/\.+/g, '.')
    .substring(0, 200) // Limit length
}

// Block a vault (for takedown requests)
export async function blockVault(vaultId: string, reason?: string): Promise<void> {
  if (!redis) {
    throw new Error('Redis not available')
  }
  
  try {
    await redis.sadd('blocked_vaults', vaultId)
    
    // Log the blocking action
    const blockData = {
      vaultId,
      reason: reason || 'Owner request',
      blockedAt: new Date().toISOString()
    }
    
    await redis.hset(`blocked_vault:${vaultId}`, blockData)
    console.log(`Vault ${vaultId} has been blocked:`, blockData)
  } catch (error) {
    console.error('Error blocking vault:', error)
    throw error
  }
}

// Get blocked vault info
export async function getBlockedVaultInfo(vaultId: string) {
  if (!redis) return null
  
  try {
    return await redis.hgetall(`blocked_vault:${vaultId}`)
  } catch (error) {
    console.error('Error getting blocked vault info:', error)
    return null
  }
}

// Unblock a vault (for resolved disputes)
export async function unblockVault(vaultId: string): Promise<void> {
  if (!redis) {
    throw new Error('Redis not available')
  }
  
  try {
    await redis.srem('blocked_vaults', vaultId)
    await redis.del(`blocked_vault:${vaultId}`)
    console.log(`Vault ${vaultId} has been unblocked`)
  } catch (error) {
    console.error('Error unblocking vault:', error)
    throw error
  }
}

// Get download statistics with proper typing
export async function getDownloadStats() {
  if (!redis) {
    return { total: 0, today: 0 }
  }
  
  try {
    const totalDownloadsRaw = await redis.get('total_downloads')
    const dailyDownloadsRaw = await redis.get(`daily_downloads:${new Date().toISOString().split('T')[0]}`)
    
    // Handle Redis returning null/undefined by providing defaults
    const totalDownloads = typeof totalDownloadsRaw === 'string' ? totalDownloadsRaw : '0'
    const dailyDownloads = typeof dailyDownloadsRaw === 'string' ? dailyDownloadsRaw : '0'
    
    return {
      total: parseInt(totalDownloads, 10) || 0,
      today: parseInt(dailyDownloads, 10) || 0
    }
  } catch (error) {
    console.error('Error getting download stats:', error)
    return { total: 0, today: 0 }
  }
}

// Increment download counter
export async function incrementDownloadCount(vaultId: string): Promise<void> {
  if (!redis) {
    console.warn('Redis not available, download count not tracked')
    return
  }
  
  try {
    const today = new Date().toISOString().split('T')[0]
    
    // Increment total downloads
    await redis.incr('total_downloads')
    
    // Increment daily downloads
    await redis.incr(`daily_downloads:${today}`)
    await redis.expire(`daily_downloads:${today}`, 24 * 60 * 60) // Expire after 24 hours
    
    // Track vault-specific downloads
    await redis.incr(`vault_downloads:${vaultId}`)
  } catch (error) {
    console.error('Error incrementing download count:', error)
    // Don't throw - this shouldn't block the download
  }
}