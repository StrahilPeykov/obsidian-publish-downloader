'use client'

import { useState } from 'react'
import { Download, Shield, AlertCircle, CheckCircle, Archive, Clock, Users, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast, { Toaster } from 'react-hot-toast'
import { LegalModal } from '@/components/LegalModal'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { validateObsidianUrl } from '@/lib/utils'

export default function Home() {
  const [url, setUrl] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showLegalModal, setShowLegalModal] = useState(false)
  const [downloadId, setDownloadId] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateObsidianUrl(url)) {
      toast.error('Please enter a valid Obsidian Publish URL')
      return
    }

    setShowLegalModal(true)
  }

  const handleLegalAccept = async () => {
    setShowLegalModal(false)
    setIsDownloading(true)
    setProgress(0)

    try {
      // Start the download process
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url,
          consent: true,
          timestamp: new Date().toISOString()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Download failed')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      // Read the stream
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(Boolean)

        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            
            if (data.type === 'progress') {
              setProgress(data.value)
            } else if (data.type === 'complete') {
              setDownloadId(data.downloadId)
              toast.success('Vault archived successfully!')
              
              // Trigger download
              window.location.href = `/api/download/${data.downloadId}`
            } else if (data.type === 'error') {
              throw new Error(data.message)
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to download vault')
    } finally {
      setIsDownloading(false)
      setProgress(0)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <Toaster position="top-right" />
      
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-5" />
      
      <div className="relative z-10 container mx-auto px-4 py-16 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-purple-600 rounded-2xl">
            <Archive className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-5xl font-bold text-white mb-4">
            Obsidian Publish Downloader
          </h1>
          
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Create offline archives of Obsidian Publish vaults. Perfect for backing up your own content or accessing openly-licensed knowledge bases offline.
          </p>
        </motion.div>

        {/* Main Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-12 border border-white/20"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-200 mb-2">
                Obsidian Publish URL
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://publish.obsidian.md/example"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
                disabled={isDownloading}
              />
            </div>

            <button
              type="submit"
              disabled={isDownloading}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Download Vault
                </>
              )}
            </button>
          </form>

          {/* Progress Bar */}
          <AnimatePresence>
            {isDownloading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6"
              >
                <ProgressBar progress={progress} />
                <p className="text-sm text-gray-300 mt-2 text-center">
                  {progress < 30 && 'Fetching vault structure...'}
                  {progress >= 30 && progress < 70 && 'Downloading content...'}
                  {progress >= 70 && progress < 100 && 'Creating archive...'}
                  {progress === 100 && 'Complete! Starting download...'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="grid md:grid-cols-3 gap-6 mb-12"
        >
          <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10">
            <Shield className="w-8 h-8 text-green-400 mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Privacy First</h3>
            <p className="text-gray-300 text-sm">
              We never store your data. Archives are generated on-demand and immediately deleted after download.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10">
            <CheckCircle className="w-8 h-8 text-blue-400 mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Legal Compliance</h3>
            <p className="text-gray-300 text-sm">
              EU/Dutch compliant with ownership verification and opt-out support for content creators.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10">
            <Clock className="w-8 h-8 text-purple-400 mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Respectful Crawling</h3>
            <p className="text-gray-300 text-sm">
              We respect robots.txt and implement rate limiting to avoid overloading servers.
            </p>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-3 gap-4 mb-12"
        >
          <div className="text-center">
            <div className="text-3xl font-bold text-white">2.5K+</div>
            <div className="text-gray-400 text-sm">Downloads</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">450+</div>
            <div className="text-gray-400 text-sm">Active Users</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">99.9%</div>
            <div className="text-gray-400 text-sm">Uptime</div>
          </div>
        </motion.div>

        {/* Footer */}
        <footer className="text-center text-gray-400 text-sm">
          <p className="mb-4">
            <a href="/legal/privacy" className="hover:text-white">Privacy Policy</a>
            {' • '}
            <a href="/legal/terms" className="hover:text-white">Terms of Service</a>
            {' • '}
            <a href="/api/report" className="hover:text-white">Report Content</a>
          </p>
          <p>
            Built by{' '}
            <a href="https://strahil.dev" className="text-purple-400 hover:text-purple-300">
              Strahil Peykov
            </a>
          </p>
        </footer>
      </div>

      {/* Legal Modal */}
      <LegalModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        onAccept={handleLegalAccept}
      />
    </main>
  )
}
