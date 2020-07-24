'use strict'

const sprintf = require( 'sprintf-js' ).sprintf
const moment = require( 'moment' )

const { Sequelize, Model, DataType, DataTypes } = require( 'sequelize' )
const Redis = require( 'redis' )

const minXPToIncrementToDB = 5

module.exports = class Backend
{
  constructor( config )
  {
    this._redis = Redis.createClient({
      host: '127.0.0.1',
      port: 6379,
      db: 0
    })
    this._db = new Sequelize( config.db.name, config.db.user, config.db.passwd, {
      host: config.db.host,
      port: config.db.port,
      dialect: 'mariadb',
      charset: 'utf8mb4',
      dialectOptions: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        supportBigNumbers: true,
        bigNumberStrings: true
      },
      define: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        freezeTableName: true,
        timestamps: false
      },
      timezone: 'Etc/GMT0',
      logging: msg => {
        logSprintf( 'db', 'Sequelize: %s', msg )
      }
    })
    this._models = {
      Guild: require( '../models/guild' )( this._db, DataTypes ),
      Channel: require( '../models/channel' )( this._db, DataTypes ),
      User: require( '../models/user' )( this._db, DataTypes ),
      GuildUser: require( '../models/guilduser' )( this._db, DataTypes )
    }
  }
  async upsertUser( user )
  {
    let cond = { snowflake: user.id }
    const created = ( user.createdTimestamp > 0 ? moment( user.createdTimestamp, 'x' ).format( 'YYYY-MM-DD HH:mm:ss' ) : null )
    const now = moment().format( 'YYYY-MM-DD HH:mm:ss' )
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
    .then( obj => {
      if ( obj )
        return obj.update( vals )
      return this._models.User.create( vals )
    })
  }
  async getGuildBySnowflake( flake )
  {
    let cond = { snowflake: flake }
    return this._models.Guild.findOne({ where: cond })
  }
  async getUserBySnowflake( flake )
  {
    let cond = { snowflake: flake }
    return this._models.User.findOne({ where: cond })
  }
  async getGuildUserByIDs( guildId, userId )
  {
    let cond = { guildID: guildId, userID: userId }
    return this._models.GuildUser.findOne({ where: cond })
  }
  async upsertGuildUser( guildmember )
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
      .then( obj => {
        if ( obj )
          return obj.update( vals )
        return this._models.GuildUser.create( vals )
      })
    }
    return null
  }
  async redisIncrementFloat( key, value )
  {
    return new Promise( ( resolve, reject ) => {
      this._redis.incrbyfloat( key, value, ( err, res ) => {
        if ( err )
          return reject( err )
        resolve( res )
      })
    })
  }
  async userAddXP( dsUser, dsGuildMember, xp )
  {
    if ( !dsUser )
      return
    let user = await this.getUserBySnowflake( dsUser.id )
    if ( !user )
      return
    let gkey = ['userglobxp', user.id].join( '_' )
    let skey = null
    let guild = null
    if ( dsGuildMember && dsGuildMember.guild.available )
    {
      guild = await this.getGuildBySnowflake( dsGuildMember.guild.id )
      skey = ['usersrvcxp', user.id, guild.id].join( '_' )
    }
    this.redisIncrementFloat( gkey, xp ).then( async val =>
    {
      if ( val > minXPToIncrementToDB )
      {
        this._redis.set( gkey, 0 )
        await user.increment(['experience', 'totalExperience'], { by: Math.round( val ) })
        await user.reload()
        logSprintf( 'xp', 'User %i Global XP after save: %f', user.id, user.experience )
      }
    })
    if ( skey && guild )
    {
      const guilduser = await this.getGuildUserByIDs( guild.id, user.id )
      this.redisIncrementFloat( skey, xp ).then( async val =>
      {
        if ( val > minXPToIncrementToDB )
        {
          this._redis.set( skey, 0 )
          await guilduser.increment(['experience', 'totalExperience'], { by: Math.round( val ) })
          await guilduser.reload()
          logSprintf( 'xp', 'User %i Server XP after save: %f', user.id, user.experience )
        }
      })
    }
  }
  async upsertChannel( channel )
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
      .then( obj => {
        if ( obj )
          return obj.update( vals )
        return this._models.Channel.create( vals )
      })
    }
  }
  async upsertGuild( guild )
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
    .then( obj => {
      if ( obj )
        return obj.update( vals )
      return this._models.Guild.create( vals )
    })
  }
  async initialize()
  {
    return this._db.authenticate().then( this._db.sync() )
  }
  async destroy()
  {
    return this._db.close()
  }
}