import { debug, logSprintf } from '../globals'
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
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
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
      ownerOnly: true
    })
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const backend = this._service.getBackend()

    async function awardUser( userID: string, amount: number ) {
      const user = await backend.getUserBySnowflake( userID )
      user.increment( { currency: amount } )
    }

    if ( args.target instanceof Role ) {
      for ( const userID of args.target.members.keys() )
        awardUser( userID, args.amount )
      return this._service.getHost().respondTo( message, 'currency_award_role',
        message.author.username, args.amount, args.target.name )
    } else {
      awardUser( args.target.id, args.amount )
      return this._service.getHost().respondTo( message, 'currency_award_user',
        message.author.username, args.amount, args.target.username )
    }
    return null
  }
}


class ShowCurrencyCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: '$',
      group: 'currency',
      memberName: '$',
      description: "Show available currency.",
      args: [{
        key: 'target',
        prompt: "Who?",
        type: 'user',
        default: ( msg: Commando.CommandoMessage, arg: Commando.Argument ) => msg.author
      }]
    })
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const backend = this._service.getBackend()
    const user = await backend.getUserBySnowflake( args.target.id )
    return this._service.getHost().respondTo( message, 'currency_show', user.name, user.currency )
  }
}


export class CurrencyModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async onMessage( msg: Message ): Promise<void>
  {
  }

  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.getClient(), 'currency', 'Currency', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new AwardCurrencyCommand( this, this.getClient() ),
      new ShowCurrencyCommand( this, this.getClient() )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}