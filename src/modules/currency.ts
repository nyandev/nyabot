import * as fs from 'fs'
import { EventEmitter } from 'events'
import * as Commando from 'discord.js-commando'
import { CommandoMessage } from 'discord.js-commando'
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'
import { format as formatNumber } from 'd3-format'
import * as moment from 'moment'
import * as prettyMs from 'pretty-ms'
import randomInt = require( 'random-int' )
import { sprintf } from 'sprintf-js'

import { debug, log, logSprintf } from '../globals'
import { Backend } from '../lib/backend'
import { Arguments, NyaBaseCommand } from '../lib/command'
import { Parser } from '../lib/parser'

import { CommandCallbackType, NyaInterface, ModuleBase } from './module'


const duration = ( ms: number ) => prettyMs( ms, { secondsDecimalDigits: 0 } )
const formatDecimal = formatNumber( ',~r' )


class AwardCurrencyCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'award',
      group: 'currency',
      memberName: 'award',
      description: "Award currency to a user or role.",
      args: [{
        key: 'amount',
        prompt: "How much?",
        type: 'integer',
        min: 1
      },
      {
        key: 'target',
        prompt: "To whom?",
        type: 'user|role'
      }],
      argsPromptLimit: 1,
      guildOnly: true,
      ownerOnly: true
    })
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const backend = this._service.backend
    const host = this._service.host

    let currencySymbol = 'currency'
    try {
      const guild = await backend.getGuildBySnowflake( message.guild.id )
      currencySymbol = await backend.getSetting( this._service.settingKeys.currencySymbol, guild.id )
    } catch ( error ) {
      log( `Failed to fetch ${this._service.settingKeys.currencySymbol} setting for guild ${message.guild.id} or globally:`, error )
    }

    async function awardUser( userID: string, amount: number ) {
      const user = await backend.getUserBySnowflake( userID )
      await user.increment( { currency: amount } )
    }

    if ( args.target instanceof Role ) {
      for ( const userID of args.target.members.keys() ) {
        try {
          await awardUser( userID, args.amount )
        } catch ( error ) {
          log( `Failed to award currency to user ${userID} of role ${args.target.name}:`, error )
          return host.talk.sendError( message, 'unexpected_error' )
        }
      }
      return host.talk.sendText( message, 'currency_award_role', message.author.username, args.amount, currencySymbol, args.target.name )
    } else {
      try {
        await awardUser( args.target.id, args.amount )
      } catch ( error ) {
        log( `Failed to award currency to user ${args.target.id}:`, error )
        return host.talk.sendError( message, 'unexpected_error' )
      }
      return host.talk.sendText( message, 'currency_award_user', message.author.username, args.amount, currencySymbol, args.target.username )
    }
  }
}


class ShowCurrencyCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: '$',
      group: 'currency',
      memberName: '$',
      description: "Show available currency.",
      args: [{
        key: 'target',
        prompt: "Who?",
        type: 'user',
        default: ( msg: Commando.CommandoMessage ) => msg.author
      }],
      guildOnly: true
    })
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const backend = this._service.backend
    const host = this._service.host
    const user = await backend.getUserBySnowflake( args.target.id )

    let currencySymbol = 'currency'
    try {
      const guild = await backend.getGuildBySnowflake( message.guild.id )
      currencySymbol = await backend.getSetting( this._service.settingKeys.currencySymbol, guild.id )
    } catch ( error ) {
      log( `Failed to fetch ${this._service.settingKeys.currencySymbol} setting for guild ${message.guild.id} or globally:`, error )
    }
    return host.talk.sendText( message, 'currency_show', user.name, user.currency, currencySymbol )
  }
}


class SlotCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'slot',
      group: 'currency',
      memberName: 'slot',
      description: "Spin the slot machine.",
      args: [{
        key: 'amount',
        prompt: "How much?",
        type: 'integer',
        min: 1,
      }]
    })
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null >
  {
    const MULTIPLIERS = {
      threeJokers: 30,
      threeSame: 10,
      twoJokers: 4,
      oneJoker: 1
    }
    const backend = this._service.backend
    const host = this._service.host
    const config = host._config
    const images = [
      config.globalDefaults.SlotsJoker,
      ...config.globalDefaults.SlotsImages
    ]

    const user = await backend.getUserBySnowflake( message.author.id )
    if ( user.currency < args.amount )
      return host.respondTo( message, 'slot_insufficient_funds' )

    await user.decrement( { currency: args.amount } )

    const slots = []
    for (let i = 0; i < 3; i++)
      slots.push( Math.floor( Math.random() * images.length ) )

    const slotString = slots.map( index => images[index] ).join(' ')
    let multiplier = 0
    if ( slots.every( slot => slot === 0 ) ) {
      multiplier = MULTIPLIERS.threeJokers
    } else if ( slots[0] === slots[1] && slots[1] === slots[2] ) {
      multiplier = MULTIPLIERS.threeSame
    } else if ( slots.filter( slot => slot === 0 ).length === 2 ) {
      multiplier = MULTIPLIERS.twoJokers
    } else if ( slots.indexOf( 0 ) !== -1 ) {
      multiplier = MULTIPLIERS.oneJoker
    }
    const winAmount = args.amount * multiplier
    if ( winAmount > 0 ) {
      await user.increment( { currency: winAmount } )
      let currencySymbol = 'currency'
      try {
        const guild = await backend.getGuildBySnowflake( message.guild.id )
        currencySymbol = await backend.getSetting( this._service.settingKeys.currencySymbol, guild.id )
      } catch ( error ) {
        log( `Failed to fetch ${this._service.settingKeys.currencySymbol} setting for guild ${message.guild.id} or globally:`, error )
      }
      const formattedAmount = formatDecimal( winAmount )
      return host.talk.sendText( message, 'slot_win', slotString, formattedAmount, currencySymbol )
    } else {
      return host.talk.sendText( message, 'slot_no_win', slotString )
    }
  }
}


class TimelyCommand extends NyaBaseCommand
{
  constructor( protected module: CurrencyModule )
  {
    super( module,
    {
      name: 'timely',
      group: 'currency',
      description: "Get your regular delivery of tendies.",
      guildOnly: true,
    } )
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const host = this.module.host
    const redis = backend._redis

    let user
    try {
      user = await backend.getUserBySnowflake( message.author.id )
      if ( !user )
        throw new Error( `Backend#getUserBySnowflake returned ${user}` )
    } catch ( error ) {
      log( `Failed to fetch user ${message.author.id}: ${error}` )
      return null
    }

    let guild
    try {
      guild = await backend.getGuildBySnowflake( message.guild.id )
      if ( !guild )
        throw new Error( `Backend#getGuildBySnowflake returned ${guild}` )
    } catch ( error ) {
      log( `Failed to fetch guild ${message.guild.id}: ${error}` )
      return null
    }

    let interval
    try {
      interval = parseInt( await backend.getSetting( this.module.settingKeys.timelyInterval, guild.id ), 10 )
      if ( !Number.isInteger( interval ) )
        throw new Error( `Backend#getSetting returned ${interval}` )
    } catch ( error ) {
      log( `Failed to fetch ${this.module.settingKeys.timelyInterval} setting: ${error}` )
      return null
    }
    interval *= 1000  // Working in milliseconds from here

    const redisKey = `latesttimely:${guild.id}:${user.id}`

    let latest
    try {
      latest = await redis.get( redisKey )
      if ( latest === null )
        latest = 0
      else
        latest = parseInt( latest, 10 )
      if ( !Number.isInteger( latest ) )
        throw new Error( `${redisKey} was set to ${latest}` )
    } catch ( error ) {
      log( `Failed to fetch ${redisKey} from Redis: ${error}` )
      return null
    }

    if ( Date.now() < latest + interval )
      return host.talk.sendError( message, ['timely_too_soon', duration( latest + interval - Date.now() )] )

    try {
      await redis.set( redisKey, Date.now() )
    } catch ( error ) {
      log( `Failed to set ${redisKey} in Redis: ${error}` )
      return null
    }

    let currencySymbol
    try {
      currencySymbol = await backend.getSetting( this.module.settingKeys.currencySymbol, guild.id )
    } catch ( error ) {
      log( `Failed to fetch ${this.module.settingKeys.currencySymbol} setting: ${error}` )
    }

    let reward
    try {
      reward = parseInt( await backend.getSetting( this.module.settingKeys.timelyReward, guild.id ), 10 )
      if ( !Number.isInteger( reward ) )
        throw new Error( `Backend#getSetting returned ${reward}` )
    } catch ( error ) {
      log( `Failed to fetch ${this.module.settingKeys.timelyReward} setting: ${error}` )
      return null
    }

    try {
      await user.increment( { currency: reward } )
    } catch ( error ) {
      log( `Failed to give currency to user ${user.id}: ${error}` )
      return null
    }

    const currencyString = currencySymbol ? `${reward} ${currencySymbol}` : reward.toString()
    return host.talk.sendSuccess( message, ['timely_success', currencyString, duration( interval )] )
  }
}


export class CurrencyModule extends ModuleBase
{
  settingKeys = {
    currencyGenerationAmountMax: 'CurrencyGenerationAmountMax',
    currencyGenerationAmountMin: 'CurrencyGenerationAmountMin',
    currencyGenerationChance: 'CurrencyGenerationChance',
    currencyGenerationCode: 'CurrencyGenerationCode',
    currencySymbol: 'CurrencySymbol',
    timelyInterval: 'TimelyInterval',
    timelyReward: 'TimelyReward'
  }

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async onMessage( message: Message ): Promise<void>
  {
    if ( !message.guild || message.author.bot )
      return
    // Should probably disable generation from command messages

    let guild
    try {
      guild = await this.backend.getGuildBySnowflake( message.guild.id )
      if ( !guild )
        throw new Error( `Backend#getGuildBySnowflake returned ${guild}` )
    } catch ( error ) {
      log( `Failed to fetch guild ${message.guild.id}: ${error}` )
      return
    }

    let chance
    try {
      chance = Number( await this.backend.getSetting( this.settingKeys.currencyGenerationChance ) )
      if ( Number.isNaN( chance ) )
        throw new Error( `Backend#getSetting returned ${chance}` )
    } catch ( error ) {
      log( `Failed to fetch ${this.settingKeys.currencyGenerationChance} setting: ${error}` )
      return
    }

    if ( Math.random() > chance )
      return

    let channel
    try {
      channel = await this.backend.getChannelBySnowflake( message.channel.id )
      if ( !channel )
        throw new Error( `Backend#getChannelBySnowflake returned ${channel}` )
    } catch ( error ) {
      log( `Failed to fetch channel ${message.channel.id}: ${error}` )
      return
    }

    const redisKey = `currencygeneration:${channel.id}`
    const redis = this.backend._redis
    try {
      if ( await redis.exists( redisKey ) )
        return
    } catch ( error ) {
      log( `Failed to fetch ${redisKey} from Redis: ${error}` )
      return
    }

    let amountMin
    try {
      amountMin = parseInt( await this.backend.getSetting( this.settingKeys.currencyGenerationAmountMin, guild.id ), 10 )
      if ( !Number.isInteger( amountMin ) || amountMin < 1 )
        throw new Error( `Backend#getSetting returned ${amountMin}` )
    } catch ( error ) {
      log( `Failed to fetch ${this.settingKeys.currencyGenerationAmountMin} setting: ${error}` )
      return
    }

    let amountMax
    try {
      amountMax = parseInt( await this.backend.getSetting( this.settingKeys.currencyGenerationAmountMax, guild.id ), 10 )
      if ( !Number.isInteger( amountMax ) || amountMax < amountMin )
        throw new Error( `Backend#getSetting returned ${amountMax}` )
    } catch ( error ) {
      log( `Failed to fetch ${this.settingKeys.currencyGenerationAmountMax} setting: ${error}` )
      return
    }

    const amount = randomInt( amountMin, amountMax )

    let code = ''
    try {
      if ( JSON.parse( await this.backend.getSetting( this.settingKeys.currencyGenerationCode ) ) )
        code = randomInt( 1000, 9999 ).toString()
    } catch ( error ) {
      log( `Failed to fetch ${this.settingKeys.currencyGenerationCode} setting: ${error}` )
    }

    let pickMessage
    try {
      pickMessage = await this.host.talk.sendText( message,
        `Use code '${code || 'whatever'}' to get your free trial of ${amount} tendies now`
      )
      if ( !( pickMessage instanceof Message ) )
        throw new Error( "fuck" )
    } catch ( error ) {
      log( `Failed to send message to channel ${channel.id}: ${error}` )
      return
    }

    await redis.hset( redisKey, { amount, code, created: Date.now(), messageID: pickMessage.id } )
  }

  getGlobalSettingKeys() {
    return Object.values( this.settingKeys )
  }

  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.client, 'currency', 'Currency', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new AwardCurrencyCommand( this ),
      new ShowCurrencyCommand( this ),
      new SlotCommand( this ),
      new TimelyCommand( this )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}
