import fetch from 'node-fetch'
import * as Commando from 'discord.js-commando'
import { Message, TextChannel } from 'discord.js'
import { sprintf } from 'sprintf-js'

import { debug, log } from '../globals'
import { Arguments, NyaBaseCommand, NyaCommand, parseTextChannel, SubcommandInfo, SubcommandList, SubcommandSpec } from '../lib/command'
import { NyaInterface, ModuleBase } from '../modules/module'


function usersQuery( users: string[] ) {
  return users.map( (username: string) => `from:${username}` ).join(' OR ')
}


class TwitterChannelCommand extends NyaCommand
{
  async run( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    debug( 'args to channel command:', args )
    return message.say( "Usage: !twitter channel list" )
  }
}


class TwitterListCommand extends NyaCommand
{
  async run( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "<list of followed accounts>" )
  }
}


class TwitterChannelDefaultCommand extends NyaCommand
{
  async run( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    if ( args.channel )
      return message.say( `got <#${args.channel.id}>` )
    if ( args.channel === null )
      return message.say( "Couldn't resolve channel" )
    return message.say( "Default channel is ..." )
  }
}


class TwitterChannelDefaultClearCommand extends NyaCommand
{
  async run( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "default twitter channel cleared" )
  }
}


class TwitterChannelListCommand extends NyaCommand
{
  async run( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "<list of channels>" )
  }
}


class TwitterCommand extends NyaBaseCommand
{
  constructor( protected module: Twitter2Module )
  {
    super( module,
    {
      name: 'twitter',
      group: 'tw',
      description: "Base for all Twitter commands.",
      guildOnly: true,
      subcommandSpec: {
        list: {
          class: TwitterListCommand
        },
        channel: {
          class: TwitterChannelCommand,
          options: {
            description: "!twitter channel"
          },
          subcommands: {
            default: {
              class: TwitterChannelDefaultCommand,
              options: {
                description: "!twitter channel default",
                args: [{
                  key: 'channel',
                  optional: true,
                  type: 'text-channel',
                }]
              },
              subcommands: {
                clear: {
                  class: TwitterChannelDefaultClearCommand,
                  options: {
                    description: "!twitter channel default clear"
                  }
                }
              }
            },
            list: {
              class: TwitterChannelListCommand,
              options: {
                description: "!twitter channel list"
              }
            }
          }
        }
      }
    } )
  }

  async runDefault( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
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

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this.config = this.backend._config.twitter
    if ( !this.config.enabled )
      return
  }

  async onMessage( message: Message ): Promise<void>
  {
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
