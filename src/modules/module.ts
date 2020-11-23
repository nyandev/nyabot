import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, PresenceData, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import { Backend } from '../lib/backend'
import { SubcommandInfo, SubcommandList, SubcommandSpec } from '../lib/command'
import { Parser, ParsedStruct } from '../lib/parser'
import { TalkModule } from '../lib/talk'


export interface CommandCallbackType { (): boolean }

export interface NyaInterface
{
  _config: any
  messages: Record<string, string>
  _talk: TalkModule

  getBackend(): Backend
  getClient(): Commando.CommandoClient
  respondTo( message: Commando.CommandoMessage, replycode: string, ...args: any[] ): Promise<Message | Message[] | null> | null
  getGlobalSettingKeys(): string[]
}


export abstract class ModuleBase
{
  readonly backend: Backend
  readonly settingKeys: Record<string, string>

  constructor(
    protected id: number,
    public readonly host: NyaInterface,
    public readonly client: Commando.CommandoClient
  )
  {
    this.backend = this.host.getBackend()
  }

  buildSubcommands( baseName: string, data: SubcommandSpec ): SubcommandList
  {
    const commands: SubcommandList = {}
    for ( const [name, command] of Object.entries( data ) ) {
      const options: SubcommandInfo = {
        name: `${baseName} ${name}`
      }
      if ( command.options ) {
        options.args = command.options.args
        options.description = command.options.description
        options.dummy = command.options.dummy
        options.guildOnly = command.options.guildOnly
        options.ownerOnly = command.options.ownerOnly
      }
      const subcommands = this.buildSubcommands(
        options.name as string, command.subcommands || {} )
      if ( options.dummy && !Object.keys( subcommands ).length )
        throw new Error( `Dummy command "${options.name}" must have at least one subcommand specified.` )
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
