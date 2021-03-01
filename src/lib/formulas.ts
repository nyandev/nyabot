

export function getXPRequiredForLevel( level: number ): number
{
  const curveCoefficient = 0.15
  const base = 1200
  const multiplier = 1000
  return (
    ( base + multiplier + ( level * ( level * curveCoefficient ) * multiplier ) ) -
    ( Math.log( level + 1.176 ) * multiplier )
  )
}
