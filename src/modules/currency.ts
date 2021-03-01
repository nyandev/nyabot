import * as fs from 'fs'
import * as path from 'path'

import { EventEmitter } from 'events'
import * as Commando from 'discord.js-commando'
import { CommandoMessage } from 'discord.js-commando'
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'
import { format as formatNumber } from 'd3-format'
import * as moment from 'moment'
import * as prettyMs from 'pretty-ms'
import randomInt = require( 'random-int' )
import { sprintf } from 'sprintf-js'

import { debug, log, logSprintf, logThrow, timeout } from '../globals'
import { Backend } from '../lib/backend'
import { Arguments, NyaBaseCommand } from '../lib/command'
import { Parser } from '../lib/parser'
import { Dimensions, Renderer } from '../lib/renderer'

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

    // why the fuck is a type declaration needed here but not elsewhere
    let guild: typeof backend._models.Guild
    let currencySymbol = 'currency'
    try {
      guild = await backend.getGuildBySnowflake( message.guild.id )
      currencySymbol = await backend.getSetting( this._service.settingKeys.currencySymbol, guild.id )
    } catch ( error ) {
      log( `Failed to fetch ${this._service.settingKeys.currencySymbol} setting for guild ${message.guild.id} or globally:`, error )
      return null
    }

    async function awardUser( userID: string, amount: number ) {
      const user = await backend.getUserBySnowflake( userID )
      const guildUser = await backend.getGuildUserByIDs( guild.id, user.id )
      await guildUser.increment( { currency: amount } )
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


class PickCommand extends NyaBaseCommand
{
  constructor( protected module: CurrencyModule )
  {
    super( module,
    {
      name: 'pick',
      group: 'currency',
      description: "Pick up that currency just lying around.",
      guildOnly: true,
      args: [
        { key: 'code', type: 'string', optional: true }
      ]
    } )
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const talk = this.module.host.talk

    const picktime = 5000

    timeout( picktime ).then( () => {
      message.delete().catch( error => {} )
    })

    try {
      return await backend._db.transaction( async t => {
        const channel = await backend.getChannelBySnowflake( message.channel.id )

        const redis = backend._redis
        const redisKey = `currencygeneration:${channel.id}`

        const data = await redis.hgetall( redisKey )
        if ( !data || !data.messageID || !data.amount )
          return null

        if ( data.code && args.code !== data.code ) {
          talk.sendError( message, ['%s', "Wrong code friendo"] ).then( message => {
            timeout( picktime ).then( () => { message.delete() } )
          } )
          return null
        }

        redis.del( redisKey )
        message.channel.messages.fetch( data.messageID ).then(
          origMessage => origMessage.delete().catch( error => { debug( "fuck", error ) } )
        ).catch( error => { debug("fuck", error) } )

        const user = await backend.getUserBySnowflake( message.author.id, t )
        const guildUser = await backend.getGuildUserByIDs( channel.guildID, user.id, t )
        await guildUser.increment( { currency: data.amount }, { transaction: t } )
        const ackMessage = await talk.sendSuccess( message, ['%s', `${user.name} picked ${data.amount} <:nepSmug:730447513647317083>`] )
        timeout( picktime ).then( () => {
          ackMessage.delete()
        } )
        return null
      } )
    } catch ( error ) {
      return talk.unexpectedError( message )
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

    let guildUser
    let currencySymbol = 'currency'
    try {
      const guild = await backend.getGuildBySnowflake( message.guild.id )
      guildUser = await backend.getGuildUserByIDs( guild.id, user.id )
      currencySymbol = await backend.getSetting( this._service.settingKeys.currencySymbol, guild.id )
    } catch ( error ) {
      log( `Failed to fetch ${this._service.settingKeys.currencySymbol} setting for guild ${message.guild.id} or globally:`, error )
    }
    return host.talk.sendText( message, 'currency_show', user.name, guildUser.currency, currencySymbol )
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

    const guild = await backend.getGuildBySnowflake( message.guild.id )
    const user = await backend.getUserBySnowflake( message.author.id )
    const guildUser = await backend.getGuildUserByIDs( guild.id, user.id )

    if ( guildUser.currency < args.amount )
      return host.respondTo( message, 'slot_insufficient_funds' )

    await guildUser.decrement( { currency: args.amount } )

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
      await guildUser.increment( { currency: winAmount } )
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

    let guildUser
    try {
      guildUser = await backend.getGuildUserByIDs( guild.id, user.id )
      if ( !guildUser )
        throw new Error( "no such guilduser" )
    } catch ( error ) {
      log( `Failed to fetch guilduser: ${error}` )
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
      await guildUser.increment( { currency: reward } )
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
  channelSettings = {
    currencyGenerationEnabled: 'CurrencyGenerationEnabled'
  }

  settingKeys = {
    currencyGenerationAmountMax: 'CurrencyGenerationAmountMax',
    currencyGenerationAmountMin: 'CurrencyGenerationAmountMin',
    currencyGenerationChance: 'CurrencyGenerationChance',
    currencyGenerationCode: 'CurrencyGenerationCode',
    currencySymbol: 'CurrencySymbol',
    timelyInterval: 'TimelyInterval',
    timelyReward: 'TimelyReward'
  }

  currencyGenerationImageDimensions = new Dimensions( 796, 632 )
  currencyGenerationImages = ['top-nep.png']
  renderer: Renderer

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )

    const rootPath = this.backend._config.rootPath
    Renderer.registerFont( path.join( rootPath, 'gfx', 'SourceSansPro-Semibold.otf' ), 'SourceSansPro-Semibold' )
  }

  async initialize() {
    const rootPath = this.backend._config.rootPath
    this.renderer = new Renderer( this.currencyGenerationImageDimensions )

    await Promise.all( this.currencyGenerationImages.map(
      img => this.renderer.loadImageLocalCached( path.join( rootPath, 'gfx', 'currency-drops', img ), img )
    ) )
  }

  async onMessage( message: Message ): Promise<void>
  {
    try {
      await this.backend._db.transaction( async t => {
        if ( !message.guild || message.author.bot )
          return
        // TODO: robust isCommand checking
        if ( message.content && ['.', '!', '?'].includes( message.content[0] ) )
          return
        const channel = await this.backend.getChannelBySnowflake( message.channel.id, t )

        const enabled = await this.backend.getChannelSetting( channel.id, this.channelSettings.currencyGenerationEnabled, t )
        if ( enabled !== '1' )
          return

        const redisKey = `currencygeneration:${channel.id}`
        const redis = this.backend._redis
        if ( await redis.exists( redisKey ) )
          return

        const guild = await this.backend.getGuildBySnowflake( message.guild.id, t )
        const chanceString = await this.backend.getSetting( this.settingKeys.currencyGenerationChance, guild.id, t )
        const chance = Number( chanceString )
        if ( Number.isNaN( chance ) || chance < 0 || chance > 1 )
          logThrow( `${this.settingKeys.currencyGenerationChance} must be a number between 0 and 1, not ${chanceString}` )

        if ( Math.random() > chance )
          return

        const amountMinString = await this.backend.getSetting( this.settingKeys.currencyGenerationAmountMin, guild.id, t )
        const amountMin = parseInt( amountMinString, 10 )
        if ( !Number.isSafeInteger( amountMin ) || amountMin < 1 )
          logThrow( `${this.settingKeys.currencyGenerationAmountMin} must be a positive integer, not ${amountMinString}` )

        const amountMaxString = await this.backend.getSetting( this.settingKeys.currencyGenerationAmountMax, guild.id, t )
        const amountMax = parseInt( amountMaxString, 10 )
        if ( !Number.isSafeInteger( amountMax ) || amountMax < amountMin )
          logThrow( `${this.settingKeys.currencyGenerationAmountMax} must be an integer not less than ${this.settingKeys.currencyGenerationAmountMin}, not ${amountMaxString}` )

        const amount = randomInt( amountMin, amountMax )

        let code = ''
        if ( await this.backend.getSetting( this.settingKeys.currencyGenerationCode, guild.id, t ) === '1' )
          code = randomInt( 1000, 9999 ).toString()

        this.renderer.drawCurrencyDrop( 'top-nep.png', code )
        const imgBuffer = await this.renderer.toPNGBuffer()

        const attachment = new MessageAttachment( imgBuffer, 'free-tendies.png' )
        const content = `Oh look, ${amount} <:nepSmug:730447513647317083> appeared! Ain't this your lucky day`
        const pickMessage = await message.channel.send( content, attachment )
        try {
          await redis.hset( redisKey, { amount, code, created: Date.now(), messageID: pickMessage.id } )
        } catch ( error ) {
          log( `Failed to insert ${redisKey} into Redis: ${error}` )
          await pickMessage.delete()
        }
      } )
    } catch ( error ) {
      return
    }
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
      new PickCommand( this ),
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
