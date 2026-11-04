import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import ProfileForm from './ProfileForm'

export const metadata: Metadata = { title: 'Profil Saya' }

export default async function AccountPage() {
  const user = await getSessionUser()
  const supabase = await createClient()
  const { data: unit } = await supabase
    .from('org_units')
    .select('name')
    .eq('id', user.orgUnitId)
    .maybeSingle()

  return (
    <section className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1>Profil Saya</h1>
      </header>
      <ProfileForm
        initialName={user.name}
        email={user.email}
        role={user.role}
        unitName={unit?.name ?? '—'}
      />
    </section>
  )
}
