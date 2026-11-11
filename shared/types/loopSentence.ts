import type { LoopSentenceSettings } from '../utils/loopSentence'

// POST /api/loops/understand (#216)
export interface LoopSentenceResponse {
  settings: LoopSentenceSettings
  // Sentences the member has left today.
  quota_remaining: number
}
