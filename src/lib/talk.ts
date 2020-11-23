import { CommandoMessage } from 'discord.js-commando'
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, PresenceData, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Nya } from './nya'


interface MultilineParams {
  replycode: string
  args?: string[]
}

// This class should contain practically all chat output and formatting for the bot.
// That way changing, reformatting or maybe even translating later is easier.
export class TalkModule
{
  constructor( private host: Nya )
  {
  }

  joinListFactory( and: string )
  {
    return ( strings: string[], oxfordComma = false ) => {
      const parts = []
      const commaSeparated = strings.slice( 0, -2 ).join( ', ' )
      const andSeparator = oxfordComma ? `, ${and} ` : ` ${and} `
      const andSeparated = strings.slice( -2 ).join( andSeparator )
      if ( commaSeparated )
        parts.push( commaSeparated )
      parts.push( andSeparated )
      return parts.join( ', ' )
    }
  }

  joinList = {
    en: this.joinListFactory( 'and' ),
    fi: this.joinListFactory( 'ja' )
  }

  async sendMultilineResponse( message: CommandoMessage, lines: MultilineParams[] )
  {
    const formattedLines = []
    for ( const line of lines ) {
      if ( !line.args )
        line.args = []
      const template = this.host.messages[line.replycode] || line.replycode
      formattedLines.push( sprintf( template, ...line.args ) )
    }

    const embed = new MessageEmbed().setDescription( formattedLines.join( '\n' ) )
    return message.embed( embed )
  }

  async sendXPResponse( message: CommandoMessage, target: User, global: number, server: number ): Promise<Message | Message[] | null>
  {
    const embed = new MessageEmbed()
      .setTitle( 'Experience' )
      .setDescription( sprintf( 'XP Stats for **%s**', target.tag ) )
      .addField( 'Global', global, true )
      .addField( 'Server', server, true )
    return message.embed( embed )
  }

  async sendPrintfResponse( message: CommandoMessage, print: string, ...args: any[] ): Promise<Message | Message[] | null>
  {
    const embed = new MessageEmbed()
      .setDescription( sprintf.apply( this, [print].concat( args ) ) )
    return message.embed( embed )
  }

  async sendPlainResponse( message: CommandoMessage, data: any ): Promise<Message | Message[] | null>
  {
    const embed = new MessageEmbed()

    let template = ''
    if ( data.template )
      template = this.host.messages[data.template] || data.template
    if ( !data.args )
      data.args = []
    embed.setDescription( sprintf( template, ...data.args ) )
    if ( data.imageURL )
      embed.setImage( data.imageURL )
    return message.embed( embed )
  }

  async sendAttachmentResponse( message: CommandoMessage, data: Record<string, any> )
  {
    const attachment = new MessageAttachment( data.imageBuffer )
    const sent = await message.channel.send( data.text, attachment )
    sent.suppressEmbeds()
    return sent
  }
}
