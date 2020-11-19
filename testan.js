function joinText(array)
{
  const parts = []
  const lastTwo = array.slice(-2).join(' and ')
  const rest = array.slice(0, -2).join(', ')
  if (rest)
    parts.push(rest)
  parts.push(lastTwo)
  return parts.join(', ')
}

console.log(joinText([]))
console.log(joinText(['a']))
console.log(joinText(['a', 'b']))
console.log(joinText(['a', 'b', 'c']))
console.log(joinText(['a', 'b', 'c', 'd']))