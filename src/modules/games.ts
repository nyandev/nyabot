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

import { CommandCallbackType, NyaInterface, ModuleBase } from './module'

class EightBallCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: '8ball',
      group: 'games',
      memberName: '8ball',
      description: 'Answers a yes/no question.',
      details: 'Call with a question as an argument.',
      args: [{
        key: 'question',
        prompt: 'Ask the 8-ball a question.',
        type: 'string',
      }],
      argsPromptLimit: 1
    })
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null> | null
  {
    const choices = ['yes', 'no']

    let data = {}
    const index = Math.floor( Math.random() * choices.length )
    if (choices[index] === 'yes')
      data = {
        message: ' ',
        imageURL: 'https://i.pinimg.com/originals/ce/68/ac/ce68ac827852aec0f097e58d930c2032.gif'
      }
    else
      data = {
        message: "That\u2019s no good, Onii-chan!"
      }
    return this._service.getHost().respondTo( message, '8ball', data )
  }
}

export class GamesModule extends ModuleBase
{
  _parser: Parser

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this._parser = new Parser( null )
    host.getBackend().getGlobalSetting( 'Prefix' ).then( ( value: any ) => {
      this._parser.setPrefix( value )
    })
    client.on( 'commandPrefixChange', ( guild: any, prefix: any ) =>
    {
      if ( !guild )
        this._parser.setPrefix( prefix )
    })
  }

  async onMessage( msg: Message ): Promise<void>
  {
    /*
    const parsed = this._parser.parseMessage( msg.content )
    if ( parsed.xp !== false )
    {
      this._backend.userAddXP( msg.author, msg.member, parsed.xp )
    }
    /*
    const cmd = this._parser.parseCommand( parsed )
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
      new Commando.CommandGroup( this.getClient(), 'games', 'Games', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new EightBallCommand( this, this.getClient() )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}