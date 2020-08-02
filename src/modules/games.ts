import path = require( 'path' )
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { debug, logSprintf } from '../globals'

import { Backend } from '../lib/backend'
import { Parser } from '../lib/parser'
import { Redis } from '../lib/redis'

import { CommandCallbackType, NyaInterface, ModuleBase } from './module'


class EightBallCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
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
    })
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const choices = ['yes', 'no']

    let data = {}
    const index = Math.floor( Math.random() * choices.length )
    if (choices[index] === 'yes')
      data = {
        message: ' ',
        imageURL: 'https://i.pinimg.com/originals/ce/68/ac/ce68ac827852aec0f097e58d930c2032.gif'
      }
    else
      data = {
        message: "That\u2019s no good, Onii-chan!"
      }
    return this._service.getHost().respondTo( message, '8ball', data )
  }
}

class HangmanCommand extends Commando.Command
{
  protected wordlists: Record<string, string[]>

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
    })
    const wordsPath = path.resolve( __dirname, '../../data/hangman.json' )
    this.wordlists = JSON.parse( fs.readFileSync( wordsPath, 'utf8' ) ).wordlists
  }

  async run( message: Commando.CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const arg = args.wordlist
    const redis = this._service.getBackend()._redis
    const redisKey = `hangman-${message.channel.id}`
    if ( await redis.get(redisKey) )
      return this._service.getHost().respondTo( message, 'hangman_exists' )

    if ( !this.wordlists.hasOwnProperty( arg.toLowerCase() ) )
      return this._service.getHost().respondTo( message, 'hangman_invalid_wordlist', arg )

    const wordlist = this.wordlists[arg]
    const word = wordlist[Math.floor(Math.random() * wordlist.length)]

    const state = {
      word: word,
      guesses: [],
      misses: 0
    }
    redis.set( redisKey, JSON.stringify(state) )

    return this._service.getHost().respondTo( message, 'hangman_start', drawHangman( state ) )
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
    })
  }

  async run( message: Commando.CommandoMessage, args: string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const redis = this._service.getBackend()._redis
    const redisKey = `hangman-${message.channel.id}`
    redis.del( redisKey )
    return this._service.getHost().respondTo( message, 'hangman_stop' )
  }
}

function drawHangman( state: any, showWord: boolean = false )
{
  const { word, guesses, misses } = state
  debug("word is", word)
  const resultArray = []
  for ( const char of word ) {
    if ( char === ' ' )
      resultArray.push( ' ' )
    else if ( guesses.includes( char.toLowerCase() ) || showWord )
      resultArray.push( char )
    else
      resultArray.push( '_' )
  }
  const wrongGuesses = hangmanWrongGuesses( state ).toUpperCase()
  let result = resultArray.join(' ')
  if ( state.misses )
    result += `\n${GamesModule.hangmanStates[state.misses]}`
  if ( wrongGuesses )
    result += `\nGuesses: ${wrongGuesses}`
  return result
}

function hangmanWrongGuesses( state: any )
{
  const result = []
  for ( const char of state.guesses ) {
    if ( state.word.toLowerCase().indexOf( char ) === -1 )
    result.push( char )
  }
  return result.join(' ')
}

function hangmanWin( message: Message, state: any, redis: Redis ): void
{
  message.channel.send( `The word is "${state.word}"! ${message.author.username} is the winner.` )
  redis.del( `hangman-${message.channel.id}` )
}

function hangmanWinState( state: any ): boolean
{
  const wordNoSpaces = Array.from( state.word.toLowerCase() ).filter( char => char !== ' ' )
  debug(wordNoSpaces)
  return wordNoSpaces.every( char => state.guesses.includes( char ) )
}

export class GamesModule extends ModuleBase
{
  static hangmanStates: Record<string, string> =
    JSON.parse( fs.readFileSync( path.resolve( __dirname, '../../data/hangman.json' ), 'utf8' ) ).states
 
  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async onMessage( message: Message ): Promise<void>
  {
    const redis = this.getBackend()._redis
    const hangmanRedisKey = `hangman-${message.channel.id}`
    const hangmanStateString = await redis.get( hangmanRedisKey )
    if ( typeof hangmanStateString === 'string' && hangmanStateString ) {
      const hangmanState = JSON.parse( hangmanStateString )
      if ( message.content.toLowerCase() === hangmanState.word.toLowerCase() ) {
        hangmanWin( message, hangmanState, redis )
      } else if ( message.content.trim().length === 1 ) {
        const char = message.content.trim()[0].toLowerCase()
        debug("state is", hangmanState)
        if ( char !== ' ' && !hangmanState.guesses.includes( char )) {
          hangmanState.guesses.push( char.toLowerCase() )
          if ( hangmanState.word.toLowerCase().indexOf( char ) === -1 ) {
            // miss
            hangmanState.misses += 1
            if ( hangmanState.misses < 10 ) {
              message.channel.send( "Nope! ```" + drawHangman( hangmanState ) + "```" )
              redis.set( hangmanRedisKey, JSON.stringify( hangmanState ) )
            } else {
              message.channel.send( "You lost!\n```" + drawHangman( hangmanState, true ) + "```" )
              redis.del( hangmanRedisKey )
            }
          } else {
            // hit
            message.channel.send( "Correct! ```" + drawHangman( hangmanState ) + "```" )
            debug( "win state:", hangmanWinState( hangmanState ) )
            if ( hangmanWinState( hangmanState ) )
              hangmanWin( message, hangmanState, redis )
            else
              redis.set( hangmanRedisKey, JSON.stringify( hangmanState ) )
          }
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
      logSprintf( 'debug', 'Looks like a command: %s (%i args)', cmd.command, cmd.args.length )
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
      new Commando.CommandGroup( this.getClient(), 'games', 'Games', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new EightBallCommand( this, this.getClient() ),
      new HangmanCommand( this, this.getClient() ),
      new HangmanStopCommand( this, this.getClient() )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}