export function normalizeWhatsApp(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return `62${digits}`
}

export function openWhatsApp(phone: string, message: string): void {
  const normalized = normalizeWhatsApp(phone)
  if (!normalized) throw new Error('Nomor WhatsApp belum tersedia.')
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template
  )
}
