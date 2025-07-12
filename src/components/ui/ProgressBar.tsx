'use client'

import { motion } from 'framer-motion'

interface ProgressBarProps {
  progress: number
}

export function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="w-full">
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{progress}%</span>
        <span>{progress === 100 ? 'Complete' : 'Processing...'}</span>
      </div>
    </div>
  )
}