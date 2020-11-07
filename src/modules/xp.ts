import { logSprintf } from '../globals'
import * as Commando from 'discord.js-commando'
import { Message, User } from 'discord.js'

import { Parser } from '../lib/parser'
import { NyaInterface, ModuleBase } from '../modules/module'


class XPCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'xp',
      aliases: ['exp'],
      group: 'xp',
      memberName: 'xp',
      description: 'Description',
      details: 'Command details',
      examples: ['xp'],
      args: [{
        key: 'target',
        prompt: 'Whose stats should I fetch?',
        type: 'user',
        default: ''
      }],
      argsPromptLimit: 1
    })
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    let target: User = message.author
    if ( args && typeof args === 'object' )
    {
      const struct: any = args
      if ( struct.target && struct.target instanceof User )
        target = struct.target
    }
    const xpstruct = await this._service.backend.getUserXP( target, message.guild )
    return this._service.host.respondTo( message, 'xp', target, xpstruct.globalXP, xpstruct.serverXP )
  }
}

export class XPModule extends ModuleBase
{
  _parser: Parser

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async onMessage( msg: Message ): Promise<void>
  {
    const parsed = Parser.parseMessage( msg.content )
    if ( parsed.xp !== false )
    {
      this.backend.userAddXP( msg.author, msg.member, parsed.xp )
    }
    /*const cmd = this._parser.parseCommand( parsed )
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
      new Commando.CommandGroup( this.client, 'xp', 'XP', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new XPCommand( this, this.client )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}