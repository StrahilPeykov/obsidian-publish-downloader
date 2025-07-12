import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/utils'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const downloadId = params.id
    
    // Retrieve archive from Redis
    const base64Data = await redis.get(`download:${downloadId}`)
    
    if (!base64Data) {
      return NextResponse.json({ 
        error: 'Download not found or expired' 
      }, { status: 404 })
    }
    
    // Convert base64 back to buffer
    const buffer = Buffer.from(base64Data as string, 'base64')
    
    // Delete after serving (one-time download)
    await redis.del(`download:${downloadId}`)
    
    // Return the file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="obsidian-vault-${Date.now()}.zip"`,
        'Content-Length': buffer.length.toString(),
      },
    })
    
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ 
      error: 'Failed to retrieve download' 
    }, { status: 500 })
  }
}