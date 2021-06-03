import * as fs from 'fs'
import * as path from 'path'
import { randomInt } from 'crypto'

import { EventEmitter } from 'events'
import * as Commando from 'discord.js-commando'
import { CommandoMessage } from 'discord.js-commando'
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'
import { format as formatNumber } from 'd3-format'
import * as moment from 'moment'
import * as prettyMs from 'pretty-ms'
import { Op } from 'sequelize'
import { sprintf } from 'sprintf-js'

import { debug, log, logSprintf, logThrow, settingBoolean, timeout } from '../globals'
import { Backend } from '../lib/backend'
import { Arguments, NyaBaseCommand } from '../lib/command'
import { Parser } from '../lib/parser'
import { Dimensions, Renderer } from '../lib/renderer'

import { CommandCallbackType, NyaInterface, ModuleBase } from './module'

import * as Models from '../models'

const duration = ( ms: number ) => prettyMs( ms, { secondsDecimalDigits: 0 } )
const formatDecimal = formatNumber( ',~r' )
const defaultCurrency = 'currency'

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

    try {
      return await backend._db.transaction( async t => {
        const guild = await backend.getGuildBySnowflake( message.guild.id, t )
        if ( !guild )
          throw new Error( "no such guild" )
        const currencySymbol = await backend.getSetting( this._service.settingKeys.currencySymbol, guild.id, t ) || defaultCurrency

        async function awardUsers( guildID: number, snowflakes: string[], amount: number )
        {
          const userIDs = new Set()
          for ( const snowflake of snowflakes ) {
            try {
              const user = await backend.getUserBySnowflake( snowflake, t )
              if ( user )
                userIDs.add( user.id )
            } catch ( error ) {
              // meh
            }
          }
          await Models.GuildUser.increment(
            { currency: amount },
            {
              where: {
                guildID: guildID,
                userID: { [Op.in]: [...userIDs] }
              },
              transaction: t
            }
          )
        }
        const formattedAmount = formatDecimal( args.amount )
        if ( args.target instanceof Role ) {
          await awardUsers( guild.id, args.target.members.keys(), args.amount )
          return host.talk.sendSuccess( message, ['currency_award_role', message.author.username, formattedAmount, currencySymbol, args.target.name] )
        } else if ( args.target instanceof User ) {
          await awardUsers( guild.id, [args.target.id], args.amount )
          return host.talk.sendSuccess( message, ['currency_award_user', message.author.username, formattedAmount, currencySymbol, args.target.username] )
        } else {
          logThrow( "The 'target' argument to /award was not of type User or Role" )
        }
      } )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
    }
  }
}


const PickArgs = [
  { key: 'code', type: 'string', optional: true }
] as const
class PickCommand extends NyaBaseCommand
{
  constructor( protected module: CurrencyModule )
  {
    super( module,
    {
      name: 'pick',
      group: 'currency',
      description: "Pick up that sweet currency just lying around.",
      guildOnly: true,
      args: PickArgs
    } )
  }

  async execute( message: CommandoMessage, args: Arguments<typeof PickArgs> ): Promise<Message | Message[] | null>
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
        if ( !channel )
          throw new Error( "no such channel" )

        const redis = backend._redis
        const redisKey = `currencygeneration:${channel.id}`

        const data = await redis.hgetall( redisKey )
        if ( !data || !data.messageID || !data.amount )
          return null

        if ( data.code && args.code !== data.code ) {
          const messageID = args.code ? 'currency_pick_wrong_code' : 'currency_pick_missing_code'
          talk.sendError( message, messageID ).then( message => {
            timeout( picktime ).then( () => { message.delete() } )
          } )
          return null
        }

        redis.del( redisKey )
        message.channel.messages.fetch( data.messageID ).then(
          origMessage => origMessage.delete().catch( error => { debug( "fuck", error ) } )
        ).catch( error => { debug("fuck", error) } )

        const user = await backend.getUserBySnowflake( message.author.id, t )
        if ( !user )
          return null
  
        const guildUser = await backend.getGuildUserByIDs( channel.guildID, user.id, t )
        if ( !guildUser )
          return null

        await guildUser.increment( { currency: parseInt( data.amount ) }, { transaction: t } )
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
    const talk = this._service.host.talk

    try {
      return await backend._db.transaction( async t => {
        const user = await backend.getUserBySnowflake( args.target.id )
        if ( !user )
          throw new Error( "no such user" )
        const guild = await backend.getGuildBySnowflake( message.guild.id )
        if ( !guild )
          throw new Error( "no such guild" )
        const guildUser = await backend.getGuildUserByIDs( guild.id, user.id )
        if ( !guildUser )
          throw new Error( "no such guilduser" )
        const currencySymbol = await backend.getSetting( this._service.settingKeys.currencySymbol, guild.id ) || defaultCurrency
        return talk.sendText( message, 'currency_show', args.target.toString(), formatDecimal( guildUser.currency ), currencySymbol )
      } )
    } catch ( error ) {
      return talk.unexpectedError( message )
    }
  }
}


class CurrencyTopCommand extends NyaBaseCommand
{
  constructor( protected module: CurrencyModule )
  {
    super( module,
    {
      name: 'lb',
      group: 'currency',
      description: "Show who's boss.",
      guildOnly: true
    } )
  }

  async execute( message: CommandoMessage, args: Arguments<[]> ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const talk = this.module.host.talk

    try {
      return await backend._db.transaction( async t => {
        const guild = await backend.getGuildBySnowflake( message.guild.id, t )
        if ( !guild )
          throw new Error( "couldn't find guild" )

        // should join with User here but meh
        const users = await Models.GuildUser.findAll({
          where: {
            guildID: guild.id,
            currency: { [Op.gt]: 0 }
          },
          limit: 10,
          order: [['currency', 'DESC']]
        })

        if ( users.length === 0 )
          return talk.sendText( message, 'currency_top_empty' )

        const fields = []
        for ( const guildUser of users ) {
          const user = await Models.User.findByPk( guildUser.userID, { transaction: t } )
          if ( !user || user.bot )
            continue
          fields.push( { name: guildUser.nickname || user.name, value: formatDecimal( guildUser.currency ) } )
        }

        const embed = new MessageEmbed()
          .setTitle( "Currency leaders" )
          .addFields( fields )
        return message.reply( embed )
      } )
    } catch ( error ) {
      return talk.unexpectedError( message )
    }
  }
}


class SlotCommand extends Commando.Command
{
  constructor( protected _service: CurrencyModule )
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
        min: 1
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

    try {
      return await backend._db.transaction( async t => {
        const guild = await backend.getGuildBySnowflake( message.guild.id, t )
        if ( !guild )
          throw new Error( "no such guild" )

        const currencySymbol = await backend.getSetting( this._service.settingKeys.currencySymbol, guild.id, t ) || defaultCurrency

        const maxBetSetting = await backend.getGuildSetting( guild.id, 'MaxBet', t )
        if ( maxBetSetting ) {
          const maxBet = parseInt( maxBetSetting, 10 )
          if ( !Number.isSafeInteger( maxBet ) || maxBet < 1 )
            throw new Error( `Guild ${guild.id}'s MaxBet setting is not a positive integer` )
          if ( args.amount > maxBet )
            return host.talk.sendError( message, ['gambling_over_max_bet', formatDecimal( maxBet ), currencySymbol] )
        }

        const user = await backend.getUserBySnowflake( message.author.id, t )
        if ( !user )
          throw new Error( "no such user" )

        const guildUser = await backend.getGuildUserByIDs( guild.id, user.id, t )
        if ( !guildUser )
          throw new Error( "no such guilduser" )

        if ( guildUser.currency < args.amount )
          return host.talk.sendError( message, 'gambling_insufficient_funds' )

        const slots = []
        for ( let i = 0; i < 3; i++ )
          slots.push( randomInt( images.length ) )

        const slotImages = slots.map( index => images[index] )

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

        const renderer = this._service.slotsRenderer
        renderer.drawSlots( slotImages, args.amount, winAmount.toString() )
        const attachment = new MessageAttachment( await renderer.toPNGBuffer(), this._service.slotsFilename )

        await guildUser.increment( { currency: winAmount - args.amount }, { transaction: t } )

        if ( winAmount > 0 )
          return message.reply( host.talk.format( ['slot_win', formatDecimal( winAmount ), currencySymbol] ), attachment )
        return message.reply( host.talk.format( 'slot_no_win' ), attachment )
      } )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
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

  async execute( message: CommandoMessage, args: Arguments<[]> ): Promise<Message | Message[] | null>
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
    currencyGenerationEnabledDefault: 'CurrencyGenerationEnabledDefault',
    currencySymbol: 'CurrencySymbol',
    timelyInterval: 'TimelyInterval',
    timelyReward: 'TimelyReward'
  }

  currencyGenerationImageDimensions = new Dimensions( 796, 632 )
  currencyGenerationImages = ['top-nep.png']
  currencyDropRenderer: Renderer

  slotsFilename = 'slots.png'
  slotsImageDimensions = new Dimensions( 553, 552 )
  slotsImages = ['bg.png']
  slotsRenderer: Renderer

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )

    this.slotsImages.push( host._config.globalDefaults.SlotsJoker, ...host._config.globalDefaults.SlotsImages )

    const rootPath = this.backend._config.rootPath
    Renderer.registerFont( path.join( rootPath, 'gfx', 'slots', '7seg.ttf' ), '7seg' )
    Renderer.registerFont( path.join( rootPath, 'gfx', 'SourceSansPro-Semibold.otf' ), 'SourceSansPro-Semibold' )
  }

  async initialize() {
    const rootPath = this.backend._config.rootPath

    this.currencyDropRenderer = new Renderer( this.currencyGenerationImageDimensions )
    await Promise.all( this.currencyGenerationImages.map(
      img => this.currencyDropRenderer.loadImageLocalCached( path.join( rootPath, 'gfx', 'currency-drops', img ), img )
    ) )

    this.slotsRenderer = new Renderer( this.slotsImageDimensions, true )
    await Promise.all( this.slotsImages.map(
      img => this.slotsRenderer.loadImageLocalCached( path.join( rootPath, 'gfx', 'slots', img ), img )
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
        if ( !channel )
          throw new Error( "no such channel" )

        const enabled = await this.backend.getChannelSetting( channel.id, this.channelSettings.currencyGenerationEnabled, t )
        if ( !settingBoolean( enabled ) )
          return

        const redisKey = `currencygeneration:${channel.id}`
        const redis = this.backend._redis
        if ( await redis.exists( redisKey ) )
          return

        const guild = await this.backend.getGuildBySnowflake( message.guild.id, t )
        if ( !guild )
          throw new Error( "no such guild" )

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

        const amount = randomInt( amountMin, amountMax + 1 )

        let code = ''
        if ( settingBoolean( await this.backend.getSetting( this.settingKeys.currencyGenerationCode, guild.id, t ) ) )
          code = randomInt( 1000, 10000 ).toString()

        this.currencyDropRenderer.drawCurrencyDrop( 'top-nep.png', code )
        const imgBuffer = await this.currencyDropRenderer.toPNGBuffer()

        const attachment = new MessageAttachment( imgBuffer, 'free-tendies.png' )
        const codeHelp = code ? ' <numbers>' : ''
        const content = `Oh look, ${amount} <:nepSmug:730447513647317083> appeared! Type \`.pick${codeHelp}\` to pick them up.`
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
      new CurrencyTopCommand( this ),
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
