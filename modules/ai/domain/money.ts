export const million = 1000000n
export const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b
// All money is handled as integer millionths. Rates are explicit conservative ceilings.
export const decimal = (v: string) => {
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(v))
    throw new Error('Invalid price configuration')
  const [whole, fraction = ''] = v.split('.')
  return BigInt(whole!) * million + BigInt(fraction.padEnd(6, '0'))
}
export const money = (v: bigint) =>
  `${v / million}.${(v % million).toString().padStart(6, '0')}`
