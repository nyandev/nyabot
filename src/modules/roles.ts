import { CommandoClient } from 'discord.js-commando'
import { MessageReaction, Snowflake, TextChannel, User } from 'discord.js'
import { QueryTypes } from 'sequelize'

import { debug, log } from '../globals'
import { NyaInterface, ModuleBase } from './module'


interface RoleReactionsSetting {
  [messageID: string]: {
    channel: Snowflake,
    reactions: Array<{ [emojiID: string]: Snowflake }>
  }
}


interface RoleReactionsRow {
  role: Snowflake
  channel: Snowflake
  guild: Snowflake
  message: Snowflake
  emoji: Snowflake
}


export class RolesModule extends ModuleBase
{
  settingKeys = {
    roleReactions: 'RoleReactions'
  }
  tables = {
    roleReactions: 'RoleReactions'
  }
  timeouts = {
    guildMembersFetch: 10000
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
    return []
  }

  getGroups()
  {
    return []
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

  async initialize(): Promise<void>
  {
    try {
      await this.backend._db.query( `CREATE TABLE IF NOT EXISTS ${this.tables.roleReactions} (
        role VARCHAR(30),
        guild VARCHAR(30),
        channel VARCHAR(30) NOT NULL,
        message VARCHAR(30) NOT NULL,
        emoji VARCHAR(30) NOT NULL,
        PRIMARY KEY (role, guild))`
      )
    } catch ( error ) {
      log( `Couldn't create table ${this.tables.roleReactions}:`, error )
      return
    }

    let rows
    try {
      rows = await this.backend._db.query(
        `SELECT role, guild, channel, message, emoji FROM ${this.tables.roleReactions}`,
        { type: QueryTypes.SELECT }
      ) as RoleReactionsRow[]
    } catch ( error ) {
      log( `Couldn't fetch data from ${this.tables.roleReactions} table`, error )
      return
    }

    for ( const row of rows ) {
      let guild
      try {
        guild = await this.client.guilds.fetch( row.guild )
      } catch ( error ) {
        log( `Couldn't fetch guild ${row.guild}:`, error )
        continue
      }

      const channel = guild.channels.resolve( row.channel )
      if ( !channel ) {
        log( `Couldn't resolve channel ${row.channel} in guild ${guild.id}` )
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
      try {
        await guild.members.fetch()
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

      for ( const user of reactedUsers.values() ) {
        if ( this.client.user && this.client.user.id === user.id )
          continue
        try {
          const guildMember = await guild.members.fetch( user )
          await guildMember.roles.add( role )
        } catch ( error ) {
          log( `Couldn't add role ${role.id} to user ${user.id} in guild ${guild.id}:`, error )
          continue
        }
      }
      debug(role.members)
      for ( const user of role.members.values() ) {
        if ( !reactedUsers.has( user.id ) )
          user.roles.remove( role )
      }
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
      if ( !guildMember )
        throw new Error( `Guild#member returned ${guildMember}` )
      await guildMember.roles.remove( role )
    } catch ( error ) {
      log( `Couldn't remove role ${role} from user ${user.id} in guild ${reaction.message.guild.id}:`, error )
    }
  }
}
