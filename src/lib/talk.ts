import { ColorResolvable, Message, MessageAttachment, MessageEmbed, User } from 'discord.js'
import { CommandoMessage } from 'discord.js-commando'
import * as moment from 'moment'
import { sprintf } from 'sprintf-js'

import { log } from '../globals'
import { Nya } from './nya'


interface EmbedData {
  title?: string | PrintfParams
  description?: string | PrintfParams
  color?: ColorResolvable
  fields?: FieldData[]
  url?: string
  imageURL?: string
}

interface FieldData {
  name: string | PrintfParams
  value: string | PrintfParams
  inline?: boolean
}

interface PrintfParams {
  messageID: string
  args?: string[]
}


// This class should contain practically all chat output and formatting for the bot.
// That way changing, reformatting or maybe even translating later is easier.
export class TalkModule
{
  constructor( private host: Nya )
  {
  }

  format( data: string | PrintfParams )
  {
    const messageID = ( typeof data === 'string' ) ? data : data.messageID
    const template = this.getTemplate( messageID )
    const args = ( typeof data === 'string' ) ? [] : ( data.args || [] )
    return sprintf( template, ...args )
  }

  getTemplate( messageID: string )
  {
    const template = this.host.messages[messageID]
    if ( !template ) {
      log( `Unknown message ID "${messageID}"` )
      return messageID
    }
    return template
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
    de: this.joinListFactory( 'und' ),
    en: this.joinListFactory( 'and' ),
    fi: this.joinListFactory( 'ja' ),
    sv: this.joinListFactory( 'och' )
  }

  async sendEmbed( message: CommandoMessage, data: EmbedData ): Promise<Message | Message[] | null>
  {
    const embed = new MessageEmbed()

    if ( data.title )
      embed.setTitle( this.format( data.title ) )
    if ( data.description )
      embed.setDescription( this.format( data.description ) )
    if ( data.color )
      embed.setColor( data.color )
    if ( data.fields ) {
      for ( const field of data.fields )
        embed.addField( this.format( field.name ), this.format( field.value ), field.inline )
    }
    if ( data.url )
      embed.setURL( data.url )
    if ( data.imageURL )
      embed.setImage( data.imageURL )

    return message.embed( embed )
  }

  async sendError( message: CommandoMessage, data: string | PrintfParams )
  {
    return this.sendEmbed( message, {
      description: data,
      color: 'RED'
    } )
  }

  async sendMultilineResponse( message: CommandoMessage, lines: PrintfParams[] ): Promise<Message | Message[] | null>
  {
    const formattedLines = []
    for ( const line of lines ) {
      if ( !line.args )
        line.args = []
      const template = this.getTemplate( line.messageID )
      formattedLines.push( sprintf( template, ...line.args ) )
    }

    const embed = new MessageEmbed().setDescription( formattedLines.join( '\n' ) )
    return message.embed( embed )
  }

  async sendText( message: CommandoMessage, messageID: string, ...args: string[] )
  {
    return this.sendEmbed( message, {
      description: { messageID, args }
    } )
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

  async sendPrintfResponse( message: CommandoMessage, template: string, ...args: string[] ): Promise<Message | Message[] | null>
  {
    const embed = new MessageEmbed().setDescription( sprintf( template, ...args ) )
    return message.embed( embed )
  }

/*
  async sendPlainResponse( message: CommandoMessage, data: EmbedData ): Promise<Message | Message[] | null>
  {
    const embed = new MessageEmbed()

    let template = ''
    if ( data.messageID ) {
      template = this.host.messages[data.template] || data.messageID
      if ( !template ) {
        log( `Missing message ID ${data.messageID}` )
        template = data.messageID
      }
    }
    if ( !data.args )
      data.args = []
    embed.setDescription( sprintf( template, ...data.args ) )
    if ( data.imageURL )
      embed.setImage( data.imageURL )
    return message.embed( embed )
  }
*/

  async sendAttachmentResponse( message: CommandoMessage, data: Record<string, any> )
  {
    const attachment = new MessageAttachment( data.imageBuffer )
    const sent = await message.channel.send( data.text, attachment )
    sent.suppressEmbeds()
    return sent
  }
}
