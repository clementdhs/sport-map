import { registerPlugin } from '@capacitor/core'
import type { TextToSpeechPlugin } from '@capacitor-community/text-to-speech'
import { isNativeApp } from '~/utils/nativeGeolocation'

// Speaking with the phone's own voices, which work offline. In the Android app, whose WebView has no
// speechSynthesis, through the system text-to-speech: it keeps speaking with the screen off, as long as the
// GPS foreground service keeps the page running.

let plugin: TextToSpeechPlugin | undefined
const textToSpeech = () => (plugin ??= registerPlugin<TextToSpeechPlugin>('TextToSpeech'))

export function speechSupported(): boolean {
  return isNativeApp() || (typeof window !== 'undefined' && 'speechSynthesis' in window)
}

// Sentences are queued, never cut: an announcement is short, and the next one can wait.
export function speak(text: string, lang: string) {
  if (isNativeApp()) {
    // 1: QueueStrategy.Add (the enum would bring the plugin's web code into the bundle)
    textToSpeech().speak({ text, lang, queueStrategy: 1 }).catch(() => {})
    return
  }
  if (!speechSupported()) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (isNativeApp()) textToSpeech().stop().catch(() => {})
  else if (speechSupported()) window.speechSynthesis.cancel()
}
