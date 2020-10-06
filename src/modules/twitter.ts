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

class TwitterChannelCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterchannel',
      group: 'twitter',
      memberName: 'twitterchannel',
      description: 'Set a channel for posting tweets.',
      args: [{
        key: 'target',
        prompt: "Which channel?",
        type: 'channel'
      }],
      argsPromptLimit: 1
    })
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    console.log("!twitterchannel", message, args)
    // TODO: set TwitterChannel setting for this guild
    // TODO: check channel is writable
    return this._service.getHost().respondTo( message, 'twitterchannel_set' )
  }
}

export class TwitterModule extends ModuleBase
{
  _parser: Parser

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async onMessage( msg: Message ): Promise<void>
  {
  }

  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.getClient(), 'twitter', 'Twitter', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new TwitterChannelCommand( this, this.getClient() )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}