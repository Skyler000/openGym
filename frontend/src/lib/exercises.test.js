import { describe, it, expect } from 'vitest'
import { exerciseSearchUrl } from './exercises.js'

describe('exerciseSearchUrl', () => {
  it('builds a YouTube search for the exercise name', () => {
    expect(exerciseSearchUrl('Sled Push')).toBe('https://www.youtube.com/results?search_query=Sled%20Push%20exercise%20form')
  })
  it('handles an empty or missing name', () => {
    expect(exerciseSearchUrl('')).toBe('https://www.youtube.com/results?search_query=exercise%20form')
    expect(exerciseSearchUrl(undefined)).toContain('exercise%20form')
  })
})
