import { logSprintf } from '../globals'
import * as Commando from 'discord.js-commando'
import { Message, User, GuildMember, TextChannel } from 'discord.js'

import { NyaInterface, ModuleBase } from '../modules/module'

export class LoggingModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async onGuildMemberAdd( member: GuildMember ): Promise<void>
  {
    const channel = await this.client.channels.fetch( "733128656175628327" )
    if ( channel.isText() )
    {
      this.host.talk.sendLogEvent( (channel as TextChannel), 'logging_guild_user_add', [member.user.tag || member.user.id] )
    }
  }

  async onGuildMemberRemove( member: GuildMember ): Promise<void>
  {
    const channel = await this.client.channels.fetch( "733128656175628327" )
    if ( channel.isText() )
    {
      this.host.talk.sendLogEvent( (channel as TextChannel), 'logging_guild_user_remove', [member.user.tag || member.user.id] )
    }
  }

  getGroups(): Commando.CommandGroup[]
  {
    return []
  }

  getCommands(): Commando.Command[]
  {
    return []
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}