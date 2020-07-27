import { logSprintf } from '../globals'

const unicode_generalCategory = require( 'unicode-13.0.0/General_Category' )

const charCategoryMultipliers: number[] = [
  0, // none
  1, // latin letters
  2  // other letters (japanese etc.)
]

const baseXPPerLetter: number = 0.11
const perMessageBaseXP: number = 0.65
const minLettersInMsg: number = 5

export class ParsedBase
{
  protected _type: string
  get type(): string { return this._type }
  constructor( type: string )
  {
    this._type = type
  }
}

export class ParsedText extends ParsedBase
{
  protected _text: string
  get text(): string { return this._text }
  constructor( text: string )
  {
    super( 'text' )
    this._text = text
  }
}

export class ParsedMention extends ParsedBase
{
  protected _targetType: string
  protected _target: string
  get targetType(): string { return this._targetType }
  get target(): string { return this._target }
  constructor( type: string, target: string )
  {
    super( 'mention' )
    this._targetType = type
    this._target = target
  }
}

export class ParsedStruct
{
  xp: any
  parts: ParsedBase[]
  constructor()
  {
    this.parts = []
    this.xp = 0
  }
}

export class ParsedEmote extends ParsedBase
{
  protected _name: string
  protected _code: string
  get name(): string { return this._name }
  get code(): string { return this._code }
  constructor( name: string, code: string )
  {
    super( 'emote' )
    this._name = name
    this._code = code
  }
}

export class Parser
{
  protected _prefix: string
  constructor( prefix = '.' )
  {
    this.setPrefix( prefix )
  }
  setPrefix( prefix: string ): void
  {
    this._prefix = prefix
  }
  parseCommand( parsed: ParsedStruct ): any
  {
    if ( parsed.parts.length < 1 || parsed.parts[0].type !== 'text' )
      return null
    const cmd = parsed.parts[0] as ParsedText
    if ( cmd.text.indexOf( this._prefix ) === 0 )
    {
      let ret = {
        command: cmd.text.substr( this._prefix.length ).toLowerCase(),
        args: parsed.parts.slice( 1 )
      }
      return ret
    }
    return null
  }
  parseMessage( fulltext: string ): ParsedStruct
  {
    logSprintf( 'parse', 'Parsing:' )
    console.log( fulltext )
    let i = 0
    let letters = 0
    let parsed = new ParsedStruct
    let buffer = ''
    let skipNext = false
    while ( i < fulltext.length )
    {
      let multiplier = 0
      const char = fulltext[i]
      if ( char === '\\' && !skipNext )
      {
        // \ to escape special handling of next character
        skipNext = true
        i++
        continue
      }
      if ( !skipNext )
      {
        if ( char === '"' && ( i + 2 < fulltext.length ) )
        {
          // quoted text (copy as-is until end)
          let close = -1
          let spos = i + 1
          while ( spos && spos < fulltext.length )
          {
            close = fulltext.indexOf( '"', spos )
            if ( ( close && fulltext[close - 1] !== '\\' ) || !close )
              spos = 0
            else if ( close )
              spos = close + 1
          }
          if ( close > i )
          {
            if ( buffer.length )
              parsed.parts.push( new ParsedText( buffer ) )
            buffer = fulltext.substr( i + 1, close - i - 1 )
            parsed.parts.push( new ParsedText( buffer ) )
            buffer = ''
            i = close + 1
            continue
          }
        }
        else if ( char === '<' && ( i + 5 < fulltext.length ) )
        {
          const close = fulltext.indexOf( '>', i + 1 )
          if ( ( fulltext[i + 1] === ':' || ( fulltext[i + 1] === 'a' && fulltext[i + 2] === ':' ) ) && close > i )
          {
            // emote
            if ( fulltext[i + 1] === 'a' )
              i++
            const emoteClose = fulltext.indexOf( ':', i + 2 )
            if ( emoteClose > i && emoteClose < close )
            {
              const emoteName = fulltext.substr( i + 1, emoteClose - i )
              const emoteNumber = fulltext.substr( emoteClose + 1, close - emoteClose - 1 )
              if ( /^\d+$/.test( emoteNumber ) )
              {
                logSprintf( 'parse', 'emote: %s (%s)', emoteName, emoteNumber )
                if ( buffer.length )
                  parsed.parts.push( new ParsedText( buffer ) )
                buffer = ''
                parsed.parts.push( new ParsedEmote( emoteName, emoteNumber ) )
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
              if ( buffer.length )
                parsed.parts.push( new ParsedText( buffer ) )
              buffer = ''
              parsed.parts.push( new ParsedMention( mentionType, mentionNumber ) )
              i = close + 1
              continue
            }
          }
        }
      }
      const category = unicode_generalCategory.get( fulltext.codePointAt( i ) )
      if ( !skipNext && category.indexOf( 'Separator' ) >= 0 )
      {
        if ( buffer.length )
          parsed.parts.push( new ParsedText( buffer ) )
        buffer = ''
      }
      else
      {
        skipNext = false
        buffer += fulltext[i]
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
        parsed.xp += ( baseXPPerLetter * multiplier )
      }
      i++
    }
    if ( buffer.length )
      parsed.parts.push( new ParsedText( buffer ) )
    parsed.xp = ( letters >= minLettersInMsg ? ( perMessageBaseXP + parsed.xp ) : false )
    return parsed
  }
}