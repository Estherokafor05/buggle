export function discountedTotal(total: number, code: string): number {
  if (code === 'SAVE10') return total * 0.9;
  if (code) throw new Error('Discount code is not valid');
  return total;
}
