---
paths:
  - "app/composables/useDictation.ts"
  - "app/utils/dictation.ts"
  - "app/components/LoopSentence.vue"
---

# Dictating the loop sentence (#296)

- `useDictation` picks the recognition: in the browser the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`; Chrome sends the sound to Google, said in the mic's tooltip; Firefox has none), in the Android app `@capacitor-community/speech-recognition` (Android's recognizer, the WebView has no Web Speech). `supported` is only set on mount (`available()` in the app), so the mic is absent from the SSR HTML and wherever neither exists.
- The words go after what is typed (`withDictation`, capped at `LOOP_SENTENCE_MAX_LENGTH`) and are never sent on their own: the member reads them and presses Enter.
- In the app the plugin is called with `partialResults: false`: with partial results its `start()` resolves at once and Android's errors (silence, refusal) are lost, leaving the button stuck listening. So the words appear only once the member stops speaking. The microphone permission (`RECORD_AUDIO`, from the plugin's manifest) is asked on the first press; a refusal is a message next to the field (`nativeDictationErrorOf` reads the plugin's error texts).
- Adding the plugin needs a new APK (`npm run android:sync`).
- e2e: `editor.spec.ts` replaces `webkitSpeechRecognition` with a fake in an init script.
