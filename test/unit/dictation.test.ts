import { describe, expect, it } from 'vitest'
import { dictationErrorOf, dictationLanguage, transcriptOf, withDictation } from '~/utils/dictation'

describe('dictationLanguage', () => {
  it('listens in French when the interface is in French', () => {
    expect(dictationLanguage('fr')).toBe('fr-FR')
  })

  it('listens in English when the interface is in English', () => {
    expect(dictationLanguage('en')).toBe('en-US')
  })
})

describe('withDictation', () => {
  it('fills an empty field with what was said', () => {
    expect(withDictation('', ' boucle de 10 km ', 300)).toBe('boucle de 10 km')
  })

  it('adds what was said after the text already typed, with one space', () => {
    expect(withDictation('Rando costaud ', 'de 15 km', 300)).toBe('Rando costaud de 15 km')
  })

  it('leaves the field as it was when nothing was heard', () => {
    expect(withDictation('Footing', '  ', 300)).toBe('Footing')
  })

  it('never goes past the field length', () => {
    expect(withDictation('abc', 'defghij', 6)).toBe('abc de')
  })
})

describe('transcriptOf', () => {
  it('joins the best guess of every recognised part', () => {
    expect(transcriptOf([[{ transcript: 'boucle de' }], [{ transcript: ' 10 km' }]])).toBe('boucle de 10 km')
  })

  it('is empty when nothing was recognised', () => {
    expect(transcriptOf([])).toBe('')
  })
})

describe('dictationErrorOf', () => {
  it('reads a refused microphone as denied', () => {
    expect(dictationErrorOf('not-allowed')).toBe('denied')
    expect(dictationErrorOf('service-not-allowed')).toBe('denied')
  })

  it('says nothing was heard on silence', () => {
    expect(dictationErrorOf('no-speech')).toBe('noSpeech')
  })

  it('stays silent when the dictation was stopped on purpose', () => {
    expect(dictationErrorOf('aborted')).toBeNull()
  })

  it('reports any other error as a failure', () => {
    expect(dictationErrorOf('network')).toBe('failed')
    expect(dictationErrorOf('audio-capture')).toBe('failed')
  })
})
