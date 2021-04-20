import { logSprintf } from '../globals'
import * as Commando from 'discord.js-commando'
import { Channel, Guild, GuildChannel, GuildMember, Message, TextChannel, User } from 'discord.js'

import { errorSprintf, settingBoolean } from '../globals'
import { NyaInterface, ModuleBase } from '../modules/module'


export class LoggingModule extends ModuleBase
{
  channelSettings = {
    loggingEnabled: 'LoggingEnabled'
  }

  settingKeys = {
    loggingEnabledDefault: 'LoggingEnabledDefault'
  }

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async loggingEnabledForChannel( dsChannel: Channel ): Promise<boolean>
  {
    if ( !( dsChannel instanceof GuildChannel ) )
      return false

    try {
      return await this.backend._db.transaction( async t => {
        const channel = await this.backend.getChannelBySnowflake( dsChannel.id, t )
        if ( channel ) {
          const channelSetting = settingBoolean( await this.backend.getChannelSetting( channel.id, this.channelSettings.loggingEnabled, t ) )
          if ( channelSetting != null )
            return channelSetting
        }

        let guildID
        const guild = await this.backend.getGuildBySnowflake( dsChannel.guild.id, t )
        if ( guild )
          guildID = guild.id
        const guildOrGlobalSetting = settingBoolean( await this.backend.getSetting( this.settingKeys.loggingEnabledDefault, guildID, t ) )
        if ( guildOrGlobalSetting != null )
          return guildOrGlobalSetting
        throw new Error( "no setting of any kind found. that's kinda weird." )
      } )
    } catch ( error ) {
      return this.host._config.globalDefaults.LoggingEnabledDefault
    }
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
    const channel = await this.client.channels.fetch( logChannelSetting )
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
    if ( !newMessage.guild
         || !await this.loggingEnabledForChannel( newMessage.channel )
         || oldMessage.cleanContent === newMessage.cleanContent )
      return
    const logChannel = await this.resolveGuildLogChannel( newMessage.guild )
    if ( !logChannel )
      return
    const msgChannelName = ( newMessage.channel as GuildChannel ).name
    try {
      await this.host.talk.sendLogEvent( logChannel, 'logging_guild_message_update', [
        newMessage.id,
        newMessage.author.tag || newMessage.author.id,
        msgChannelName,
        oldMessage.cleanContent,
        newMessage.cleanContent
      ])
    } catch ( error ) {
      errorSprintf( error )
    }
  }
 
  async onMessageDeleted( message: Message )
  {
    if ( !message.guild || !await this.loggingEnabledForChannel( message.channel ) )
      return

    const logChannel = await this.resolveGuildLogChannel( message.guild )
    if ( !logChannel )
      return

    const msgChannelName = ( message.channel as GuildChannel ).name
    try {
      await this.host.talk.sendLogEvent( logChannel, 'logging_guild_message_remove', [
        message.id, message.author.tag || message.author.id, msgChannelName, message.cleanContent
      ])
    } catch ( error ) {
      errorSprintf( error )
    }
  }

  getGlobalSettingKeys()
  {
    return Object.values( this.settingKeys )
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
