import { CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { DiscordAPIError, GuildMember, Message, MessageReaction, Role, Snowflake, TextChannel, User, Constants } from 'discord.js'
import { QueryTypes } from 'sequelize'

import { debug, log, logSprintf, timeout, promiseSerial } from '../globals'
import { Arguments, CommandOptions, NyaBaseCommand, NyaCommand } from '../lib/command'
import { NyaInterface, ModuleBase } from './module'


interface RoleReactionsRow {
  role: Snowflake
  channel: Snowflake
  guild: Snowflake
  message: Snowflake
  emoji: Snowflake
}


class RoleAutoClearCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Clear the auto-assigned role."
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const host = this.module.host

    let dbGuild
    try {
      dbGuild = await backend.getGuildByMessage( message )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
    }

    try {
      await backend.removeGuildSetting( dbGuild.id, this.module.settingKeys.autoAssignedRole )
    } catch ( error ) {
      log( `Couldn't remove ${this.module.settingKeys.autoAssignedRole} setting for guild ${dbGuild.id}:`, error )
      return host.talk.unexpectedError( message )
    }
    return host.talk.sendText( message, 'role_auto_clear' )
  }
}


class RoleAutoSetCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Set the auto-assigned role.",
    args: [
      { key: 'role', type: 'role' }
    ]
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const host = this.module.host

    if ( typeof args.role === 'string' )
      return host.talk.sendError( message, args.role )
    if ( !( args.role instanceof Role ) )
      return host.talk.sendError( message, 'role_not_found_by_name' )

    let dbGuild
    try {
      dbGuild = await backend.getGuildByMessage( message )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
    }

    try {
      await backend.setGuildSetting( dbGuild.id, this.module.settingKeys.autoAssignedRole, args.role.id )
    } catch ( error ) {
      log( `Couldn't set ${this.module.settingKeys.autoAssignedRole} setting for guild ${dbGuild.id} to ${args.role.id}:`, error )
      return host.talk.unexpectedError( message )
    }
    return host.talk.sendText( message, 'role_auto_set', args.role.toString() )
  }
}


class RoleAutoCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Show the auto-assigned role."
  }
  static subcommands = {
    clear: RoleAutoClearCommand,
    set: RoleAutoSetCommand
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const host = this.module.host

    let dbGuild
    try {
      dbGuild = await backend.getGuildByMessage( message )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
    }

    let roleID
    try {
      const setting = await backend.getGuildSetting( dbGuild.id, this.module.settingKeys.autoAssignedRole )
      if ( !setting || !setting.value )
        return host.talk.sendText( message, 'role_auto_unset' )
      roleID = setting.value
    } catch ( error ) {
      log( `Couldn't fetch ${this.module.settingKeys.autoAssignedRole} setting for guild ${dbGuild.id}:`, error )
      return host.talk.unexpectedError( message )
    }

    let role
    try {
      role = await message.guild.roles.fetch( roleID )
      if ( !role )
        throw new Error( `RoleManager#fetch returned ${role} (deleted role?)` )
    } catch ( error ) {
      log( `Couldn't fetch role ${roleID} in guild ${dbGuild.id}:`, error )
      return host.talk.unexpectedError( message )
    }

    return host.talk.sendText( message, 'role_auto', role.toString() )
  }
}


class RoleCommand extends NyaBaseCommand
{
  constructor( protected module: RolesModule )
  {
    super( module,
    {
      name: 'role',
      group: 'roles',
      description: "Manage auto-assigned and self-assigned roles.",
      dummy: true,
      guildOnly: true,
      ownerOnly: true,
      subcommands: {
        auto: RoleAutoCommand
      }
    } )
  }
}


export class RolesModule extends ModuleBase
{
  settingKeys = {
    autoAssignedRole: 'AutoAssignedRole'
  }

  constructor( id: number, host: NyaInterface, client: CommandoClient )
  {
    super( id, host, client )

    this.initialize().catch( error => {
      log( `Couldn't initialize ${this.constructor.name}:`, error )
    } )
  }

  getCommands()
  {
    return [
      new RoleCommand( this )
    ]
  }

  getGroups()
  {
    return [
      new CommandGroup( this.client, 'roles', 'Roles', false )
    ]
  }

  async getRole( reaction: MessageReaction ): Promise<string | null>
  {
    if ( !reaction.message.guild )
      return null

    let rows
    try {
      rows = await this.backend._db.query(
        'SELECT role FROM RoleReactions WHERE guild = :guild AND message = :message AND emoji = :emoji',
        {
          replacements: {
            guild: reaction.message.guild.id,
            message: reaction.message.id,
            emoji: reaction.emoji.identifier
          },
          type: QueryTypes.SELECT
        }
      ) as Array<{ role: string }>
    } catch ( error ) {
      log( `Couldn't fetch role from RoleReactions table:`, error )
      return null
    }

    if ( rows.length === 0 )
      return null
    if ( rows.length > 1 )
      log( `Attaching multiple roles to one reaction is unsupported: message ${reaction.message.id}, emoji {reaction.emoji.identifier}` )
    return rows[0].role
  }

  async runRolesSync( rows: any[] ): Promise<void>
  {
    await timeout( 4000 )

    for ( const row of rows )
    {
      await timeout( 1000 )

      logSprintf( "roles", "Handling reaction roles for emote %s on channel %s", row.emoji, row.channel )

      let guild
      try {
        guild = await this.client.guilds.fetch( row.guild )
      } catch ( error ) {
        log( `Couldn't fetch guild ${row.guild}:`, error )
        continue
      }

      let channel
      try {
        channel = await this.client.channels.fetch( row.channel )
        if ( !channel )
          throw new Error( `ChannelManager#fetch returned ${channel}` )
      } catch ( error ) {
        log( `Couldn't fetch channel ${row.channel}:`, error )
        continue
      }

      if ( channel.type !== 'text' ) {
        log( `Channel ${channel.id} is not a text channel` )
        continue
      }

      let message
      try {
        message = await ( channel as TextChannel ).messages.fetch( row.message )
      } catch ( error ) {
        log( `Couldn't fetch message ${row.message} in channel ${channel.id}` )
        continue
      }

      let reaction
      try {
        reaction = await message.react( row.emoji )
      } catch ( error ) {
        log( `Couldn't react to message ${message.id} with emoji ${row.emoji}:`, error )
        continue 
      }

      let role
      try {
        role = await guild.roles.fetch( row.role )
        if ( !role )
          throw new Error( `RoleManager#fetch returned ${role}` )
      } catch ( error ) {
        log( `Couldn't fetch role ${row.role} of guild ${guild.id}:`, error )
        continue
      }

      // Fetch guild members into cache, so that Role#members will include them
      let guildMembers
      try {
        guildMembers = await guild.members.fetch()
      } catch ( error ) {
        log( `Couldn't fetch members of guild ${guild.id}:`, error )
      }

      if ( reaction.count && reaction.count > 100 )
        log( "Warning: At most 100 users can be fetched for a given role reaction." )

      let reactedUsers
      try {
        // TODO: Fucking Discord API won't return more than 100 users at once.
        //       Either partition the fetches by user ID or forfeit the idea of syncing roles on startup.
        reactedUsers = await reaction.users.fetch()
      } catch ( error ) {
        log( `Couldn't fetch users who reacted to message ${message.id} with emoji ${row.emoji}:`, error )
        continue
      }

      for ( const user of reactedUsers.values() )
      {
        if ( this.client.user && this.client.user.id === user.id )
          continue
        try {
          const guildMember = await guild.members.fetch( user )
          if ( !guildMember || guildMember.deleted )
            continue
          if ( !guildMember.roles.cache.has( role.id ) )
            await guildMember.roles.add( role )
        } catch ( err ) {
          const error: DiscordAPIError = err
          if ( error.code && error.code === Constants.APIErrors.UNKNOWN_MEMBER )
          {
            log( `Trying to remove reaction from deleted user ${user.id}.` )
            reaction.users.remove( user.id )
          } else
            log( `Couldn't add role ${role.id} to user ${user.id} in guild ${guild.id}:`, error )
            continue
        }
      }

      for ( const user of role.members.values() )
      {
        if ( !user.deleted && !reactedUsers.has( user.id ) )
          user.roles.remove( role )
      }
    }

    logSprintf( "roles", "Reaction roles sync done" )
  }

  async initialize(): Promise<void>
  {
    try {
      await this.backend._db.query( `CREATE TABLE IF NOT EXISTS RoleReactions (
        role VARCHAR(30),
        guild VARCHAR(30),
        channel VARCHAR(30) NOT NULL,
        message VARCHAR(30) NOT NULL,
        emoji VARCHAR(30) NOT NULL,
        PRIMARY KEY (role, guild))`
      )
    } catch ( error ) {
      log( `Couldn't create RoleReactions table:`, error )
      return
    }

    let rows
    try {
      rows = await this.backend._db.query(
        `SELECT role, guild, channel, message, emoji FROM RoleReactions`,
        { type: QueryTypes.SELECT }
      ) as RoleReactionsRow[]
    } catch ( error ) {
      log( `Couldn't fetch data from RoleReactions table`, error )
      return
    }
    
    // Leave this running without waiting, we don't want to hold up the initialization
    this.runRolesSync( rows )
  }

  async onGuildMemberAdd( member: GuildMember ): Promise<void>
  {
    let dbGuild
    try {
      dbGuild = await this.backend.getGuildBySnowflake( member.guild.id )
      if ( !dbGuild )
        throw new Error( `Backend#getGuildBySnowflake returned ${dbGuild}` )
    } catch ( error ) {
      log( `Couldn't fetch guild ${member.guild.id}:`, error )
      return
    }

    let roleID
    try {
      const setting = await this.backend.getGuildSetting( dbGuild.id, this.settingKeys.autoAssignedRole )
      if ( !setting || !setting.value )
        return
      roleID = setting.value
    } catch ( error ) {
      log( `Couldn't fetch ${this.settingKeys.autoAssignedRole} setting for guild ${dbGuild.id}:`, error )
      return
    }

    try {
      await member.roles.add( roleID )
    } catch ( error ) {
      log( `Couldn't auto-assign role ${roleID} to user ${member.id}:`, error )
    }
  }

  async onReactionAdd( reaction: MessageReaction, user: User ): Promise<void>
  {
    if ( !reaction.message.guild )
      return

    if ( this.client.user && user.id === this.client.user.id )
      return

    let role
    try {
      role = await this.getRole( reaction )
    } catch ( error ) {
      log( `Couldn't fetch role for emoji ${reaction.emoji.identifier} in message ${reaction.message.id}:`, error )
      return
    }
    if ( !role )
      return

    try {
      const guildMember = await reaction.message.guild.members.fetch( user )
      if ( !guildMember )
        throw new Error( "Couldn't fetch guild member" )
      await guildMember.roles.add( role )
    } catch ( error ) {
      log( `Couldn't add role ${role} for user ${user.id} in guild ${reaction.message.guild.id}:`, error )
    }
  }

  async onReactionRemove( reaction: MessageReaction, user: User ): Promise<void>
  {
    if ( !reaction.message.guild )
      return

    let role
    try {
      role = await this.getRole( reaction )
    } catch ( error ) {
      log( `Couldn't fetch role for emoji ${reaction.emoji.identifier} in message ${reaction.message.id}:`, error )
      return
    }
    if ( !role )
      return

    try {
      const guildMember = await reaction.message.guild.members.fetch( user )
      if ( !guildMember || guildMember.deleted )
        return
      await guildMember.roles.remove( role )
    } catch ( error ) {
      log( `Couldn't remove role ${role} from user ${user.id} in guild ${reaction.message.guild.id}:`, error )
    }
  }
}
