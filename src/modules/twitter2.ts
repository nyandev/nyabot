import fetch from 'node-fetch'
import * as Commando from 'discord.js-commando'
import { CommandoMessage } from 'discord.js-commando'
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
    if ( args.channel ) {
      if ( typeof args.channel === 'string' )
        return message.say( args.channel )
      return message.say( `got <#${args.channel.id}>` )
    }
    if ( args.channel === null )
      return message.say( "Couldn't resolve channel" )
    return message.say( "Default channel is ..." )
  }
}


class TwitterChannelDefaultClearCommand extends NyaCommand
{
  async run( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    console.log(this.options)
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
      group: 'twitter2',
      description: "Show this server\u2019s Twitter account(s).",
      guildOnly: true,
      subcommandSpec: {
        list: {
          class: TwitterListCommand
        },
        channel: {
          class: TwitterChannelCommand,
          options: {
            dummy: true,
            description: "See subcommands."
          },
          subcommands: {
            default: {
              class: TwitterChannelDefaultCommand,
              options: {
                description: "Get or set the default channel for posting tweet notifications.",
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
                    description: "Clear the default channel for posting tweet notifications."
                  }
                }
              }
            },
            list: {
              class: TwitterChannelListCommand,
              options: {
                description: "List channels that tweet notifications are being posted to."
              }
            }
          }
        }
      }
    } )
  }

  async runDefault( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
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
        new Commando.CommandGroup( this.client, 'twitter2', 'Twitter', false )
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
