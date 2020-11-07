import fetch from 'node-fetch'
import * as Commando from 'discord.js-commando'
import { Message, TextChannel } from 'discord.js'
import { sprintf } from 'sprintf-js'

import { debug, log } from '../globals'
import { NyaInterface, ModuleBase } from '../modules/module'


function usersQuery( users: string[] ) {
  return users.map( (username: string) => `from:${username}` ).join(' OR ')
}

interface BaseCommandInfo {
  name: string
  group: string
  description: string
  guildOnly?: boolean
  ownerOnly?: boolean
  subcommands?: SubcommandList
}

interface SubcommandInfo {
  description?: string
  guildOnly?: boolean
  ownerOnly?: boolean
}

interface SubcommandOptions extends SubcommandInfo {
  subcommands?: SubcommandList
}

interface SubcommandList {
  [name: string]: {
    command: NyaCommand
    options?: SubcommandInfo
    subcommands?: SubcommandList
  }
}

interface SubcommandSpec {
  [name: string]: {
    class: new (module: ModuleBase, subcommands?: SubcommandOptions) => NyaCommand
    options?: SubcommandInfo
    subcommands?: SubcommandSpec
  }
}


abstract class NyaBaseCommand extends Commando.Command
{
  protected subcommands: SubcommandList = {}
  constructor( client: Commando.CommandoClient, options: BaseCommandInfo )
  {
    super( client, {...options, memberName: options.name, argsType: 'multiple'} )
    if ( options.subcommands )
      this.subcommands = options.subcommands
  }

  async run(message: Commando.CommandoMessage, args: any[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult<object>): Promise<Message | Message[] | null>
  {
    debug( 'subcommands', this.subcommands )
    debug( 'args to base command:', args )
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) ) {
      return this.subcommands[args[0]].command.run( message, args.slice( 1 ) )
    }
    return this.runDefault( message, args )
  }

  abstract async runDefault( message: Commando.CommandoMessage, args: any[] ): Promise<Message | Message[] | null>
}


abstract class NyaCommand
{
  protected subcommands: SubcommandList

  constructor ( protected module: ModuleBase, protected options: SubcommandOptions = {} )
  {
    this.subcommands = options.subcommands || {}
    delete this.options.subcommands
  }

  async run( message: Commando.CommandoMessage, args: any[] ): Promise<Message | Message[] | null>
  {
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) ) {
      return this.subcommands[args[0]].command.run( message, args.slice( 1 ) )
    }
    return this.runDefault( message, args )
  }

  abstract async runDefault( message: Commando.CommandoMessage, args: any[] ): Promise<Message | Message[] | null>
}


class TwitterChannelCommand extends NyaCommand
{
  async runDefault( message: Commando.CommandoMessage, args: any[] ): Promise<Message | Message[] | null>
  {
    debug( 'args to channel command:', args )

    return message.say( "Usage: !twitter channel list" )
  }
}


class TwitterChannelListCommand extends NyaCommand
{
  async runDefault( message: Commando.CommandoMessage, args: any[] ): Promise<Message | Message[] | null>
  {
    debug( 'args to channel list command:', args )

    return message.say( "<list of channels goes here>" )
  }
}


class TwitterCommand extends NyaBaseCommand
{
  constructor( protected module: Twitter2Module )
  {
    super( module.client,
    {
      name: 'tw',
      group: 'tw',
      description: "Base for all Twitter commands.",
      guildOnly: true,
      subcommands: module.subcommands
    } )
  }

  async runDefault( message: Commando.CommandoMessage, args: any ): Promise<Message | Message[] | null>
  {
    // Run without extra arguments: respond with TwitterDefaultMessage
    return message.say( "TwitterDefaultMessage" )
  }
}


export class Twitter2Module extends ModuleBase
{
  config: any
  settingKeys = {
    channel: 'TwitterChannel',
    channelExceptions: 'TwitterChannelExceptions',
    defaultMessage: 'TwitterDefaultMessage',
    message: 'TwitterMessage',
    subscriptions: 'TwitterSubscriptions'
  }
  subcommandSpec: SubcommandSpec = {
    channel: {
      class: TwitterChannelCommand,
      options: {
        guildOnly: true
      },
      subcommands: {
        list: {
          class: TwitterChannelListCommand
        }
      }
    }
  }
  subcommands: SubcommandList

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this.config = this.backend._config.twitter
    if ( !this.config.enabled )
      return
    this.subcommands = this.buildSubcommands( this.subcommandSpec )
  }

  async onMessage( message: Message ): Promise<void>
  {
  }

  buildSubcommands( data: SubcommandSpec ) {
    const commands: SubcommandList = {}
    for ( const [name, command] of Object.entries( data ) ) {
      const options: SubcommandInfo = {}
      if ( command.options ) {
        options.description = command.options.description
        options.guildOnly = command.options.guildOnly
        options.ownerOnly = command.options.ownerOnly
      }
      const subcommands = this.buildSubcommands( command.subcommands || {} )
      commands[name] = {
        command: new command.class( this, {...options, subcommands} ),
        options,
        subcommands
      }
    }
    return commands
  }

  getGlobalSettingKeys() {
    return [this.settingKeys.defaultMessage, this.settingKeys.message]
  }

  getGroups(): Commando.CommandGroup[]
  {
    if ( this.config.enabled ) {
      return [
        new Commando.CommandGroup( this.client, 'tw', 'tw', false )
      ]
    } else {
      return []
    }
  }

  getCommands(): Commando.Command[]
  {
    if ( this.config.enabled ) {
      return [
        new TwitterCommand( this )
      ]
    } else {
      return []
    }
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}
