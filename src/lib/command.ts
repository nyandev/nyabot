import * as Commando from 'discord.js-commando'
import { Message } from 'discord.js'

import { ModuleBase } from '../modules/module'


export interface SubcommandInfo {
  description?: string
  guildOnly?: boolean
  ownerOnly?: boolean
}

export interface SubcommandList {
  [name: string]: {
    command: NyaCommand
    options?: SubcommandInfo
    subcommands?: SubcommandList
  }
}

export interface SubcommandOptions extends SubcommandInfo {
  subcommands?: SubcommandList
}

export interface SubcommandSpec {
  [name: string]: {
    class: new (module: ModuleBase, subcommands?: SubcommandOptions) => NyaCommand
    options?: SubcommandInfo
    subcommands?: SubcommandSpec
  }
}

interface BaseCommandInfo {
  name: string
  group: string
  description: string
  guildOnly?: boolean
  ownerOnly?: boolean
  subcommands?: SubcommandList
}


export abstract class NyaBaseCommand extends Commando.Command
{
  protected subcommands: SubcommandList = {}

  constructor( client: Commando.CommandoClient, options: BaseCommandInfo )
  {
    super( client, {...options, memberName: options.name, argsType: 'multiple'} )
    if ( options.subcommands )
      this.subcommands = options.subcommands
  }

  async run( message: Commando.CommandoMessage, args: string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult<object>): Promise<Message | Message[] | null>
  {
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) )
      return this.subcommands[args[0]].command.run( message, args.slice( 1 ) )
    return this.runDefault( message, args )
  }

  abstract async runDefault( message: Commando.CommandoMessage, args: string[] ): Promise<Message | Message[] | null>
}


export abstract class NyaCommand
{
  protected subcommands: SubcommandList = {}

  constructor( protected module: ModuleBase, protected options: SubcommandOptions = {} )
  {
    if ( options.subcommands )
      this.subcommands = options.subcommands
    delete this.options.subcommands
  }

  async run( message: Commando.CommandoMessage, args: string[] ): Promise<Message | Message[] | null>
  {
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) )
      return this.subcommands[args[0]].command.run( message, args.slice( 1 ) )
    return this.runDefault( message, args )
  }

  abstract async runDefault( message: Commando.CommandoMessage, args: string[] ): Promise<Message | Message[] | null>
}