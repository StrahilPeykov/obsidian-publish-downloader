'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Checkbox from '@radix-ui/react-checkbox'
import { X, Shield, AlertTriangle, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface LegalModalProps {
  isOpen: boolean
  onClose: () => void
  onAccept: () => void
}

export function LegalModal({ isOpen, onClose, onAccept }: LegalModalProps) {
  const [isOwner, setIsOwner] = useState(false)
  const [hasRights, setHasRights] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)

  const canProceed = (isOwner || hasRights) && acceptTerms

  const handleAccept = () => {
    if (canProceed) {
      onAccept()
      // Reset state
      setIsOwner(false)
      setHasRights(false)
      setAcceptTerms(false)
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              />
            </Dialog.Overlay>
            
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg"
              >
                <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 p-6">
                  <Dialog.Title className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                    <Shield className="w-8 h-8 text-purple-500" />
                    Legal Compliance Check
                  </Dialog.Title>
                  
                  <Dialog.Close asChild>
                    <button
                      className="absolute top-4 right-4 text-gray-400 hover:text-white"
                      aria-label="Close"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </Dialog.Close>

                  <div className="space-y-6">
                    {/* Warning */}
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-yellow-200">
                        <p className="font-semibold mb-1">Important Notice</p>
                        <p>
                          This tool is intended for downloading your own content or 
                          openly-licensed materials only. Unauthorized downloading of 
                          copyrighted content is prohibited.
                        </p>
                      </div>
                    </div>

                    {/* Ownership confirmation */}
                    <div className="space-y-3">
                      <p className="text-white font-medium">
                        Please confirm your relationship to this content:
                      </p>
                      
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <Checkbox.Root
                          checked={isOwner}
                          onCheckedChange={(checked) => {
                            setIsOwner(checked as boolean)
                            if (checked) setHasRights(false)
                          }}
                          className="w-5 h-5 rounded border-2 border-gray-600 bg-gray-800 group-hover:border-purple-500 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600 mt-0.5"
                        >
                          <Checkbox.Indicator className="flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </Checkbox.Indicator>
                        </Checkbox.Root>
                        <span className="text-gray-300 text-sm">
                          I am the owner/author of this Obsidian Publish vault
                        </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group">
                        <Checkbox.Root
                          checked={hasRights}
                          onCheckedChange={(checked) => {
                            setHasRights(checked as boolean)
                            if (checked) setIsOwner(false)
                          }}
                          className="w-5 h-5 rounded border-2 border-gray-600 bg-gray-800 group-hover:border-purple-500 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600 mt-0.5"
                        >
                          <Checkbox.Indicator className="flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </Checkbox.Indicator>
                        </Checkbox.Root>
                        <span className="text-gray-300 text-sm">
                          This vault is published under an open license (CC-BY, CC-BY-SA, CC0, etc.) 
                          that permits downloading and redistribution
                        </span>
                      </label>
                    </div>

                    {/* Terms acceptance */}
                    <div className="border-t border-gray-800 pt-4">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <Checkbox.Root
                            checked={acceptTerms}
                            onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                            className="w-5 h-5 rounded border-2 border-gray-600 bg-gray-800 group-hover:border-purple-500 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600 mt-0.5"
                            >
                          <Checkbox.Indicator className="flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </Checkbox.Indicator>
                        </Checkbox.Root>
                        <span className="text-gray-300 text-sm">
                          I accept the{' '}
                          <a href="/legal/terms" className="text-purple-400 hover:text-purple-300 underline">
                            Terms of Service
                          </a>
                          {' '}and understand that false claims may result in legal action
                        </span>
                      </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={onClose}
                        className="flex-1 py-3 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAccept}
                        disabled={!canProceed}
                        className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        I Confirm & Proceed
                      </button>
                    </div>

                    {/* Additional info */}
                    <p className="text-xs text-gray-500 text-center">
                      Your consent and IP address will be logged for legal compliance. 
                      Content owners can request removal via our{' '}
                      <a href="/api/report" className="text-purple-400 hover:text-purple-300">
                        takedown form
                      </a>.
                    </p>
                  </div>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}