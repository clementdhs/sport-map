import { registerPlugin } from '@capacitor/core'
import type { SpeechRecognitionPlugin } from '@capacitor-community/speech-recognition'
import { isNativeApp } from '~/utils/nativeGeolocation'
import { type DictationError, dictationErrorOf, nativeDictationErrorOf, transcriptOf } from '~/utils/dictation'

// Dictating into a text field (#296). In the browser through the Web Speech API (Chrome sends the sound to Google;
// Firefox has none), in the Android app, whose WebView has none, through Android's own recognition. `supported`
// stays false until mounted and wherever neither exists, so the button only shows where it can work.

interface WebRecognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type WebRecognitionConstructor = new () => WebRecognition

let plugin: SpeechRecognitionPlugin | undefined
const nativeRecognition = () => (plugin ??= registerPlugin<SpeechRecognitionPlugin>('SpeechRecognition'))

function webRecognition(): WebRecognitionConstructor | undefined {
  const scope = window as unknown as { SpeechRecognition?: WebRecognitionConstructor, webkitSpeechRecognition?: WebRecognitionConstructor }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition
}

export function useDictation() {
  const supported = ref(false)
  const listening = ref(false)
  const error = ref<DictationError | null>(null)
  let recognition: WebRecognition | null = null

  onMounted(async () => {
    if (!isNativeApp()) {
      supported.value = !!webRecognition()
      return
    }
    try {
      supported.value = (await nativeRecognition().available()).available
    }
    catch {
      supported.value = false
    }
  })

  // `onText` gets everything heard since the start, again as the words come (only at the end in the app).
  async function start(language: string, onText: (said: string) => void) {
    if (listening.value) return
    error.value = null
    listening.value = true
    if (isNativeApp()) {
      await startNative(language, onText)
      return
    }
    const Recognition = webRecognition()
    if (!Recognition) {
      listening.value = false
      return
    }
    const current = new Recognition()
    recognition = current
    current.lang = language
    current.interimResults = true
    current.continuous = false
    current.maxAlternatives = 1
    current.onresult = event => onText(transcriptOf(event.results))
    current.onerror = (event) => {
      error.value = dictationErrorOf(event.error)
    }
    current.onend = () => {
      if (recognition === current) {
        recognition = null
        listening.value = false
      }
    }
    try {
      current.start()
    }
    catch {
      recognition = null
      listening.value = false
      error.value = 'failed'
    }
  }

  async function startNative(language: string, onText: (said: string) => void) {
    const speech = nativeRecognition()
    try {
      // Asked on the first press only; a refusal is said next to the field.
      let { speechRecognition } = await speech.checkPermissions()
      if (speechRecognition !== 'granted') ({ speechRecognition } = await speech.requestPermissions())
      if (speechRecognition !== 'granted') {
        error.value = 'denied'
        return
      }
      // Without partial results, the call answers with the words or rejects with the error, even on silence.
      const { matches } = await speech.start({ language, maxResults: 1, partialResults: false, popup: false })
      const said = matches?.[0] ?? ''
      if (said) onText(said)
      else error.value = 'noSpeech'
    }
    catch (failure) {
      error.value = nativeDictationErrorOf((failure as Error)?.message ?? '')
    }
    finally {
      listening.value = false
    }
  }

  // Stopping keeps what was heard so far.
  function stop() {
    if (isNativeApp()) {
      nativeRecognition().stop().catch(() => {})
      return
    }
    recognition?.stop()
  }

  onBeforeUnmount(() => {
    if (!listening.value) return
    if (isNativeApp()) nativeRecognition().stop().catch(() => {})
    else recognition?.abort()
  })

  return { supported, listening, error, start, stop }
}
