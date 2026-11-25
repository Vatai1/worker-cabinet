import { Children, isValidElement } from 'react'
import type { ReactNode } from 'react'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import type { SelectDropdownProps } from '@/shared/components/ui/SelectDropdown'
import type { SelectOption } from '@/shared/components/ui/SelectControl'

interface Props extends Omit<SelectDropdownProps, 'options' | 'value'> {
  children: ReactNode
  value: string | number | undefined
}

function textContent(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    if (isValidElement<{ children?: ReactNode }>(child)) return textContent(child.props.children)
    return ''
  }).join('')
}

function collectOptions(children: ReactNode, group?: string, disabled = false): SelectOption[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean; title?: string }>(child)) return []
    if (child.type === 'option') {
      const label = child.props.label ?? textContent(child.props.children)
      return [{ value: String(child.props.value ?? label), label, disabled: disabled || child.props.disabled, title: child.props.title, group }]
    }
    return collectOptions(child.props.children, child.type === 'optgroup' ? child.props.label : group, disabled || child.props.disabled)
  })
}

export function Select({ children, value, ...props }: Props) {
  const options = collectOptions(children)
  return <SelectDropdown {...props} value={String(value ?? '')} options={options} />
}
