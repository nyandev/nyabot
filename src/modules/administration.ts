import * as toml from '@iarna/toml'

import { Message, MessageAttachment, MessageEmbed, TextChannel } from 'discord.js'
import { ArgumentCollectorResult, Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { Arguments, CommandOptions, NyaBaseCommand, NyaCommand, Subcommands } from '../lib/command'

import { apos } from '../globals'
import { Backend } from '../lib/backend'
import { NyaInterface, ModuleBase } from '../modules/module'

const ConfigGlobalGetArgs = [
  { key: 'option', type: 'string' }
] as const

class ConfigGlobalGetCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Get a bot global configuration option value.",
    ownerOnly: true,
    args: ConfigGlobalGetArgs
  }
  async execute( message: CommandoMessage, args: Arguments<typeof ConfigGlobalGetArgs> ): Promise<Message | Message[] | null>
  {
    const host: NyaInterface = this.module.host
    const backend: Backend = this.module.backend

    const key = args.option

    const gkeys: string[] = host.getGlobalSettingKeys()

    if ( !gkeys.includes( key ) )
      return host.respondTo( message, 'config_badkey', gkeys )

    const value = await backend.getGlobalSetting( key )
    return host.respondTo( message, 'config_get', key, value )
  }
}

const ConfigGlobalSetArgs = [
  { key: 'option', type: 'string' },
  { key: 'value', type: 'string' }
] as const

class ConfigGlobalSetCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Set a bot global configuration option.",
    ownerOnly: true,
    args: ConfigGlobalSetArgs
  }
  async execute( message: CommandoMessage, args: Arguments<typeof ConfigGlobalSetArgs> ): Promise<Message | Message[] | null>
  {
    const host: NyaInterface = this.module.host
    const backend: Backend = this.module.backend

    const key = args.option
    let value = args.value

    const gkeys: string[] = host.getGlobalSettingKeys()

    if ( !gkeys.includes( key ) )
      return host.talk.sendError( message, ['config_badkey', host.talk.joinList['en']( gkeys )] )

    await backend.setGlobalSetting( key, value )
    value = await backend.getGlobalSetting( key )

    if ( key === 'Prefix' )
      host.getClient().commandPrefix = value

    return host.talk.sendSuccess( message, ['config_set', key, value] )
  }
}

class ConfigGlobalCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: 'Get or set global bot configuration options.',
    dummy: true
  }
  static subcommands = {
    get: ConfigGlobalGetCommand,
    set: ConfigGlobalSetCommand
  }
}

/*class ConfigServerCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: 'Get or set server bot configuration options.',
    dummy: true
  }
  static subcommands = {
    get: ConfigGlobalGetCommand,
    set: ConfigGlobalSetCommand
  }
}*/

class ConfigCommand extends NyaBaseCommand
{
  constructor( protected module: AdministrationModule )
  {
    super( module,
    {
      name: 'config',
      group: 'admin',
      description: 'Get or set configuration options.',
      dummy: true,
      guildOnly: false,
      subcommands: {
        global: ConfigGlobalCommand
        // server: ConfigServerCommand
      }
    })
  }
}

class DebugCommand extends Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'debug',
      group: 'admin',
      memberName: 'debug',
      description: 'Tests some random shit',
      args: [
      ]
    } )
  }
  async run( message: CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: ArgumentCollectorResult ): Promise<Message | null>
  {
    const user = message.author
    const channel = ( message.channel as TextChannel )
    const embed = new MessageEmbed()
      .setTitle( "This is the title" )
      .setDescription( "This is the description" )
      .setColor( '#d83668' )
      .setFooter( user.tag, user.displayAvatarURL() )

    return channel.send( embed )
  }
}

class WeirdCommand extends Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: '..',
      group: 'admin',
      memberName: '..',
      description: 'Tests some random shit',
    } )
  }
  async run( message: CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: ArgumentCollectorResult ): Promise<Message | null>
  {
    return message.channel.send( "..." )
  }
}

class FailCommand extends Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'fail',
      group: 'admin',
      memberName: 'fail',
      description: 'Tests some random shit',
    } )
  }
  async run( message: CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: ArgumentCollectorResult ): Promise<Message | null>
  {
    throw new Error( "oh no we shouldn't let anyone see this" )
  }
}

interface SendCommandSchema {
  message?: string
  title?: string
  description?: string
  image?: string
  thumbnail?: string
  url?: string
  color?: string | number | [number, number, number]
  timestamp?: Date | number | 'now'
  author?: { name: string; icon?: string; url?: string }
  footer?: { text: string; icon?: string }
  fields?: { name: string; value: string; inline?: boolean }[]
}

class SendCommand extends Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client, {
      name: 'send',
      group: 'admin',
      memberName: 'send',
      description: "Make the bot send an embed.",
      ownerOnly: true
    } )
  }

  async run( message: CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: ArgumentCollectorResult ): Promise<Message | null>
  {
    const match = /^.send\s+```([^]+)```$/u.exec( message.content )

    if ( !match || !match[1] ) {
      console.log( "fug" )
      return null
    }

    try {
      const data = toml.parse( match[1] ) as SendCommandSchema
      const embed = new MessageEmbed()

      const nonempty = /\S/u

      let msg = ''
      if ( typeof data.message === 'string' && nonempty.exec( data.message ) )
        msg = data.message

      if ( typeof data.title === 'string' && nonempty.exec( data.title ) )
        embed.setTitle( data.title )
      if ( typeof data.description === 'string' && nonempty.exec( data.description ) )
        embed.setDescription( data.description )
      if ( typeof data.image === 'string' && nonempty.exec( data.image ) )
        embed.setImage( data.image )
      if ( typeof data.thumbnail === 'string' && nonempty.exec( data.thumbnail ) )
        embed.setThumbnail( data.thumbnail )
      if ( typeof data.url === 'string' && nonempty.exec( data.url ) )
        embed.setURL( data.url )

      if ( Number.isInteger( data.color ) ) {
        if ( data.color >= 0 && data.color <= 0xFFFFFF )
          embed.setColor( data.color )
      } else if ( typeof data.color === 'string' ) {
        const reHex = /^#[0-9A-F]{6}$/iu
        const reName = /^(DEFAULT|WHITE|AQUA|GREEN|BLUE|YELLOW|PURPLE|LUMINOUS_VIVID_PINK|FUCHSIA|GOLD|ORANGE|RED|GREY|NAVY|DARK_AQUA|DARK_GREEN|DARK_BLUE|DARK_PURPLE|DARK_VIVID_PINK|DARK_GOLD|DARK_ORANGE|DARK_RED|DARK_GREY|DARKER_GREY|LIGHT_GREY|DARK_NAVY|BLURPLE|GREYPLE|DARK_BUT_NOT_BLACK|NOT_QUITE_BLACK|RANDOM)$/u
        if ( reHex.exec( data.color ) || reName.exec( data.color ) )
          embed.setColor( data.color )
      } else if ( Array.isArray( data.color ) && data.color.length === 3 ) {
        let validColor = true
        for ( const elem of data.color ) {
          if ( !Number.isInteger( elem ) || elem < 0 || elem > 255 ) {
            validColor = false
            break
          }
        }
        if ( validColor )
          embed.setColor( data.color )
      }

      if ( data.timestamp === 'now' )
        embed.setTimestamp( new Date() )
      else if ( data.timestamp instanceof Date || typeof data.timestamp === 'number' )
        embed.setTimestamp( data.timestamp )

      if ( typeof data.author?.name === 'string'
        && (
          ( typeof data.author.icon === 'string' && nonempty.exec( data.author.icon ) )
          || data.author.icon === undefined
        )
        && (
          ( typeof data.author.url === 'string' && nonempty.exec( data.author.url ) )
          || data.author.url === undefined
        )
      ) {
        embed.setAuthor( data.author.name, data.author.icon, data.author.url )
      }

      if ( typeof data.footer?.text === 'string'
        && nonempty.exec( data.footer.text )
        && (
          ( typeof data.footer.icon === 'string' && nonempty.exec( data.footer.icon ) )
          || data.footer.icon === undefined
        )
      ) {
        embed.setFooter( data.footer.text, data.footer.icon )
      }

      if ( Array.isArray( data.fields ) ) {
        for ( const field of data.fields ) {
          if ( typeof field?.name === 'string' && nonempty.exec( field.name )
            && typeof field.value === 'string' && nonempty.exec( field.value )
            && ['boolean', 'undefined'].includes( typeof field.inline )
          ) {
            embed.addField( field.name, field.value, field.inline ?? false )
          }
        }
      }

      if ( embed.fields.length === 0
        && !embed.author
        && !embed.description
        && !embed.footer
        && !embed.image
        && !embed.thumbnail
        && !embed.title
      ) {
        if ( msg )
          await message.channel.send( msg )
      } else {
        await message.channel.send( msg, embed )
      }
      await message.delete()
    } catch ( error ) {
      console.log( error )
    }

    return null
  }
}

class StatusCommand extends Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'status',
      group: 'admin',
      memberName: 'status',
      description: `Set the bot${apos}s activity.`,
      args: [
        {
          key: 'type',
          prompt: "Type: clear, watching, streaming, or listening",
          type: 'string',
          oneOf: ['clear', 'watching', 'playing', 'listening']
        },
        {
          key: 'thing',
          prompt: "Whatcha doing?",
          type: 'string',
          default: ''
        }
      ]
    } )
  }

  async run( message: CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: ArgumentCollectorResult ): Promise<Message | null>
  {
    const host: any = this._service.host
    if ( args.type === 'clear' )
      host._client.user.setPresence( { activities: [] } )
    else if ( !args.thing )
      return host.respondTo( message, 'status_undefined' )
    else
      host._client.user.setActivity( args.thing, { type: args.type.toUpperCase() } )
    return null
  }
}

export class AdministrationModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: CommandoClient )
  {
    super( id, host, client )
  }

  getGroups(): CommandGroup[]
  {
    return [
      new CommandGroup( this.client, 'admin', 'Administration', false )
    ]
  }

  getCommands(): Command[]
  {
    return [
      ConfigCommand,
      SendCommand,
      StatusCommand,
      DebugCommand,
      FailCommand,
      WeirdCommand
    ].map( command => new command( this ) )
  }

  async onMessage( msg: Message ): Promise<void>
  {
    //
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}
