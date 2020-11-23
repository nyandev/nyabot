import path = require( 'path' )
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'

import { debug, logSprintf } from '../globals'

import { Backend } from '../lib/backend'
import { Parser } from '../lib/parser'
import { Redis } from '../lib/redis'

import { CommandCallbackType, NyaInterface, ModuleBase } from './module'


class EightBallCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: '8ball',
      group: 'games',
      memberName: '8ball',
      description: 'Answers a yes/no question.',
      details: 'Call with a question as an argument.',
      args: [{
        key: 'question',
        prompt: 'Ask the 8-ball a question.',
        type: 'string',
      }],
      argsPromptLimit: 1
    } )
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const choices = ['yes', 'no']

    let data = {}
    const index = Math.floor( Math.random() * choices.length )
    if ( choices[index] === 'yes' )
      data = {
        imageURL: 'https://i.pinimg.com/originals/ce/68/ac/ce68ac827852aec0f097e58d930c2032.gif'
      }
    else
      data = {
        message: "That\u2019s no good, Onii-chan!"
      }
    return this._service.host.respondTo( message, '8ball', data )
  }
}


type HangmanState = {
  word: string,
  guesses: string[],
  misses: number,
  hiddenChar?: string
}


class Hangman {
  private static data =
    JSON.parse( fs.readFileSync( path.resolve( __dirname, '../../data/hangman.json' ), 'utf8' ) )
  private static defaultHiddenChar = '_'

  static states = Hangman.data.states
  static wordlists = Hangman.data.wordlists
  static hiddenChars = Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')

  word: string
  guesses: string[]
  misses: number
  hiddenChar: string

  constructor( { word, guesses, misses, hiddenChar }: HangmanState ) {
    this.word = word
    this.guesses = guesses
    this.misses = misses
    this.hiddenChar = hiddenChar ?? Hangman.defaultHiddenChar
  }

  draw( showWord: boolean = false ) {
    const resultArray = []
    for ( const char of this.word ) {
      if ( showWord || !Hangman.hiddenChars.includes( char ) ||
          this.guesses.includes( char.toLowerCase() ) )
        resultArray.push( char )
      else
        resultArray.push( this.hiddenChar )
    }
    const wrongGuesses = this.wrongGuesses
    let result = resultArray.join( ' ' )
    if ( this.misses )
      result += `\n${Hangman.states[this.misses - 1]}`
    if ( wrongGuesses )
      result += `\nGuesses: ${wrongGuesses}`
    return result
  }

  guessed( char: string ): boolean {
    return this.guesses.includes( char )
  }

  get isWon(): boolean {
    const wordNoPunctuation = Array.from( this.word.toLowerCase() )
      .filter( ( char: string ) => Hangman.hiddenChars.includes( char ) )
    return wordNoPunctuation.every( char => this.guesses.includes( char ) )
  }

  save( redisKey: string, redis: Redis ): void {
    redis.set( redisKey, JSON.stringify( {
      word: this.word,
      guesses: this.guesses,
      misses: this.misses,
      hiddenChar: this.hiddenChar
    } ) )
  }

  get wrongGuesses(): string {
    const result = []
    for ( const char of this.guesses ) {
      if ( this.word.toLowerCase().indexOf( char ) === -1 )
      result.push( char )
    }
    return result.join( ' ' ).toUpperCase()
  }

  win( message: Message, redis: Redis ): void {
    message.channel.send( `The word is "${this.word}"! ${message.author.username} is the winner.` )
    redis.del( `hangman_${message.channel.id}` )
  }

  wordIncludes( char: string ): boolean {
    return this.word.toLowerCase().indexOf( char.toLowerCase() ) !== -1
  }
}

class HangmanCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'hangman',
      group: 'games',
      memberName: 'hangman',
      description: "Start a game of Hangman.",
      args: [{
        key: 'wordlist',
        prompt: 'Choose a word list.',
        type: 'string'
      }],
      argsPromptLimit: 1
    } )
  }

  async run( message: Commando.CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const arg = args.wordlist.toLowerCase()
    const redis = this._service.backend._redis
    const redisKey = `hangman_${message.channel.id}`
    if ( await redis.get( redisKey ) )
      return this._service.host.respondTo( message, 'hangman_exists' )

    if ( !Hangman.wordlists.hasOwnProperty( arg ) )
      return this._service.host.respondTo( message, 'hangman_invalid_wordlist', arg )

    const wordlist = Hangman.wordlists[arg]
    const word = wordlist[Math.floor( Math.random() * wordlist.length )]

    const hangman = new Hangman( {
      word: word,
      guesses: [],
      misses: 0,
    } )
    hangman.save( redisKey, redis )

    let note
    if ( arg === 'anime' )
      note = "English anime titles are preferred."
    return this._service.host.respondTo( message, 'hangman_start', hangman.draw(), note )
  }
}


class HangmanStopCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'hangmanstop',
      group: 'games',
      memberName: 'hangmanstop',
      description: "Stop a running Hangman game."
    } )
  }

  async run( message: Commando.CommandoMessage, args: string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const redis = this._service.backend._redis
    const redisKey = `hangman_${message.channel.id}`
    if ( await redis.get( redisKey ) ) {
      redis.del( redisKey )
      return this._service.host.respondTo( message, 'hangman_stop' )
    }
    return null
  }
}


class HangmanListCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'hangmanlist',
      group: 'games',
      memberName: 'hangmanlist',
      description: "Show the word lists available for Hangman."
    } )
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const wordlists = Object.keys( Hangman.wordlists )
    return this._service.host.respondTo( message, 'hangman_list', wordlists.join( ', ' ) )
  }
}


class SpeedTyping {
  static texts = JSON.parse( fs.readFileSync(
    path.resolve( __dirname, '../../data/speedtyping.json' ), 'utf8' ) )
}


class SpeedTypingCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'speedtyping',
      group: 'games',
      memberName: 'speedtyping',
      description: "Start a game of speed typing.",
    } )
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const redis = this._service.backend._redis
    const redisKey = `speedtyping_${message.channel.id}`
    if ( await redis.get( redisKey ) )
      return this._service.host.respondTo( message, 'speedtyping_exists' )
    const texts = Object.keys( SpeedTyping.texts )
    const index = Math.floor( Math.random() * texts.length )
    const { time, text } = SpeedTyping.texts[texts[index]]
    const data = {
      text,
      started: moment().valueOf(),
      chars: text.length
    }
    redis.set( redisKey, JSON.stringify( data ) )
    setTimeout( () => {
      redis.del( redisKey )
      message.channel.send( "Speed typing contest ended." )
    }, time * 1000 )
    return this._service.host.respondTo( message, 'speedtyping_start', time, '```' + text + '```' )
  }
}


export class GamesModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async destroy()
  {
    const speedtypingChannels = await this.backend._redis.keys( 'speedtyping_*' )
    for ( const channel of speedtypingChannels )
      await this.backend._redis.del( channel )
  }

  async onMessage( message: Message ): Promise<void>
  {
    const redis = this.backend._redis

    const hangmanRedisKey = `hangman_${message.channel.id}`
    const hangmanState = await redis.get( hangmanRedisKey )
    if ( typeof hangmanState === 'string' ) {
      const hangman = new Hangman( JSON.parse( hangmanState ) )
      if ( message.content.replace( "'", '\u2019' ).toLowerCase() === hangman.word.toLowerCase() ) {
        // Check if the message is identical to the word
        hangman.win( message, redis )
      } else if ( message.content.trim().length === 1 ) {
        // Check one-character messages
        const char = message.content.trim()[0].toLowerCase()
        if ( Hangman.hiddenChars.includes( char ) && !hangman.guessed( char ) ) {
          hangman.guesses.push( char.toLowerCase() )
          if ( !hangman.wordIncludes( char ) ) {
            // Incorrect guess
            hangman.misses += 1
            if ( hangman.misses < Hangman.states.length ) {
              message.channel.send( "Nope! ```" + hangman.draw() + "```" )
              hangman.save( hangmanRedisKey, redis )
            } else {
              message.channel.send( "You lost!\n```" + hangman.draw( true ) + "```" )
              redis.del( hangmanRedisKey )
            }
          } else {
            // Correct guess
            message.channel.send( "Correct! ```" + hangman.draw() + "```" )
            if ( hangman.isWon )
              hangman.win( message, redis )
            else
              hangman.save( hangmanRedisKey, redis )
          }
        }
      }

      const speedTypingRedisKey = `speedtyping_${message.channel.id}`
      const speedTypingData = (await redis.get( speedTypingRedisKey )) as string | null
      // really lazy implementation, maybe add a WPM counter and shit
      if ( speedTypingData !== null ) {
        const { text, started, chars } = JSON.parse( speedTypingData )
        if ( text === message.content ) {
          const time = ( moment().valueOf() - started ) / 1000
          const cps = Math.round( 10 * chars / time ) / 10
          message.channel.send( `${message.author.username} completed speed typing in ${time} seconds!`
            + ` That\u2019s ${cps} characters per second.` )
        }
      }
    }


    /*
    const parsed = this._parser.parseMessage( msg.content )

    const guild = message.guild ? message.guild.id : undefined
    const prefix = this._backend.getSetting( 'Prefix', guild )
    const cmd = this._parser.parseCommand( parsed, prefix )
    if ( cmd )
    {
      logSprintf( 'debug', 'Looks like a command: %s ( %i args )', cmd.command, cmd.args.length )
      if ( cmd.command === 'test' && msg.author )
      {
        const embed = this.buildEmbedWelcome( message.author )
        message.channel.send( embed )
        const guild = await this._backend.getGuildBySnowflake( message.guild.id )
        if ( guild )
        {
          //this._backend.setGuildSetting( guild.id, 'testsetting', 'cool value bro!' )
          //this._backend.setGuildSetting( guild.id, 'poop', 'yeehaw' )
          let ftch = await this._backend.getGuildSettings( guild.id )
          console.log( ftch )
        }
      }
    }*/
  }

  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.client, 'games', 'Games', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new EightBallCommand( this ),
      new HangmanCommand( this, this.client ),
      new HangmanStopCommand( this, this.client ),
      new HangmanListCommand( this, this.client ),
      new SpeedTypingCommand( this )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}
