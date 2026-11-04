import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import ProfileForm from './ProfileForm'
import WorkspaceTabs, { MASTER_USER_TABS } from '../_components/WorkspaceTabs'
import { PROFILE_AVATAR_BUCKET, PROFILE_AVATAR_TTL_SECONDS } from '@/lib/account/avatar'

export const metadata: Metadata = { title: 'Profil Saya' }

export default async function AccountPage() {
  const user = await getSessionUser()
  const supabase = await createClient()
  const { data: unit } = await supabase
    .from('org_units')
    .select('name')
    .eq('id', user.orgUnitId)
    .maybeSingle()
  const { data: avatar } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .createSignedUrl(`${user.id}/avatar`, PROFILE_AVATAR_TTL_SECONDS)

  return (
    <section className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceTabs current="/account" tabs={MASTER_USER_TABS} roleLevel={user.roleLevel} />
      <ProfileForm
        userId={user.id}
        initialName={user.name}
        email={user.email}
        role={user.role}
        unitName={unit?.name ?? '—'}
        avatarUrl={avatar?.signedUrl ?? ''}
      />
    </section>
  )
}
