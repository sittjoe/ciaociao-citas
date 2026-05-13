import { describe, expect, it } from 'vitest'
import { normalizeIdentificationPath, validateFileMagicBytes } from './identifications'

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

describe('validateFileMagicBytes', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ])

  it('accepts a valid JPEG with image/jpeg', () => {
    expect(validateFileMagicBytes(jpeg, 'image/jpeg')).toEqual({ ok: true, kind: 'jpeg' })
  })

  it('accepts a valid PNG with image/png', () => {
    expect(validateFileMagicBytes(png, 'image/png')).toEqual({ ok: true, kind: 'png' })
  })

  it('accepts a valid PDF with application/pdf', () => {
    expect(validateFileMagicBytes(pdf, 'application/pdf')).toEqual({ ok: true, kind: 'pdf' })
  })

  it('accepts a valid WebP with image/webp', () => {
    expect(validateFileMagicBytes(webp, 'image/webp')).toEqual({ ok: true, kind: 'webp' })
  })

  it('rejects mismatch between declared MIME and actual bytes', () => {
    const result = validateFileMagicBytes(jpeg, 'application/pdf')
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('jpeg')
  })

  it('rejects disallowed MIME types', () => {
    expect(validateFileMagicBytes(jpeg, 'application/javascript').ok).toBe(false)
  })

  it('rejects buffers too small to inspect', () => {
    expect(validateFileMagicBytes(new Uint8Array([0xff]), 'image/jpeg').ok).toBe(false)
  })

  it('rejects unknown content masquerading as JPEG', () => {
    const fake = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(validateFileMagicBytes(fake, 'image/jpeg').ok).toBe(false)
  })
})
