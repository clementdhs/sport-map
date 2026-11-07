import { describe, expect, it } from 'vitest'
import { splitUnit } from '~/utils/keyFigures'

describe('splitUnit', () => {
  it('sets the unit apart from the figure', () => {
    expect(splitUnit('21,40 km')).toEqual(['21,40', 'km'])
    expect(splitUnit('850 m')).toEqual(['850', 'm'])
  })

  it('keeps a figure without unit whole', () => {
    expect(splitUnit('—')).toEqual(['—', undefined])
  })
})
