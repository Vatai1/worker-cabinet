import type { AriaAttributes } from 'react'
import { SelectControl } from '@/shared/components/ui/SelectControl'
import type { SelectOption } from '@/shared/components/ui/SelectControl'

export type SelectDropdownOption = SelectOption

export interface SelectDropdownProps extends AriaAttributes {
  options: SelectDropdownOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
  disabled?: boolean
  placeholder?: string
  searchable?: boolean
  searchPlaceholder?: string
  variant?: 'default' | 'cell'
}

export function SelectDropdown({ options, value, onChange, placeholder = 'Выберите…', searchable, ...props }: SelectDropdownProps) {
  const option = options.find(option => option.value === value)
  return (
    <SelectControl
      {...props}
      options={options}
      selected={option ? [value] : []}
      onChange={values => onChange(values[0] ?? '')}
      label={option?.label || placeholder}
      placeholder={!option}
      searchable={searchable ?? options.length >= 8}
    />
  )
}
