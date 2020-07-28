import { logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from '../lib/backend'

import { CommandCallbackType, NyaInterface, ModuleInterface } from '../modules/module'

class XPCommand extends Commando.Command
{
  protected _service: ModuleInterface
  constructor( host: ModuleInterface, client: Commando.CommandoClient )
  {
    super( client, {
      name: 'xp',
      aliases: ['exp'],
      group: 'xp',
      memberName: 'xp',
      description: 'Description',
      details: 'Command details',
      examples: ['xp'],
      args: []
    })
    this._service = host
  }
  async run(message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult): Promise<Message | Message[] | null> | null
  {
    const xpstruct = await this._service.getBackend().getUserXP( message.author, message.guild )
    return message.reply( sprintf( 'Global XP %i Server XP %i', xpstruct.globalXP, xpstruct.serverXP ) )
  }
}

export class XPModule implements ModuleInterface
{
  _id: number
  _backend: Backend
  _host: NyaInterface
  getCommands( host: NyaInterface, client: Commando.CommandoClient ): Commando.Command[]
  {
    this._host = host
    this._backend = host.getBackend()
    return [
      new XPCommand( this, client )
    ]
  }
  getBackend(): Backend
  {
    return this._backend
  }
  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    host.registerCommand( 'poop', (): boolean => {
      return false
    })
    return true
  }
}