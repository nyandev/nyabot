import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { logSprintf } from '../globals'
import { Sequelize, Model, DataType, DataTypes } from 'sequelize'
import { RedisClient, createClient } from 'redis'

const xpUpdateMinDelta = 10 // 10 seconds between xp updates to mariadb (from redis)

export class Backend
{
  _redis: RedisClient
  _db: Sequelize
  _models: any
  constructor( config: any )
  {
    this._redis = createClient({
      host: '127.0.0.1',
      port: 6379,
      db: 0
    })
    this._db = new Sequelize( config.db.name, config.db.user, config.db.passwd, {
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
    this._models = {
      Guild: require( '../models/guild' )( this._db, DataTypes ),
      Channel: require( '../models/channel' )( this._db, DataTypes ),
      User: require( '../models/user' )( this._db, DataTypes ),
      GuildUser: require( '../models/guilduser' )( this._db, DataTypes ),
      GuildSetting: require( '../models/guildsetting' )( this._db, DataTypes )
    }
  }
  async getAllGuildsSettings( settingKey: string )
  {
    const cond = { key: settingKey }
    return this._models.GuildSetting.findAll({ where: cond })
  }
  async getGuildSettings( guild: number )
  {
    const cond = { guildID: guild }
    return this._models.GuildSetting.findAll({ where: cond })
  }
  async getGuildSetting( guild: number, settingKey: string )
  {
    const cond = { guildID: guild, key: settingKey }
    return this._models.GuildSetting.findOne({ where: cond })
  }
  async setGuildSetting( guild: number, settingKey: string, settingValue: string )
  {
    const now = moment().format( 'YYYY-MM-DD HH:mm:ss' )
    let cond = { guildID: guild, key: settingKey }
    let vals = {
      guildID: guild,
      key: settingKey,
      value: settingValue,
      lastChanged: now
    }
    return this._models.GuildSetting.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return this._models.GuildSetting.create( vals )
      })
  }
  async removeGuildSetting( guild: number, settingKey: string )
  {
    const cond = { guildID: guild, key: settingKey }
    return this._models.GuildSetting.destroy({ where: cond })
  }
  async upsertUser( user: any )
  {
    const now = moment().format( 'YYYY-MM-DD HH:mm:ss' )
    const created = ( user.createdTimestamp > 0 ? moment( user.createdTimestamp, 'x' ).format( 'YYYY-MM-DD HH:mm:ss' ) : null )
    let cond = { snowflake: user.id }
    let vals = {
      snowflake: user.id,
      name: user.username ? user.username : null,
      discriminator: user.discriminator ? user.discriminator : null,
      avatar: user.avatar ? user.avatar : '',
      bot: user.bot,
      created: created,
      updated: now
    }
    return this._models.User.findOne({ where: cond })
      .then( ( obj: any ) => {
        if ( obj )
          return obj.update( vals )
        return this._models.User.create( vals )
      })
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
  async redisIncrementFloat( key: string, value: any )
  {
    return new Promise( ( resolve, reject ) => {
      this._redis.incrbyfloat( key, value, ( err, res ) => {
        if ( err )
          return reject( err )
        resolve( res )
      })
    })
  }
  async redisGet( key: string )
  {
    return new Promise( ( resolve, reject ) => {
      this._redis.get( key, ( err, res ) => {
        if ( err )
          return reject( err )
        resolve( res )
      })
    })
  }
  async redisSet( key: string, value: any )
  {
    return new Promise( ( resolve, reject ) => {
      this._redis.set( key, value, ( err, res ) => {
        if ( err )
          return reject( err )
        resolve( res )
      })
    })
  }
  async userShouldUpdateXP( user: any )
  {
    const key: string = ['userlastxppush', user.id].join( '_' )
    const prevtime: any = await this.redisGet( key ) || 0
    const delta: number= ( moment().unix() - prevtime )
    return ( delta > xpUpdateMinDelta )
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
    const gxp: number = +await this.redisIncrementFloat( gkey, xp )
    if ( shouldUpdateDB )
    {
      this._redis.set( gkey, '0' )
      await user.increment(['experience', 'totalExperience'], { by: Math.round( gxp ) })
      await user.reload()
      logSprintf( 'xp', 'User %i Global XP after save: %f', user.id, user.experience )
    }
    if ( skey && guild )
    {
      const sxp: number = +await this.redisIncrementFloat( skey, xp )
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
      await this.redisSet( key, moment().unix() )
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
      const now = moment().format( 'YYYY-MM-DD HH:mm:ss' )
      let vals = {
        snowflake: channel.id,
        guildID: guild.id,
        name: ( channel.name ? channel.name : null ),
        type: ( channel.type ? channel.type : 'unknown' ),
        deleted: ( channel.deleted === null ? false : channel.deleted ),
        nsfw: nsfw,
        topic: topic,
        updated: now
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
    const now = moment().format( 'YYYY-MM-DD HH:mm:ss' )
    let cond = { snowflake: guild.id }
    let vals = {
      snowflake: guild.id,
      name: guild.name,
      icon: guild.icon,
      region: guild.region,
      available: guild.available,
      joined: moment( guild.joinedTimestamp, 'x' ).format( 'YYYY-MM-DD HH:mm:ss'),
      updated: now
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
    return this._db.authenticate().then( () => {
      this._db.sync()
    })
  }
  async destroy()
  {
    return this._db.close()
  }
}