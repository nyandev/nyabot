import { Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { GuildMember, Message, MessageReaction, User } from 'discord.js'

import { EventEmitter } from 'events'
import { debug } from '../globals'
import { Backend } from '../lib/backend'
import { Parser, ParsedStruct } from '../lib/parser'
import { TalkModule } from '../lib/talk'


export interface CommandCallbackType { (): boolean }

export interface NyaInterface
{
  _config: any
  messages: Record<string, string>
  talk: TalkModule

  getBackend(): Backend
  getClient(): CommandoClient
  getEmitter(): EventEmitter
  respondTo( message: CommandoMessage, messageID: string, ...args: any[] ): Promise<Message | Message[] | null> | null
  getGlobalSettingKeys(): string[]
}

export abstract class ModuleBase
{
  readonly backend: Backend
  readonly settingKeys: Record<string, string>

  constructor(
    protected id: number,
    public readonly host: NyaInterface,
    public readonly client: CommandoClient
  ) {
    this.backend = this.host.getBackend()
  }

/*
  buildSubcommands( baseOptions: any ):
  {
    const subcommands: SubcommandList = {}

    for ( const [name, command] of Object.entries( data ) ) {

      const options: CommandOptions = {
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
*/

  destroy()
  {
  }

  getGlobalSettingKeys(): string[]
  {
    return []
  }

  abstract getGroups(): CommandGroup[]
  abstract getCommands(): Command[]

  async onMessage( msg: Message ): Promise<void>
  {
  }

  async onReactionAdd( reaction: MessageReaction, user: User ): Promise<void>
  {
  }

  async onReactionRemove( reaction: MessageReaction, user: User ): Promise<void>
  {
  }

  async onGuildMemberAdd( member: GuildMember ): Promise<void>
  {
  }

  async onGuildMemberRemove( member: GuildMember ): Promise<void>
  {
  }

  registerStuff( id: number, host: NyaInterface )
  {
    this.id = id
    return true
  }
}
