import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { redis, extractVaultId } from '@/lib/utils'

const reportSchema = z.object({
  vaultUrl: z.string().url(),
  email: z.string().email(),
  reason: z.enum(['owner', 'copyright', 'privacy', 'other']),
  details: z.string().min(10).max(1000),
  verificationUrl: z.string().url().optional(),
})

export async function GET() {
  // Return a simple form for takedown requests
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Report Content - Obsidian Publish Downloader</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white min-h-screen">
      <div class="container mx-auto px-4 py-16 max-w-2xl">
        <h1 class="text-3xl font-bold mb-8">Report Content / Request Takedown</h1>
        
        <form id="reportForm" class="space-y-6">
          <div>
            <label class="block text-sm font-medium mb-2">Vault URL</label>
            <input 
              type="url" 
              name="vaultUrl" 
              required 
              placeholder="https://publish.obsidian.md/example"
              class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Your Email</label>
            <input 
              type="email" 
              name="email" 
              required 
              placeholder="your@email.com"
              class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Reason</label>
            <select 
              name="reason" 
              required
              class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
            >
              <option value="">Select a reason</option>
              <option value="owner">I am the vault owner</option>
              <option value="copyright">Copyright infringement</option>
              <option value="privacy">Privacy concern</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Details</label>
            <textarea 
              name="details" 
              required 
              rows="4"
              placeholder="Please provide details about your request..."
              class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
            ></textarea>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">
              Verification URL (optional)
              <span class="text-xs text-gray-400 block">
                Link to a page that verifies your ownership
              </span>
            </label>
            <input 
              type="url" 
              name="verificationUrl"
              placeholder="https://example.com/about"
              class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
            />
          </div>
          
          <button 
            type="submit"
            class="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all"
          >
            Submit Report
          </button>
        </form>
        
        <div id="message" class="mt-6 hidden"></div>
        
        <div class="mt-12 text-sm text-gray-400">
          <p class="mb-2">We take content ownership seriously and will respond within 48 hours.</p>
          <p>For urgent matters, please email: takedown@obsidian.strahil.dev</p>
        </div>
      </div>
      
      <script>
        document.getElementById('reportForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const formData = new FormData(e.target);
          const data = Object.fromEntries(formData);
          
          try {
            const response = await fetch('/api/report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            
            const result = await response.json();
            const messageEl = document.getElementById('message');
            
            if (response.ok) {
              messageEl.className = 'p-4 bg-green-900 border border-green-700 rounded-lg';
              messageEl.textContent = result.message;
              e.target.reset();
            } else {
              messageEl.className = 'p-4 bg-red-900 border border-red-700 rounded-lg';
              messageEl.textContent = result.error || 'Failed to submit report';
            }
            
            messageEl.classList.remove('hidden');
          } catch (error) {
            const messageEl = document.getElementById('message');
            messageEl.className = 'p-4 bg-red-900 border border-red-700 rounded-lg';
            messageEl.textContent = 'Network error. Please try again.';
            messageEl.classList.remove('hidden');
          }
        });
      </script>
    </body>
    </html>
  `
  
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = reportSchema.parse(body)
    
    const vaultId = extractVaultId(data.vaultUrl)
    if (!vaultId) {
      return NextResponse.json({ 
        error: 'Invalid vault URL' 
      }, { status: 400 })
    }
    
    // If owner request, immediately block the vault
    if (data.reason === 'owner') {
      await redis.sadd('blocked_vaults', vaultId)
    }
    
    // Store the report
    const reportId = `report:${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    await redis.hset(reportId, {
      ...data,
      vaultId,
      timestamp: new Date().toISOString(),
      status: 'pending',
      ip: req.headers.get('x-forwarded-for') || 'unknown'
    })
    
    // Add to reports list
    await redis.sadd('pending_reports', reportId)
    
    // Send notification (implement your preferred notification method)
    // await sendEmail('takedown@obsidian.strahil.dev', 'New Takedown Request', ...)
    
    return NextResponse.json({
      message: 'Report submitted successfully. We will review and respond within 48 hours.',
      reportId: reportId.split(':')[1]
    })
    
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'Invalid input', 
        details: error.errors 
      }, { status: 400 })
    }
    
    return NextResponse.json({ 
      error: 'Failed to submit report' 
    }, { status: 500 })
  }
}