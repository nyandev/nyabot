import { debug, log, logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from '../lib/backend'
import { Parser } from '../lib/parser'

import { CommandCallbackType, NyaInterface, ModuleBase } from './module'


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
      return host.respondTo( message, 'slot_win', slotString, winAmount )
    } else {
      return host.respondTo( message, 'slot_no_win', slotString )
    }
  }
}


export class CurrencyModule extends ModuleBase
{
  settingKeys = {
    currencySymbol: 'CurrencySymbol'
  }

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async onMessage( msg: Message ): Promise<void>
  {
  }

  getGlobalSettingKeys() {
    return [
      this.settingKeys.currencySymbol
    ]
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
      new SlotCommand( this )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}
