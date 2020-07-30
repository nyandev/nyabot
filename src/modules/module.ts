import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, PresenceData, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import { Parser, ParsedStruct } from '../lib/parser'
import { Backend } from '../lib/backend'

export interface CommandCallbackType { (): boolean }

export interface NyaInterface
{
  getBackend(): Backend
  respondTo( message: Commando.CommandoMessage, replycode: string, ...args: any[] ): Promise<Message | Message[] | null> | null
  getGlobalSettingKeys(): string[]
}

export abstract class ModuleBase
{
  _id: number
  _host: NyaInterface
  _backend: Backend
  _client: Commando.CommandoClient

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    this._id = id
    this._host = host
    this._backend = this._host.getBackend()
    this._client = client
  }

  getID(): number
  {
    return this._id
  }

  getHost(): NyaInterface
  {
    return this._host
  }

  getBackend(): Backend
  {
    return this._backend
  }

  getClient(): Commando.CommandoClient
  {
    return this._client
  }

  abstract getGroups(): Commando.CommandGroup[]
  abstract getCommands(): Commando.Command[]
  abstract registerStuff( id: number, host: NyaInterface ): boolean
  abstract onMessage( msg: Message ): Promise<void>
}