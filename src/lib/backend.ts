import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { datetimeNow, debug, logSprintf } from '../globals'
import { Sequelize, Model, DataType, DataTypes } from 'sequelize'
import { Redis } from './redis'
import { CommandoClient } from 'discord.js-commando'

import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'


const xpUpdateMinDelta = 10 // 10 seconds between xp updates to mariadb (from redis)

export class Backend
{
  _redis: Redis
  _db: Sequelize
  _models: any
  _settingCache = new Map()

  constructor( config: any )
  {
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
      logging: false /*msg => {
        logSprintf( 'db', 'Sequelize: %s', msg )
      }*/
    })

    this._models = {}
    for (const model of
        ['Channel', 'Guild', 'GuildUser', 'GuildSetting', 'User'])
      this._models[model] = require( `../models/${model.toLowerCase()}` )( this._db, DataTypes )
    const { clubInit } = require('../models/club')
    debug(clubInit)
    this._models.Club = clubInit( this._db )
    debug(this._models.Club)
    this._models.ClubUser = require('../models/clubuser').clubUserInit( this._db )
    this._models.Club.hasMany(this._models.ClubUser, {
      foreignKey: 'clubID',
      primaryKey: true
    } )
    this._models.ClubUser.belongsTo( this._models.Club, {
      foreignKey: 'clubID'
    } )
    this._models.Club.hasOne( this._models.User, { foreignKey: 'owner' } )
    this._models.User.belongsTo( this._models.Club, { foreignKey: 'userID' } )
  }

  async getAllGuildsSettings( settingKey: string )
  {
    const cond = { key: settingKey }
    return this._models.GuildSetting.findAll({ where: cond })
  }

  async getGuildSettings( guild: string )
  {
    const cond = { guildID: guild }
    return this._models.GuildSetting.findAll({ where: cond })
  }

  async getGuildSetting( guild: string, settingKey: string )
  {
    const cond = { guildID: guild, key: settingKey }
    return this._models.GuildSetting.findOne({ where: cond })
  }

  async setGuildSetting( guild: string, settingKey: string, settingValue: string )
  {
    const cond = { guildID: guild, key: settingKey }
    const vals = {
      guildID: guild,
      key: settingKey,
      value: settingValue,
      lastChanged: datetimeNow()
    }
    return this._models.GuildSetting.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return this._models.GuildSetting.create( vals )
      })
  }

  async removeGuildSetting( guild: string, settingKey: string )
  {
    const cond = { guildID: guild, key: settingKey }
    return this._models.GuildSetting.destroy({ where: cond })
  }

  async getGlobalSettingSetDefault( settingKey: string, defaultValue: any ): Promise<any>
  {
    const value = this._settingCache.get( settingKey )
    if ( value !== undefined )
      return value
    const cond: any = { guildID: null, key: settingKey }
    const row = await this._models.GuildSetting.findOne({ where: cond })
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
      await this._models.GuildSetting.create( vals )
      this._settingCache.set( settingKey, defaultValue )
    }
    return defaultValue
  }

  async getGlobalSetting( settingKey: string ): Promise<any>
  {
    debug( this._settingCache )
    const value = this._settingCache.get( settingKey )
    if ( value !== undefined )
      return value
    const cond: any = { guildID: null, key: settingKey }
    const row = await this._models.GuildSetting.findOne({ where: cond })
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
    debug(this._settingCache)
    const cond: any = { guildID: null, key: settingKey }
    const vals: any = {
      guildID: null,
      key: settingKey,
      value: settingValue,
      lastChanged: datetimeNow()
    }
    this._settingCache.set( settingKey, settingValue )
    return this._models.GuildSetting.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return this._models.GuildSetting.create( vals )
      })
  }

  /*  Returns a setting primarily from guild settings, if it it set there,
   *  and secondarily from global settings.
   */
  async getSetting( settingKey: string, guild?: string )
  {
    let guildSetting
    if ( guild )
      guildSetting = await this.getGuildSetting( guild, settingKey )
    if ( guildSetting !== undefined)
      return guildSetting
    return await this.getGlobalSetting( settingKey )
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
    return this._models.User.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return this._models.User.create( vals )
      })
  }

  async ensureOwners( owners: string[] ): Promise<string[]>
  {
    const cond = { snowflake: owners }
    await this._models.User.update(
      { access: 'owner' },
      { where: cond }
    )
    const rows = await this._models.User.findAll({ where: { access: 'owner' } })
    rows.forEach( ( row: any ) => {
      if ( row && row.snowflake && !owners.includes( row.snowflake ) )
        owners.push( row.snowflake )
    })
    return owners
  }

  async getGuildBySnowflake( flake: string )
  {
    let cond = { snowflake: flake }
    return this._models.Guild.findOne({ where: cond })
  }

  async getSnowflakeByGuildID( gid: number )
  {
    let cond = { id: gid }
    const guild = await this._models.Guild.findOne({ where: cond })
    return ( guild ? guild.snowflake : undefined )
  }

  async getUserBySnowflake( flake: string )
  {
    let cond = { snowflake: flake }
    return this._models.User.findOne({ where: cond })
  }

  async getGuildUserByIDs( guildId: number, userId: number )
  {
    let cond = { guildID: guildId, userID: userId }
    return this._models.GuildUser.findOne({ where: cond })
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
      return this._models.GuildUser.findOne({ where: cond })
        .then( ( obj: any ) => {
          if ( obj )
            return obj.update( vals )
          return this._models.GuildUser.create( vals )
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

  async getUserXP( dsuser: User, dsguild: Guild ): Promise<any>
  {
    const user = await this.getUserBySnowflake( dsuser.id )
    const guild = await this.getGuildBySnowflake( dsguild.id )
    const guilduser = await this.getGuildUserByIDs( guild.id, user.id )
    return {
      globalXP: user ? user.experience : null,
      serverXP: guilduser ? guilduser.experience : null
    }
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
      guild = await this.getGuildBySnowflake( dsGuildMember.guild.id )
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
    }
    if ( skey && guild )
    {
      const sxp: number = +await this._redis.incrementFloat( skey, xp )
      if ( shouldUpdateDB )
      {
        this._redis.set( skey, '0' )
        const guilduser = await this.getGuildUserByIDs( guild.id, user.id )
        await guilduser.increment(['experience', 'totalExperience'], { by: Math.round( sxp ) })
        await guilduser.reload()
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
      return this._models.Channel.findOne({ where: cond })
        .then( ( obj: any ) => {
          if ( obj )
            return obj.update( vals )
          return this._models.Channel.create( vals )
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
    return this._models.Guild.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return this._models.Guild.create( vals )
      })
  }

  async initialize()
  {
    return this._db.authenticate().then( () =>
    {
      this._db.sync({
        force: false,
        alter: true
      })
    })
  }

  async destroy()
  {
    return this._db.close()
  }
}