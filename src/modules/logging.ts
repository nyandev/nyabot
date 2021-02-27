import { logSprintf } from '../globals'
import * as Commando from 'discord.js-commando'
import { Message, User, Guild, GuildMember, TextChannel } from 'discord.js'

import { NyaInterface, ModuleBase } from '../modules/module'

export class LoggingModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async resolveGuildLogChannel( guild: Guild ): Promise<any>
  {
    // yes obviously all of this should be cached, or better yet, received from events
    const dbGuild = await this.backend.getGuildBySnowflake( guild.id )
    if ( !dbGuild )
      return null
    const logChannelSetting = await this.backend.getGuildSetting( dbGuild.id, "LogChannel" )
    if ( !logChannelSetting )
      return null
    const channel = await this.client.channels.fetch( logChannelSetting.value )
    return channel;
  }

  async onGuildMemberAdd( member: GuildMember ): Promise<void>
  {
    const channel = await this.resolveGuildLogChannel( member.guild )
    if ( channel && channel.isText() )
    {
      this.host.talk.sendLogEvent( (channel as TextChannel), 'logging_guild_user_add', [member.user.tag || member.user.id] )
    }
  }

  async onGuildMemberRemove( member: GuildMember ): Promise<void>
  {
    const channel = await this.resolveGuildLogChannel( member.guild )
    if ( channel && channel.isText() )
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