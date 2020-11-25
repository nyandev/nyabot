import { Message } from 'discord.js'
import { ArgumentCollectorResult, Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'

import { apos } from '../globals'
import { Backend } from '../lib/backend'
import { NyaInterface, ModuleBase } from '../modules/module'


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

class StatusCommand extends Command {
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
      new StatusCommand( this )
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
