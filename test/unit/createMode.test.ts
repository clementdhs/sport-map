import { describe, expect, it } from 'vitest'
import { parseCreateMode } from '~/utils/createMode'

describe('parseCreateMode', () => {
  it('keeps the known modes only', () => {
    expect(parseCreateMode('loop')).toBe('loop')
    expect(parseCreateMode('manual')).toBe('manual')
    for (const value of [null, undefined, '', 'Loop', 'out-and-back', ['loop'], 1]) {
      expect(parseCreateMode(value)).toBeNull()
    }
  })
})
