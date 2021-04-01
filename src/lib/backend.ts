import * as moment from 'moment'
import * as path from 'path'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { datetimeNow, debug, logSprintf, errorSprintf } from '../globals'
import { DataType, DataTypes, Model, Sequelize, SyncOptions, Transaction } from 'sequelize'
import { Redis } from './redis'
import { CommandoClient, CommandoMessage } from 'discord.js-commando'
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import { log } from '../globals'

import * as Formulas from './formulas'

import * as Models from '../models'

interface UserXP {
  globalXP?: number,
  serverXP?: number
}

const xpUpdateMinDelta = 10 // 10 seconds between xp updates to mariadb (from redis)

export class Backend
{
  _config: any
  _db: Sequelize
  _redis: Redis
  _settingCache = new Map()

  constructor( config: any )
  {
    this._config = {
      rootPath: path.join( __dirname, '../..' ),
      twitch: config.twitch,
      twitter: config.twitter,
      db: config.db
    }

    this._redis = new Redis( config.redis )

    this._db = new Sequelize( config.db.name, config.db.user, config.db.passwd,
    {
      host: config.db.host,
      port: config.db.port,
      dialect: 'mariadb',
      dialectOptions: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        supportBigNumbers: true,
        bigNumberStrings: true,
        timezone: 'Etc/UTC'
      },
      define: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        freezeTableName: true,
        timestamps: false
      },
      timezone: 'Etc/UTC',
      logging: config.db.debug ? msg => {
        logSprintf( 'db', 'Sequelize: %s', msg )
      } : false
    })

    Models.initialize( this._db )
  }

  async getChannelSetting( channel: number, settingKey: string, transaction?: Transaction )
  {
    const where = { channelID: channel, key: settingKey }
    try {
      const result = await Models.ChannelSetting.findOne( { where, transaction } )
      return result ? result.value : null
    } catch ( error ) {
      errorSprintf( error, "Backend#getChannelSetting(%s, %s) failed", channel, settingKey )
      throw error
    }
  }

  async setChannelSetting( channel: number, settingKey: string, settingValue: string, transaction?: Transaction )
  {
    const values = {
      channelID: channel,
      key: settingKey,
      value: settingValue,
      lastChanged: datetimeNow()
    }
    try {
      await Models.ChannelSetting.upsert( values, { transaction } )
    } catch ( error ) {
      errorSprintf( error, "Backend#setChannelSetting(%s, %s, %s) failed", channel, settingKey, settingValue )
      throw error
    }
  }

  async getAllGuildsSettings( settingKey: string )
  {
    const cond = { key: settingKey }
    return Models.GuildSetting.findAll({ where: cond })
  }

  async getGuildSettings( guild: number | null )
  {
    const cond = { guildID: guild }
    return Models.GuildSetting.findAll({ where: cond })
  }

  async getGuildSetting( guildID: number, settingKey: string, transaction?: Transaction )
  {
    const where = { guildID, key: settingKey }
    try {
      const setting = await Models.GuildSetting.findOne({ where, transaction })
      return setting ? setting.value : null
    } catch ( error ) {
      errorSprintf( error, "Backend#getGuildSetting(%s, %s) failed", guildID, settingKey )
      throw error
    }
  }

  async setGuildSetting( guildID: number, settingKey: string, settingValue: string, transaction?: Transaction )
  {
    const cond = { guildID, key: settingKey }
    const vals = {
      guildID,
      key: settingKey,
      value: settingValue,
      lastChanged: datetimeNow()
    }
    return Models.GuildSetting.findOne({ where: cond, transaction })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return Models.GuildSetting.create( vals, { transaction } )
      })
  }

  async removeGuildSetting( guild: number | null, settingKey: string )
  {
    const cond = { guildID: guild, key: settingKey }
    return Models.GuildSetting.destroy({ where: cond })
  }

  async clearGuildSettings( guild: number | null )
  {
    const cond = { guildID: guild }
    return Models.GuildSetting.destroy({ where: cond })
  }

  async getGlobalSettingSetDefault( settingKey: string, defaultValue: any ): Promise<any>
  {
    const value = this._settingCache.get( settingKey )
    if ( value !== undefined )
      return value
    const cond: any = { guildID: null, key: settingKey }
    const row = await Models.GuildSetting.findOne({ where: cond })
    if ( row )
    {
      this._settingCache.set( settingKey, row.value )
      return row.value
    }
    else
    {
      const vals: any = {
        guildID: null,
        key: settingKey,
        value: defaultValue,
        lastChanged: datetimeNow()
      }
      await Models.GuildSetting.create( vals )
      this._settingCache.set( settingKey, defaultValue )
    }
    return defaultValue
  }

  async getGlobalSetting( settingKey: string, transaction?: Transaction ): Promise<any>
  {
    const value = this._settingCache.get( settingKey )
    if ( value !== undefined )
      return value
    const where = { guildID: null, key: settingKey }
    const row = await Models.GuildSetting.findOne({ where, transaction })
    if ( row )
    {
      this._settingCache.set( settingKey, row.value )
      return row.value
    }
    return undefined
  }
  
  async initGlobalSettings( config: any, keys: string[] ): Promise<boolean>
  {
    if ( typeof config !== 'object' )
      return false

    for ( let i = 0; i < keys.length; ++i )
    {
      if ( !( keys[i] in config ) )
      {
        logSprintf( 'fatal', 'Configuration defaults are missing key "%s"', keys[i] )
        return false
      }
      const defval = config[keys[i]]
      const value = await this.getGlobalSettingSetDefault( keys[i], defval )
      logSprintf( 'core', 'Global setting "%s" is %s', keys[i], value )
    }
    return true
  }

  async setGlobalSetting( settingKey: string, settingValue: any )
  {
    const cond: any = { guildID: null, key: settingKey }
    const vals: any = {
      guildID: null,
      key: settingKey,
      value: settingValue,
      lastChanged: datetimeNow()
    }
    this._settingCache.set( settingKey, settingValue )
    return Models.GuildSetting.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return Models.GuildSetting.create( vals )
      })
  }

  /*  Returns a setting primarily from guild settings, if it it set there,
   *  and secondarily from global settings.
   */
  async getSetting( settingKey: string, guild?: number | null, transaction?: Transaction )
  {
    let guildSetting
    if ( guild != null )
      guildSetting = await this.getGuildSetting( guild, settingKey, transaction )
    if ( guildSetting !== null )
      return guildSetting
    return await this.getGlobalSetting( settingKey, transaction )
  }

  async upsertUser( user: any )
  {
    const created = ( user.createdTimestamp > 0 ? moment( user.createdTimestamp, 'x' ).format( 'YYYY-MM-DD HH:mm:ss.SSSSSS' ) : null )
    let cond = { snowflake: user.id }
    let vals = {
      snowflake: user.id,
      name: user.username ? user.username : null,
      discriminator: user.discriminator ? user.discriminator : null,
      avatar: user.avatar ? user.avatar : '',
      bot: user.bot,
      created: created,
      updated: datetimeNow()
    }
    return Models.User.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return Models.User.create( vals )
      })
  }

  async ensureOwners( owners: string[] ): Promise<string[]>
  {
    const cond = { snowflake: owners }
    await Models.User.update(
      { access: 'owner' },
      { where: cond }
    )
    const rows = await Models.User.findAll({ where: { access: 'owner' } })
    rows.forEach( ( row: any ) => {
      if ( row && row.snowflake && !owners.includes( row.snowflake ) )
        owners.push( row.snowflake )
    })
    return owners
  }

  async getChannelByID( id: number )
  {
    const cond = { id }
    return Models.Channel.findOne( { where: cond } )
  }

  async getChannelBySnowflake( snowflake: string, transaction?: Transaction )
  {
    const where = { snowflake }
    try {
      return await Models.Channel.findOne( { where, transaction } )
    } catch ( error ) {
      errorSprintf( error, "Backend#getChannelBySnowflake(%s) failed", snowflake )
      throw error
    }
  }

  async getGuildByID( id: number )
  {
    const cond = { id }
    return Models.Guild.findOne( { where: cond } )
  }

  async getGuildBySnowflake( snowflake: string, transaction?: Transaction )
  {
    const where = { snowflake }
    try {
      return await Models.Guild.findOne( { where, transaction } )
    } catch ( error ) {
      errorSprintf( error, "Backend#getGuildBySnowflake(%s) failed", snowflake )
      throw error
    }
  }

  async getGuildByMessage( message: CommandoMessage )
  {
    let dbGuild
    try {
      dbGuild = await this.getGuildBySnowflake( message.guild.id )
      if ( !dbGuild )
        throw new Error( `Backend#getGuildBySnowflake returned ${dbGuild}` )
    } catch ( error ) {
      log( `Couldn't fetch guild ${message.guild.id}:`, error )
      throw error
    }
    return dbGuild
  }

  async getSnowflakeByGuildID( id: number )
  {
    let cond = { id }
    const guild = await Models.Guild.findOne({ where: cond })
    return ( guild ? guild.snowflake : undefined )
  }

  async getUserBySnowflake( snowflake: string, transaction?: Transaction ): Promise<Models.User | null>
  {
    const where = { snowflake }
    try {
      return await Models.User.findOne({ where, transaction })
    } catch ( error ) {
      errorSprintf( "Backend#getUserBySnowflake(%s) failed", snowflake )
      throw error
    }
  }

  async getGuildUserByIDs( guildID: number, userID: number, transaction?: Transaction )
  {
    const where = { guildID, userID }
    try {
      return await Models.GuildUser.findOne({ where, transaction })
    } catch ( error ) {
      errorSprintf( error, "Backend#getGuildUserByIDs(%d, %d) failed", guildID, userID )
      throw error
    }
  }

  async upsertGuildUser( guildmember: any )
  {
    const guild = await this.getGuildBySnowflake( guildmember.guild.id )
    const user = await this.getUserBySnowflake( guildmember.user.id )
    if ( guild && user )
    {
      let cond = { guildID: guild.id, userID: user.id }
      let vals = {
        snowflake: guildmember.id,
        guildID: guild.id,
        userID: user.id,
        nickname: guildmember.nickname ? guildmember.nickname : null,
        deleted: guildmember.deleted
      }
      return Models.GuildUser.findOne({ where: cond })
        .then( ( obj: any ) => {
          if ( obj )
            return obj.update( vals )
          return Models.GuildUser.create( vals )
        })
    }
    return null
  }

  async userShouldUpdateXP( user: any )
  {
    const key: string = ['userlastxppush', user.id].join( '_' )
    const prevtime: any = await this._redis.get( key ) || 0
    const delta: number= ( moment().unix() - prevtime )
    return ( delta > xpUpdateMinDelta )
  }

  async getUserXP( dsUser: User, dsGuild?: Guild ): Promise<UserXP>
  {
    const result: UserXP = {}
    try {
      await this._db.transaction( async t => {
        const user = await this.getUserBySnowflake( dsUser.id )
        if ( !user )
          return
        result.globalXP = user.experience

        if ( !dsGuild )
          return
        const guild = await this.getGuildBySnowflake( dsGuild.id )
        if ( !guild )
          return

        const guilduser = await this.getGuildUserByIDs( guild.id, user.id )
        if ( guilduser )
          result.serverXP = guilduser.experience
      } )
    } catch ( error ) {
      // meh
    }
    return result
  }

  async userAddXP( dsUser: any, dsGuildMember: any, xp: number )
  {
    if ( !dsUser )
      return
    let user = await this.getUserBySnowflake( dsUser.id )
    if ( !user )
      return
    let gkey: string = ['userglobxp', user.id].join( '_' )
    let skey = null
    let guild = null
    if ( dsGuildMember && dsGuildMember.guild.available )
    {
      try {
        guild = await this.getGuildBySnowflake( dsGuildMember.guild.id )
      } catch ( error ) {
        // meh
      }
      if ( guild )
        skey = ['usersrvcxp', user.id, guild.id].join( '_' )
    }
    const shouldUpdateDB = await this.userShouldUpdateXP( user )
    const gxp: number = +await this._redis.incrementFloat( gkey, xp )
    if ( shouldUpdateDB )
    {
      this._redis.set( gkey, '0' )
      await user.increment(['experience', 'totalExperience'], { by: Math.round( gxp ) })
      await user.reload()
      logSprintf( 'xp', 'User %i Global XP after save: %f', user.id, user.experience )
      let level: number = user.level
      let experience: number = user.experience
      while ( true )
      {
        const nextXP: number = Formulas.getXPRequiredForLevel( level + 1 )
        if ( experience >= nextXP )
        {
          level++
          experience -= nextXP
        }
        else
          break
      }
      if ( level > user.level )
      {
        user.level = level
        user.experience = experience
        user.lastLeveled = datetimeNow()
        await user.save()
        logSprintf( 'xp', 'User %i Leveled up! Level: %f', user.id, user.level )
      }
    }
    if ( skey && guild )
    {
      const sxp: number = +await this._redis.incrementFloat( skey, xp )
      if ( shouldUpdateDB )
      {
        this._redis.set( skey, '0' )
        let guilduser
        try {
          guilduser = await this.getGuildUserByIDs( guild.id, user.id )
          if ( !guilduser )
            throw new Error( `Backend#getGuildUserByIDs(${guild.id}, ${user.id}) returned ${guilduser}` )
          await guilduser.increment(['experience', 'totalExperience'], { by: Math.round( sxp ) })
          await guilduser.reload()
          guilduser.level
        } catch ( error ) {
          errorSprintf( error, "Couldn't update experience for user %s in guild %s", user.id, guild.id )
          return
        }
        logSprintf( 'xp', 'User %i Server XP after save: %f', user.id, guilduser.experience )
      }
    }
    if ( shouldUpdateDB )
    {
      // mark update time
      const key: string = ['userlastxppush', user.id].join( '_' )
      await this._redis.set( key, moment().unix() )
    }
  }

  async upsertChannel( channel: any )
  {
    let guild = await this.getGuildBySnowflake( channel.guild.id )
    if ( guild )
    {
      let cond = { snowflake: channel.id }
      const nsfw = ( channel.type === 'text' ? ( channel.nsfw === null ? false : channel.nsfw ) : false )
      const topic = ( channel.type === 'text' ? ( channel.topic ? channel.topic : '' ) : '' )
      let vals = {
        snowflake: channel.id,
        guildID: guild.id,
        name: ( channel.name ? channel.name : null ),
        type: ( channel.type ? channel.type : 'unknown' ),
        deleted: ( channel.deleted === null ? false : channel.deleted ),
        nsfw: nsfw,
        topic: topic,
        updated: datetimeNow()
      }
      return Models.Channel.findOne({ where: cond })
        .then( ( obj: any ) => {
          if ( obj )
            return obj.update( vals )
          return Models.Channel.create( vals )
        })
    }
  }

  async upsertGuild( guild: any )
  {
    let cond = { snowflake: guild.id }
    let vals = {
      snowflake: guild.id,
      name: guild.name,
      icon: guild.icon,
      region: guild.region,
      available: guild.available,
      joined: moment( guild.joinedTimestamp, 'x' ).format( 'YYYY-MM-DD HH:mm:ss.SSSSSS'),
      updated: datetimeNow()
    }
    return Models.Guild.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return Models.Guild.create( vals )
      })
  }

  async initialize()
  {
    return this._db.authenticate().then( async () =>
    {
      logSprintf( 'db', 'Authenticated' )
      if ( this._config.db )
      {
        logSprintf( 'db', 'Synchronizing' )
        const syncOpts: SyncOptions = {
          force: false
        }
        await this._db.sync( syncOpts )
      }
    })
  }

  async destroy()
  {
    return this._db.close()
  }
}
