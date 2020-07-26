'use strict'
const logSprintf = require( '../globals.js' ).logSprintf
module.exports =
{
  getXPRequiredForLevel: function( level )
  {
    const curveCoefficient = 0.15
    const base = 1200
    const multiplier = 1000
    return (
      ( base + multiplier + ( level * ( level * curveCoefficient ) * multiplier ) ) -
      ( Math.log( level + 1.176 ) * multiplier )
    )
  }
}