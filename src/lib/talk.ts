import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, PresenceData, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Nya } from './nya'

// This class should contain practically all chat output and formatting for the bot.
// That way changing, reformatting or maybe even translating later is easier.
export class TalkModule
{
  _parent: Nya

  constructor( parent: Nya )
  {
    this._parent = parent
  }

  async sendXPResponse( message: Commando.CommandoMessage, target: User, global: number, server: number ): Promise<Message | Message[] | null> | null
  {
    const embed = new MessageEmbed()
      .setTitle( 'Experience' )
      .setDescription( sprintf( 'XP Stats for **%s**', target.tag ) )
      .addField( 'Global', global, true )
      .addField( 'Server', server, true )
    return message.embed( embed )
  }

  async sendPrintfResponse( message: Commando.CommandoMessage, print: string, ...args: any[] ): Promise<Message | Message[] | null> | null
  {
    const embed = new MessageEmbed()
      .setDescription( sprintf.apply( this, [print].concat( args ) ) )
    return message.embed( embed )
  }

  async sendPlainResponse( message: Commando.CommandoMessage, data: any ): Promise<Message | Message[] | null> | null
  {
    const embed = new MessageEmbed()
    if ( !data.print )
      data.print = ''
    if ( !data.args )
      data.args = []
    embed.setDescription( sprintf.apply( this, [data.print].concat( data.args ) ) || '' )
    if ( data.imageURL )
      embed.setImage( data.imageURL )
    return message.embed( embed )
  }
}