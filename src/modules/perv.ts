import { debug, logSprintf } from '../globals'

import fs = require( 'fs' )
import { EventEmitter } from 'events'

import fetch from 'node-fetch'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from '../lib/backend'
import { Parser } from '../lib/parser'

import { CommandCallbackType, NyaInterface, ModuleBase } from './module'


class SankakuCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient, cmdName: string, protected tags: string )
  {
    super( client,
    {
      name: cmdName,
      group: 'perv',
      memberName: cmdName,
      description: `Post ${cmdName}.`,
    })
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    if ( message.channel instanceof TextChannel && !message.channel.nsfw ) {
      message.channel.send( "Whoops! Can\u2019t post this on a Christian channel!" )
      return null
    }

    const threshold = 4
    const url = `https://capi-v2.sankakucomplex.com/posts?default_threshold=${threshold}&limit=1&tags=-video%20order:random%20${encodeURIComponent(this.tags)}`
    let data
    try {
      data = await fetch(url, {
        headers: {
          'User-Agent': 'NyaBot/0.1.0',
        }
      }).then( (response: any) => response.json() )
    } catch (e) {
      return this._service.getHost().respondTo( message, 'link_fail' )
    }
    if ( !data || !data.length || !data[0].file_url )
      return null

    const link = `https://chan.sankakucomplex.com/post/show/${data[0].id}`
    const buffer = await fetch( data[0].sample_url ).then( response => response.buffer() )
    return this._service.getHost().respondTo( message, 'link', {
      text: link,
      imageBuffer: buffer
    } )
  }
}


export class PervModule extends ModuleBase
{
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
      new Commando.CommandGroup( this.getClient(), 'perv', 'Perv', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new SankakuCommand( this, this.getClient(), 'boobs', 'nipples' ),
      new SankakuCommand( this, this.getClient(), 'butts', 'ass' ),
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}