import { describe, expect, it } from 'vitest'
import { toRouteQuote } from '../../server/utils/routeList'

describe('toRouteQuote', () => {
  it('keeps a comment and its author', () => {
    expect(toRouteQuote({ comment: ' Superbe vue. ', author: 'Julie' })).toEqual({ comment: 'Superbe vue.', author: 'Julie' })
  })

  it('drops a missing, empty or malformed quote', () => {
    expect(toRouteQuote(null)).toBeNull()
    expect(toRouteQuote('text')).toBeNull()
    expect(toRouteQuote({ comment: '  ', author: 'Julie' })).toBeNull()
    expect(toRouteQuote({ comment: 'Bien', author: null })).toBeNull()
  })
})
