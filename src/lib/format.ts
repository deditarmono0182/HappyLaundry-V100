export const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
}).format(value || 0)

export const normalizePhone = (value: string) => value.replace(/[^0-9+]/g, '')
