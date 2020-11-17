import fetch from 'node-fetch'
import { Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
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
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "This command should be used through its subcommands." )
  }
}


class TwitterListCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "<list of followed accounts>" )
  }
}


class TwitterChannelDefaultCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const namedArgs = args[0]
    if ( namedArgs.channel ) {
      if ( typeof namedArgs.channel === 'string' )
        return message.say( namedArgs.channel )
      return message.say( `got <#${namedArgs.channel.id}>` )
    }
    if ( namedArgs.channel === null )
      return message.say( "Couldn't resolve channel" )
    return message.say( "Default channel is ..." )
  }
}


class TwitterChannelDefaultClearCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "default twitter channel cleared" )
  }
}


class TwitterChannelGetCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( `Twitter notifications for @${args[0].account} are being posted to...` )
  }
}


class TwitterChannelListCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "<list of channels>" )
  }
}


class TwitterChannelSetCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const namedArgs = args[0]
    if ( typeof namedArgs.channel === 'string' )
      return message.say( namedArgs.channel )
    return message.say( `Setting Twitter channel with arguments:\n\`${JSON.stringify(namedArgs)}\`` )
  }
}


class TwitterCommand extends NyaBaseCommand
{
  constructor( public module: Twitter2Module )
  {
    super( module,
    {
      name: 'twitter',
      group: 'twitter2',
      description: "Shows this server\u2019s Twitter account(s).",
      guildOnly: true,
      subcommandSpec: {
        list: {
          class: TwitterListCommand,
          options: {
            description: "Lists all Twitter accounts followed on this server."
          }
        },
        channel: {
          class: TwitterChannelCommand,
          options: {
            dummy: true,
            description: "Shows or modifies the channels used for Twitter notifications."
          },
          subcommands: {
            default: {
              class: TwitterChannelDefaultCommand,
              options: {
                description: "Shows or modifies the default channel for Twitter notifications.",
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
                    description: "Clears the default channel for Twitter notifications."
                  }
                }
              }
            },
            get: {
              class: TwitterChannelGetCommand,
              options: {
                description: "Shows which channel a Twitter account\u2019s notifications are being posted to.",
                args: [{
                  key: 'account',
                  type: 'string'
                }]
              }
            },
            list: {
              class: TwitterChannelListCommand,
              options: {
                description: "Lists channels that Twitter notifications are being posted to."
              }
            },
            set: {
              class: TwitterChannelSetCommand,
              options: {
                description: "Sets a channel for posting notifications from a particular Twitter user.",
                args: [
                  {
                    key: 'account',
                    type: 'string'
                  },
                  {
                    key: 'channel',
                    type: 'text-channel'
                  }
                ]
              }
            }
          }
        }
      }
    } )
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    let setting
    try {
      const guild = await backend.getGuildBySnowflake( message.guild.id )
      setting = await this.module.backend.getSetting(
        this.module.settingKeys.defaultMessage, guild.id )
      if ( setting == null )
        throw new Error( `getSetting(...) == null` )
    } catch ( error ) {
      log( `Couldn't fetch ${this.module.settingKeys.defaultMessage} setting, globally or for guild ${message.guild.id}:`, error )
      return null
    }

    // An empty string is fine, but we can't send that
    if ( !setting )
      return null
    return message.say( setting )
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

  constructor( id: number, host: NyaInterface, client: CommandoClient )
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

  getGroups(): CommandGroup[]
  {
    if ( this.config.enabled ) {
      return [
        new CommandGroup( this.client, 'twitter2', 'Twitter', false )
      ]
    } else {
      return []
    }
  }

  getCommands(): Command[]
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
