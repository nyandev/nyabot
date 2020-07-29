import { logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from '../lib/backend'
import { Parser } from '../lib/parser'

import { CommandCallbackType, NyaInterface, ModuleBase } from '../modules/module'

class XPCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'xp',
      aliases: ['exp'],
      group: 'xp',
      memberName: 'xp',
      description: 'Description',
      details: 'Command details',
      examples: ['xp'],
      args: [{
        key: 'target',
        prompt: 'Whose stats should I fetch?',
        type: 'user',
        default: ''
      }],
      argsPromptLimit: 1
    })
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null> | null
  {
    let target: User = message.author
    if ( args && typeof args === 'object' )
    {
      const struct: any = args
      if ( struct.target && struct.target instanceof User )
        target = struct.target
    }
    const xpstruct = await this._service.getBackend().getUserXP( target, message.guild )
    return this._service.getHost().respondTo( message, 'xp', target, xpstruct.globalXP, xpstruct.serverXP )
  }
}

export class XPModule extends ModuleBase
{
  _parser: Parser

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this._parser = new Parser( host.getPrefix() )
    client.on( 'commandPrefixChange', ( guild: any, prefix: any ) =>
    {
      if ( !guild )
        this._parser.setPrefix( prefix )
    })
  }

  async onMessage( msg: Message ): Promise<void>
  {
		const parsed = this._parser.parseMessage( msg.content )
		if ( parsed.xp !== false )
		{
			this._backend.userAddXP( msg.author, msg.member, parsed.xp )
		}
		/*const cmd = this._parser.parseCommand( parsed )
		if ( cmd )
		{
			logSprintf( 'debug', 'Looks like a command: %s (%i args)', cmd.command, cmd.args.length )
			if ( cmd.command === 'test' && msg.author )
			{
				const embed = this.buildEmbedWelcome( message.author )
				message.channel.send( embed )
				const guild = await this._backend.getGuildBySnowflake( message.guild.id )
				if ( guild )
				{
					//this._backend.setGuildSetting( guild.id, 'testsetting', 'cool value bro!' )
					//this._backend.setGuildSetting( guild.id, 'poop', 'yeehaw' )
					let ftch = await this._backend.getGuildSettings( guild.id )
					console.log( ftch )
				}
			}
		}*/
  }

  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.getClient(), 'xp', 'XP', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new XPCommand( this, this.getClient() )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    host.registerCommand( 'poop', (): boolean => {
      return false
    })
    return true
  }
}