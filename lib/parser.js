'use strict'

const sprintf = require( 'sprintf-js' ).sprintf
const moment = require( 'moment' )

const unicode_generalCategory = require( 'unicode-13.0.0/General_Category' )

const charCategoryMultipliers = [
  0, // none
  1, // latin letters
  2  // other letters (japanese etc.)
]

const baseXPPerLetter = 0.11
const perMessageBaseXP = 0.65
const minLettersInMsg = 5

module.exports = class Parser
{
  constructor()
  {
    /*let uc = require( 'unicode-13.0.0/General_Category/Uppercase_Letter/code-points.js' )
    let o = require( 'unicode-13.0.0/General_Category/Other_Letter/code-points.js' )
    let l = require( 'unicode-13.0.0/General_Category/Letter/code-points.js' )
    console.log(uc)
    console.log(o)
    console.log(l)
    console.log('uc length: '+uc.length)
    console.log('o length: '+o.length)
    console.log('l length: '+l.length)
    console.log( unicode_generalCategory )*/
  }
  parseMessage( fulltext )
  {
    let xp = 0
    let i = 0
    let letters = 0
    while ( i < fulltext.length )
    {
      let multiplier = 0
      const char = fulltext[i]
      if ( char === '<' && ( i + 5 < fulltext.length ) )
      {
        const close = fulltext.indexOf( '>', i + 1 )
        if ( fulltext[i + 1] === ':' && close > i )
        {
          // emote
          const emoteClose = fulltext.indexOf( ':', i + 2 )
          if ( emoteClose > i && emoteClose < close )
          {
            const emoteName = fulltext.substr( i + 1, emoteClose - i )
            const emoteNumber = fulltext.substr( emoteClose + 1, close - emoteClose - 1 )
            if ( /^\d+$/.test( emoteNumber ) )
            {
              logSprintf( 'parse', 'emote: %s (%s)', emoteName, emoteNumber )
              i = close + 1
              continue
            }
          }
        }
        else if ( ( fulltext[i + 1] === '@' || fulltext[i + 1] === '#' ) && close > i )
        {
          // mention (user, role, channel)
          const mentionType = ( fulltext[i + 2] === '&' ? 'role' : fulltext[i + 1] === '#' ? 'channel' : 'user' )
          const j = ( ( mentionType === 'role' || fulltext[i + 2] === '!' ) ? i + 2 : i + 1 )
          const mentionNumber = fulltext.substr( j + 1, close - j - 1 )
          if ( /^\d+$/.test( mentionNumber ) )
          {
            logSprintf( 'parse', 'mention: %s (%s)', mentionNumber, mentionType )
            i = close + 1
            continue
          }
        }
      }
      const category = unicode_generalCategory.get( fulltext.codePointAt( i ) )
      if ( ['Lowercase_Letter', 'Uppercase_Letter', 'Number'].includes( category ) )
      {
        multiplier = charCategoryMultipliers[1]
        letters += 1
      }
      else if ( ['Other_Letter'].includes( category ) )
      {
        multiplier = charCategoryMultipliers[2]
        letters += 2
      }
      xp += ( baseXPPerLetter * multiplier )
      i++
    }
    return ( letters >= minLettersInMsg ? ( perMessageBaseXP + xp ) : false )
  }
}