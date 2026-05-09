import { cn } from '@/shared/lib/utils'

interface SettingFieldProps {
  label: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function SettingField({ label, description, children, className }: SettingFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-sm font-medium text-[#E8E8ED]">{label}</label>
      {description && <p className="text-xs text-[#6B7280]">{description}</p>}
      {children}
    </div>
  )
}

interface SettingToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
}

export function SettingToggle({ checked, onChange, label, description, disabled }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && <span className="text-sm text-[#E8E8ED]">{label}</span>}
          {description && <p className="text-xs text-[#6B7280] mt-0.5">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#161822]',
          checked ? 'bg-[#8B5CF6]' : 'bg-[#252A3D]',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}

interface SettingInputProps {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  suffix?: string
  disabled?: boolean
  error?: string
}

export function SettingInput({ value, onChange, placeholder, type = 'text', suffix, disabled, error }: SettingInputProps) {
  return (
    <div>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full rounded-lg border bg-[#0B0E14] px-3.5 py-2.5 text-sm text-[#E8E8ED] placeholder:text-[#6B7280] transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)] hover:border-[#3B82F6] disabled:bg-[#1A1D2B] disabled:text-[#6B7280] disabled:cursor-not-allowed',
            error ? 'border-[#EF4444]' : 'border-[#252A3D]',
            suffix && 'pr-16',
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280] pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-[#EF4444] mt-1">{error}</p>}
    </div>
  )
}

interface SettingSelectProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}

export function SettingSelect({ value, onChange, options, disabled }: SettingSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-lg border border-[#252A3D] bg-[#0B0E14] px-3.5 py-2.5 text-sm text-[#E8E8ED] transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)] hover:border-[#3B82F6] disabled:bg-[#1A1D2B] disabled:text-[#6B7280] disabled:cursor-not-allowed appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

interface SettingTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
}

export function SettingTextarea({ value, onChange, placeholder, rows = 3, disabled }: SettingTextareaProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className="w-full rounded-lg border border-[#252A3D] bg-[#0B0E14] px-3.5 py-2.5 text-sm text-[#E8E8ED] placeholder:text-[#6B7280] transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)] hover:border-[#3B82F6] disabled:bg-[#1A1D2B] disabled:text-[#6B7280] disabled:cursor-not-allowed resize-none"
    />
  )
}

interface SettingSectionProps {
  title: string
  children: React.ReactNode
}

export function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[#FFFFFF] uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

export function SettingDivider() {
  return <div className="border-t border-[#1E2130] my-4" />
}
