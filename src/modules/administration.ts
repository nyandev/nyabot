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

class ConfigCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'config',
      aliases: ['botconfedit', 'botconfig', 'bce'],
      group: 'admin',
      memberName: 'config',
      description: 'Description',
      details: 'Command details',
      examples: ['config global get MessageEditableDuration', 'config global set MessageEditableDuration 10'],
      args: [{
        key: 'scope',
        prompt: 'Configuration scope, global or server?',
        type: 'string',
        oneOf: ['global', 'server']
      }, {
        key: 'key',
        prompt: 'Which configuration value to change?',
        type: 'string'
      }, {
        key: 'value',
        prompt: 'Value to set, or nothing to get current value',
        type: 'string',
        default: 'get'
      }],
      argsPromptLimit: 0
    })
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null> | null
  {
    const argstruct: any = args
    const host: NyaInterface = this._service.getHost()
    if ( argstruct.scope === 'global' )
    {
      const gkeys: string[] = host.getGlobalSettingKeys()
      if ( !gkeys.includes( argstruct.key ) )
        return host.respondTo( message, 'config_badkey', gkeys )
      if ( argstruct.value === 'get' )
      {
        const value = await this._service.getBackend().getGlobalSetting( argstruct.key )
        return host.respondTo( message, 'config_get', argstruct.key, value )
      }
      else
      {
        await this._service.getBackend().setGlobalSetting( argstruct.key, argstruct.value )
        const value = await this._service.getBackend().getGlobalSetting( argstruct.key )
        return host.respondTo( message, 'config_set', argstruct.key, value )
      }
    }
    console.log( args )
    return message.reply( 'boop' )
  }
}

export class AdministrationModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.getClient(), 'admin', 'Administration', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new ConfigCommand( this, this.getClient() )
    ]
  }

  async onMessage( msg: Message ): Promise<void>
  {
    //
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}