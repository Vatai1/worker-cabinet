import type { AriaAttributes } from 'react'
import { SelectControl } from '@/shared/components/ui/SelectControl'
import type { SelectOption } from '@/shared/components/ui/SelectControl'

export type MultiSelectOption = SelectOption

interface Props extends AriaAttributes {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder: string
  countLabel: string
  searchable?: boolean
  searchPlaceholder?: string
  className?: string
  id?: string
  disabled?: boolean
}

export function MultiSelectDropdown({ options, selected, onChange, placeholder, countLabel, searchable, searchPlaceholder, ...props }: Props) {
  const label = selected.length === 0 ? placeholder : selected.length === 1 ? options.find(option => option.value === selected[0])?.label ?? placeholder : `${countLabel}: ${selected.length}`
  return (
    <SelectControl
      {...props}
      options={options}
      selected={selected}
      onChange={onChange}
      label={label}
      placeholder={selected.length === 0}
      multiple
      searchable={searchable ?? options.length >= 8}
      searchPlaceholder={searchPlaceholder}
      clearLabel={placeholder}
    />
  )
}
