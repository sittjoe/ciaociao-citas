import { describe, expect, it } from 'vitest'
import { normalizeIdentificationPath } from './identifications'

describe('normalizeIdentificationPath', () => {
  it('accepts storage paths under identifications', () => {
    expect(normalizeIdentificationPath('identifications/file.jpg')).toBe('identifications/file.jpg')
  })

  it('extracts encoded Firebase Storage object paths', () => {
    expect(
      normalizeIdentificationPath(
        'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/identifications%2Ffile.jpg?alt=media&token=abc',
      ),
    ).toBe('identifications/file.jpg')
  })

  it('rejects paths outside identifications', () => {
    expect(normalizeIdentificationPath('avatars/file.jpg')).toBeNull()
    expect(normalizeIdentificationPath('https://example.com/identifications/file.jpg')).toBeNull()
  })
})
