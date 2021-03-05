import { Message, MessageAttachment, MessageEmbed, TextChannel } from 'discord.js'
import { ArgumentCollectorResult, Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { Arguments, CommandOptions, NyaBaseCommand, NyaCommand, Subcommands } from '../lib/command'

import { apos } from '../globals'
import { Backend } from '../lib/backend'
import { NyaInterface, ModuleBase } from '../modules/module'

class ConfigGlobalGetCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Get a bot global configuration option value.",
    ownerOnly: true,
    args: [
      { key: 'option', type: 'string' }
    ]
  }
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const host: NyaInterface = this.module.host
    const backend: Backend = this.module.backend

    const key = ( args.option as string )

    const gkeys: string[] = host.getGlobalSettingKeys()

    if ( !gkeys.includes( key ) )
      return host.respondTo( message, 'config_badkey', gkeys )

    const value = await backend.getGlobalSetting( key )
    return host.respondTo( message, 'config_get', key, value )
  }
}

class ConfigGlobalSetCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Set a bot global configuration option.",
    ownerOnly: true,
    args: [
      { key: 'option', type: 'string' },
      { key: 'value', type: 'string' }
    ]
  }
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const host: NyaInterface = this.module.host
    const backend: Backend = this.module.backend
    
    const key = ( args.option as string )
    let value = ( args.value as string )

    const gkeys: string[] = host.getGlobalSettingKeys()

    if ( !gkeys.includes( key ) )
      return host.respondTo( message, 'config_badkey', gkeys )

    await backend.setGlobalSetting( key, value )
    value = await backend.getGlobalSetting( key )

    if ( key === 'Prefix')
      host.getClient().commandPrefix = value

    return host.respondTo( message, 'config_set', key, value )
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
    set: ConfigGlobalGetCommand
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

class StatusCommand extends Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'status',
      group: 'admin',
      memberName: 'status',
      description: 'Set the bot' + apos + 's activity.',
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
      host._client.user.setActivity()
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
      new ConfigCommand( this ),
      new StatusCommand( this ),
      new DebugCommand( this )
    ]
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
