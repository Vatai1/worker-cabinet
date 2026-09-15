export function personName(u) {
  return [u?.last_name, u?.first_name, u?.middle_name]
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
}
