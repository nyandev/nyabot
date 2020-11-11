import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, PresenceData, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import { SubcommandInfo, SubcommandList, SubcommandSpec } from '../lib/command'
import { Parser, ParsedStruct } from '../lib/parser'
import { Backend } from '../lib/backend'


export interface CommandCallbackType { (): boolean }

export interface NyaInterface
{
  _config: any
  getBackend(): Backend
  getClient(): Commando.CommandoClient
  respondTo( message: Commando.CommandoMessage, replycode: string, ...args: any[] ): Promise<Message | Message[] | null> | null
  getGlobalSettingKeys(): string[]
}


export abstract class ModuleBase
{
  readonly backend: Backend

  constructor(
    protected id: number,
    public readonly host: NyaInterface,
    public readonly client: Commando.CommandoClient
  )
  {
    this.backend = this.host.getBackend()
  }

  buildSubcommands( baseName: string, data: SubcommandSpec ) {
    const commands: SubcommandList = {}
    for ( const [name, command] of Object.entries( data ) ) {
      const options: SubcommandInfo = {
        name: `${baseName} ${name}`
      }
      if ( command.options ) {
        options.args = command.options.args
        options.description = command.options.description
        options.guildOnly = command.options.guildOnly
        options.ownerOnly = command.options.ownerOnly
      }
      const subcommands = this.buildSubcommands(
        options.name as string, command.subcommands || {} )
      commands[name] = {
        command: new command.class( this, {...options, subcommands} ),
        options,
        subcommands
      }
    }
    return commands
  }

  destroy()
  {
  }

  getGlobalSettingKeys(): string[]
  {
    return []
  }

  abstract getGroups(): Commando.CommandGroup[]
  abstract getCommands(): Commando.Command[]
  abstract registerStuff( id: number, host: NyaInterface ): boolean
  abstract onMessage( msg: Message ): Promise<void>
}