import { logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from '../lib/backend'

import { CommandCallbackType, NyaInterface, ModuleBase } from '../modules/module'

class XPCommand extends Commando.Command
{
  protected _service: ModuleBase
  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client, {
      name: 'xp',
      aliases: ['exp'],
      group: 'xp',
      memberName: 'xp',
      description: 'Description',
      details: 'Command details',
      examples: ['xp'],
      args: [{
        key: 'target',
        prompt: 'Whose stats should I fetch?',
        type: 'user',
        default: ''
      }],
      argsPromptLimit: 1
    })
    this._service = service
  }
  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null> | null
  {
    let target: User = message.author
    if ( args && typeof args === 'object' )
    {
      const struct: any = args
      if ( struct.target && struct.target instanceof User )
        target = struct.target
    }
    const xpstruct = await this._service.getBackend().getUserXP( target, message.guild )
    return this._service.getHost().respondTo( message, 'xp', target, xpstruct.globalXP, xpstruct.serverXP )
  }
}

export class XPModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }
  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.getClient(), 'xp', 'XP', false )
    ]
  }
  getCommands(): Commando.Command[]
  {
    return [
      new XPCommand( this, this.getClient() )
    ]
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