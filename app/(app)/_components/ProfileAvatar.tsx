'use client'

import Image from 'next/image'
import { useState } from 'react'

function AvatarImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return <Image src={src} alt="" fill sizes="112px" unoptimized className="object-cover" onError={() => setFailed(true)} />
}

export default function ProfileAvatar({ name, src, className = 'h-8 w-8 text-xs' }: { name: string; src: string; className?: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
  return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-brand-light)] font-[family-name:var(--font-mono)] font-semibold text-[var(--color-brand)] ${className}`}>
    <span aria-hidden="true">{initials || 'U'}</span>
    <AvatarImage key={src} src={src} />
    <span className="sr-only">Foto profil {name}</span>
  </span>
}
