import { describe,expect,it } from 'vitest'
import { providerText } from './format'
describe('Provider message limit',()=>{
 it('preserves normal text exactly',()=>expect(providerText('✅ Tersimpan\nhttps://atm-sig.vercel.app/tasks/abc')).toBe('✅ Tersimpan\nhttps://atm-sig.vercel.app/tasks/abc'))
 it('preserves the checking URL and complete Unicode characters for long replies',()=>{
  const result=providerText('😀'.repeat(2400)+'\nhttps://atm-sig.vercel.app/tasks/abc')
  expect(result.length).toBeLessThanOrEqual(4000)
  expect(result.endsWith('https://atm-sig.vercel.app/tasks/abc')).toBe(true)
  expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
 })
 it('bounds long messages without an application URL too',()=>expect(providerText('a'.repeat(5000)).length).toBeLessThanOrEqual(4000))
})
