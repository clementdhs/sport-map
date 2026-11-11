// Dictating a sentence (#296): pure helpers shared by useDictation and its tests.

export type DictationError = 'denied' | 'noSpeech' | 'failed'

// The recognition's language follows the interface's.
export function dictationLanguage(locale: string): string {
  return locale === 'en' ? 'en-US' : 'fr-FR'
}

// What was said goes after what is already typed, never past the field's length: it stays to be read and corrected.
export function withDictation(typed: string, said: string, maxLength: number): string {
  const words = said.trim()
  if (!words) return typed
  const before = typed.trimEnd()
  return (before ? `${before} ${words}` : words).slice(0, maxLength)
}

// The best guess of every part the Web Speech API recognised so far (SpeechRecognitionResultList).
export function transcriptOf(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  return Array.from(results, result => result[0]?.transcript ?? '').join('')
}

// A Web Speech error code (SpeechRecognitionErrorEvent.error) as a message to show, null when the dictation was
// stopped on purpose.
export function dictationErrorOf(code: string): DictationError | null {
  if (code === 'aborted') return null
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'denied'
  if (code === 'no-speech') return 'noSpeech'
  return 'failed'
}

// The Android plugin's rejection (@capacitor-community/speech-recognition, SpeechRecognizer's error texts).
export function nativeDictationErrorOf(message: string): DictationError {
  if (message === 'Missing permission' || message === 'Insufficient permissions') return 'denied'
  if (message === 'No match' || message === 'No speech input') return 'noSpeech'
  return 'failed'
}
