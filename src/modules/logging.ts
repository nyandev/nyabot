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

  async resolveGuildLogChannel( guild: Guild ): Promise<TextChannel | null>
  {
    // yes obviously all of this should be cached, or better yet, received from events
    const dbGuild = await this.backend.getGuildBySnowflake( guild.id )
    if ( !dbGuild )
      return null
    const logChannelSetting = await this.backend.getGuildSetting( dbGuild.id, "LogChannel" )
    if ( !logChannelSetting )
      return null
    const channel = await this.client.channels.fetch( logChannelSetting.value )
    if ( !( channel instanceof TextChannel ) || channel.guild.id !== guild.id )
      return null
    return channel
  }

  async onGuildMemberAdd( member: GuildMember ): Promise<void>
  {
    const channel = await this.resolveGuildLogChannel( member.guild )
    if ( channel )
    {
      this.host.talk.sendLogEvent( channel, 'logging_guild_user_add', [member.user.tag || member.user.id] )
    }
  }

  async onGuildMemberRemove( member: GuildMember ): Promise<void>
  {
    const channel = await this.resolveGuildLogChannel( member.guild )
    if ( channel )
    {
      this.host.talk.sendLogEvent( channel, 'logging_guild_user_remove', [member.user.tag || member.user.id] )
    }
  }

  async onMessageUpdated( oldMessage: Message, newMessage: Message )
  {
    if ( !newMessage.guild )
      return
    const logChannel = await this.resolveGuildLogChannel( newMessage.guild )
    if ( logChannel )
    {
      const msgChannelName = 'name' in newMessage.channel ? newMessage.channel.name : 'unknown'
      this.host.talk.sendLogEvent( logChannel, 'logging_guild_message_update', [
        newMessage.id, newMessage.author.tag || newMessage.author.id, msgChannelName, oldMessage.cleanContent, newMessage.cleanContent
      ])
    }
  }
 
  async onMessageDeleted( message: Message )
  {
    if ( !message.guild )
      return
    const logChannel = await this.resolveGuildLogChannel( message.guild )
    if ( logChannel )
    {
      const msgChannelName = 'name' in message.channel ? message.channel.name : 'unknown'
      this.host.talk.sendLogEvent( logChannel, 'logging_guild_message_remove', [
        message.id, message.author.tag || message.author.id, msgChannelName, message.cleanContent
      ])
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
    host.getEmitter()
      .on( 'messageUpdated', this.onMessageUpdated.bind( this ) )
      .on( 'messageDeleted', this.onMessageDeleted.bind( this ) )
    return true
  }
}
