import fetch from 'node-fetch'
import * as Commando from 'discord.js-commando'
import { Message, TextChannel } from 'discord.js'
import { sprintf } from 'sprintf-js'

import { debug, log } from '../globals'
import { NyaBaseCommand, NyaCommand, SubcommandInfo, SubcommandList, SubcommandSpec } from '../lib/command'
import { NyaInterface, ModuleBase } from '../modules/module'


function usersQuery( users: string[] ) {
  return users.map( (username: string) => `from:${username}` ).join(' OR ')
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
      subcommands: module.twitterSubcommands
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
  twitterSubcommandSpec: SubcommandSpec = {
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
  twitterSubcommands: SubcommandList

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this.config = this.backend._config.twitter
    if ( !this.config.enabled )
      return
    this.twitterSubcommands = this.buildSubcommands( this.twitterSubcommandSpec )
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
