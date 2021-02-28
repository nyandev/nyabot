import { Message, MessageAttachment } from 'discord.js'
import { ArgumentCollectorResult, Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'

import { apos } from '../globals'
import { Backend } from '../lib/backend'
import { NyaInterface, ModuleBase } from '../modules/module'
import { Renderer, Point, Dimensions } from '../lib/renderer'

class ConfigCommand extends Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'config',
      aliases: ['botconfedit', 'botconfig', 'bce'],
      group: 'admin',
      memberName: 'config',
      description: 'Description',
      details: 'Command details',
      examples: ['config global MessageEditableDuration', 'config global MessageEditableDuration 10'],
      args: [{
        key: 'scope',
        prompt: 'Configuration scope, global or server?',
        type: 'string',
        oneOf: ['global', 'server']
      }, {
        key: 'key',
        prompt: 'Which configuration value to change?',
        type: 'string'
      }, {
        key: 'value',
        prompt: 'Value to set, or nothing to get current value',
        type: 'string',
        default: 'get'
      }],
      argsPromptLimit: 0
    })
  }

  async run( message: CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const argstruct: any = args
    const host: NyaInterface = this._service.host
    if ( argstruct.scope === 'global' )
    {
      const gkeys: string[] = host.getGlobalSettingKeys()

      if ( !gkeys.includes( argstruct.key ) )
        return host.respondTo( message, 'config_badkey', gkeys )
      if ( argstruct.value === 'get' )
      {
        const value = await this._service.backend.getGlobalSetting( argstruct.key )
        return host.respondTo( message, 'config_get', argstruct.key, value )
      }
      else
      {
        await this._service.backend.setGlobalSetting( argstruct.key, argstruct.value )
        const value = await this._service.backend.getGlobalSetting( argstruct.key )
        if ( argstruct.key === 'Prefix')
          this.client.commandPrefix = value
        return host.respondTo( message, 'config_set', argstruct.key, value )
      }
    }
    else if ( argstruct.scope === 'server' )
    {
      console.log(args)
    }
    return message.reply( 'boop' )
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

class ImageTestCommand extends Command
{
  public _renderer: Renderer

  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'imagetest',
      group: 'admin',
      memberName: 'imagetest',
      description: 'Test image output',
      args: []
    } )
    this._renderer = new Renderer([680, 420])
  }

  async run( message: CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: ArgumentCollectorResult ): Promise<Message | null>
  {
    const profile = {
      name: message.author.tag,
      color: '#00daee',
      club: 'Gamindustri'
    }

    const avatarURL = message.author.displayAvatarURL({ format: 'png', dynamic: false, size: 128 })
    const avatar = await this._renderer.loadImage( avatarURL )

    if ( !this._renderer.hasImage( 'bg' ) )
      await this._renderer.loadImageLocalCached( '/rep/nyabot/gfx/nyabot-profile_bg-v1.png', 'bg' )

    this._renderer.drawImage( [0, 0], [680, 420], 'bg' )
    this._renderer.drawAvatar( [14,10], 86, avatar, 'rgb(0,0,0)', 4, profile.color )
    this._renderer.drawAvatar( [593,61], 66, avatar, 'rgb(0,0,0)', 4, profile.color )

    this._renderer.drawText( [106,53], 'sfhypo', 27, 'left', 'rgb(255,255,255)', profile.name )
    this._renderer.drawText( [587,91], 'sfhypo', 27, 'right', 'rgb(255,255,255)', profile.club  )

    const pngbuf = await this._renderer.toPNGBuffer()
    const attachment = new MessageAttachment( pngbuf, 'profile.png' )
    message.channel.send( attachment )
    return null
  }
}

export class AdministrationModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: CommandoClient )
  {
    super( id, host, client )
    Renderer.registerFont( '/rep/nyabot/gfx/geomgraphic_bold.otf', 'geomgraph' )
    Renderer.registerFont( '/rep/nyabot/gfx/sfhypocrisy_medium.otf', 'sfhypo' )
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
      new ImageTestCommand( this )
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
