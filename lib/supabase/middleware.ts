
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/database.types'

function requiredRoleLevel(pathname: string): number | null {
  if (pathname === '/approvals' || pathname.startsWith('/approvals/')) return 4
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return 2
  if (pathname === '/jobload' || pathname.startsWith('/jobload/')) return 3
  if (pathname === '/performance' || pathname.startsWith('/performance/')) return 3
  if (pathname === '/reports' || pathname.startsWith('/reports/')) return 2
  if (pathname === '/master-data' || pathname.startsWith('/master-data/')) return 2
  if (pathname === '/task-templates' || pathname.startsWith('/task-templates/')) return 2
  if (pathname === '/tasks/recurring' || pathname.startsWith('/tasks/recurring/')) return 2
  if (pathname === '/account' || pathname.startsWith('/account/')) return 1
  if (pathname === '/users' || pathname.startsWith('/users/')) return 3
  return null
}

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase environment variables are missing', {
      hasUrl: Boolean(supabaseUrl),
      hasKey: Boolean(supabaseKey),
    })

    return new NextResponse('Server configuration error', { status: 500 })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })

          supabaseResponse = NextResponse.next({ request })

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const redirectWithCookies = (url: URL) => {
    const response = NextResponse.redirect(url)

    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })

    return response
  }

  try {
    // Jangan hapus: diperlukan untuk memvalidasi user dan refresh session.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      console.error('Supabase getUser error:', authError.message)
    }

    const { pathname } = request.nextUrl

    const isPublicRoute = [
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/auth/confirm',
    ].includes(pathname)

    if (!user && !isPublicRoute) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.search = ''

      return redirectWithCookies(loginUrl)
    }

    if (user) {
      // Satu query untuk status + level role (relasi users -> roles).
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('status, role:roles!users_role_id_fkey ( level )')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profile || profile.status !== 'aktif') {
        await supabase.auth.signOut()

        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.search = ''
        loginUrl.searchParams.set(
          'error',
          profileError ? 'account_unavailable' : 'account_inactive',
        )

        return redirectWithCookies(loginUrl)
      }

      const role = profile.role

      if (!role) {
        console.error('Supabase role lookup error: role relation missing')

        await supabase.auth.signOut()

        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.search = ''
        loginUrl.searchParams.set('error', 'account_unavailable')

        return redirectWithCookies(loginUrl)
      }

      const minimumRoleLevel = requiredRoleLevel(pathname)

      if (
        minimumRoleLevel !== null &&
        (typeof role.level !== 'number' || role.level < minimumRoleLevel)
      ) {
        const fallbackUrl = request.nextUrl.clone()
        fallbackUrl.pathname = '/tasks'
        fallbackUrl.search = ''
        fallbackUrl.searchParams.set('error', 'forbidden')

        return redirectWithCookies(fallbackUrl)
      }
    }

    if (user && pathname === '/login') {
      const dashboardUrl = request.nextUrl.clone()
      dashboardUrl.pathname = '/dashboard'
      dashboardUrl.search = ''

      return redirectWithCookies(dashboardUrl)
    }

    return supabaseResponse
  } catch (error) {
    console.error(
      'Supabase session middleware error:',
      error instanceof Error ? error.message : 'Unknown error',
    )

    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
