import { hasOrgRole } from '@/shared/lib/permissions'
import { AdminBannerCard } from '@/core/admin/components/AdminBannerCard'
import { LoginSettingsCard } from '@/core/admin/pages/tabs/LoginSettingsCard'

export function SettingsTab({ mode }: { mode: 'global' | 'org' }) {
  if (mode === 'global') {
    return (
      <div className="space-y-4">
        <LoginSettingsCard />
        <AdminBannerCard scope="global" />
      </div>
    )
  }
  return hasOrgRole('admin') ? <AdminBannerCard scope="org" /> : null
}
