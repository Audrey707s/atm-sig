/** Keep a provider-sized text body without splitting Unicode or losing its checking link. */
export function providerText(body: string): string {
  if (body.length <= 4000) return body
  const urls = body.match(/https:\/\/atm-sig\.vercel\.app(?:\/[^\s*]*)?/g)
  const footer = '\n…' + (urls?.length ? '\n' + urls[urls.length - 1] : '')
  const budget = 3900 - footer.length
  let text = ''
  for (const character of body) {
    if (text.length + character.length > budget) break
    text += character
  }
  return text.trimEnd() + footer
}
