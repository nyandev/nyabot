const SettingProvider = require( '../../node_modules/discord.js-commando/src/providers/base' )

class SettingsProvider extends SettingProvider
{
  constructor( backend )
  {
    super()

    this._backend = backend

    Object.defineProperty( this, 'client', { value: null, writable: true } )

    this.settings = new Map()

    this.listeners = new Map()

    this._idCache = new Map()
  }

  async init( client )
  {
    this.client = client
    const rows = await this._backend.getAllGuildsSettings( 'commando' )
    for ( const row of rows )
    {
      let settings
      try
      {
        settings = JSON.parse( row.value )
      }
      catch ( err )
      {
        client.emit( 'warn', `SettingsProvider couldn't parse the settings stored for guild ${row.guild}.` )
        continue
      }
      const guild = ( row.guildID !== null && row.guildID !== 0 ) ? row.guildID : 'global'
      this.settings.set( guild, settings )
      if ( guild !== 'global' && !client.guilds.cache.has( row.guild ) )
        continue;
      this.setupGuild( guild, settings )
    }

    this.listeners
      .set( 'commandPrefixChange', ( guild, prefix ) => this.set( guild, 'prefix', prefix ) )
      .set( 'commandStatusChange', ( guild, command, enabled ) => this.set( guild, `cmd-${command.name}`, enabled ) )
      .set( 'groupStatusChange', ( guild, group, enabled ) => this.set( guild, `grp-${group.id}`, enabled ) )
      .set( 'guildCreate', guild =>
      {
        const settings = this.settings.get( guild.id )
        if ( !settings )
          return
        this.setupGuild( guild.id, settings )
      })
      .set( 'commandRegister', command =>
      {
        for ( const [guild, settings] of this.settings ) {
          if ( guild !== 'global' && !client.guilds.cache.has( guild ) )
            continue
          this.setupGuildCommand( client.guilds.cache.get( guild ), command, settings )
        }
      })
      .set( 'groupRegister', group =>
      {
        for ( const [guild, settings] of this.settings ) {
          if ( guild !== 'global' && !client.guilds.cache.has( guild ) )
            continue
          this.setupGuildGroup( client.guilds.cache.get( guild ), group, settings )
        }
      })
    for ( const [event, listener] of this.listeners )
      client.on( event, listener )
  }

  async snowflakeToID( flake )
  {
    if ( flake === null || flake === undefined || flake === 0 || flake === '0' || flake === 'global' )
      return 'global'
    let id = this._idCache.get( flake )
    if ( !id )
    {
      const guild = await this._backend.getGuildBySnowflake( flake )
      if ( guild )
      {
        id = guild.id
        this._idCache.set( flake, id )
      }
    }
    return id
  }

  async destroy()
  {
    for ( const [event, listener] of this.listeners )
      this.client.removeListener( event, listener )
    this.listeners.clear()
  }

  async get( guild, key, defVal )
  {
    const gid = await this.snowflakeToID( this.constructor.getGuildID ( guild ) )
    const settings = this.settings.get( gid )
    return settings ? typeof settings[key] !== 'undefined' ? settings[key] : defVal : defVal
  }

  async set( guild, key, val )
  {
    guild = await this.snowflakeToID( this.constructor.getGuildID( guild ) )
    let settings = this.settings.get( guild )
    if ( !settings )
    {
      settings = {};
      this.settings.set( guild, settings )
    }
    settings[key] = val
    await this._backend.setGuildSetting( guild !== 'global' ? guild : null, 'commando', JSON.stringify( settings ) )
    if ( guild === 'global' )
      this.updateOtherShards( key, val )
    return val
  }

  async remove( guild, key )
  {
    guild = this.constructor.getGuildID( guild )
    const settings = this.settings.get( guild )
    if ( !settings || typeof settings[key] === 'undefined' )
      return undefined
    const val = settings[key]
    settings[key] = undefined
    await this._backend.setGuildSetting( guild !== 'global' ? guild : null, 'commando', JSON.stringify( settings ) )
    if ( guild === 'global' )
      this.updateOtherShards( key, undefined )
    return val
  }

  async clear( guild )
  {
    guild = this.constructor.getGuildID( guild )
    if ( !this.settings.has( guild ) )
      return
    this.settings.delete( guild )
    await this._backend.removeGuildSetting( guild !== 'global' ? guild : null )
  }

  setupGuild( guild, settings )
  {
    if ( typeof guild !== 'string' )
      throw new TypeError( 'The guild must be a guild ID or "global".' )
    guild = this.client.guilds.cache.get( guild ) || null
    if ( typeof settings.prefix !== 'undefined' )
    {
      if ( guild )
        guild._commandPrefix = settings.prefix
      else
        this.client._commandPrefix = settings.prefix
    }
    for ( const command of this.client.registry.commands.values() )
      this.setupGuildCommand( guild, command, settings )
    for ( const group of this.client.registry.groups.values() )
      this.setupGuildGroup( guild, group, settings )
  }

  setupGuildCommand( guild, command, settings )
  {
    if ( typeof settings[`cmd-${command.name}`] === 'undefined' )
      return
    if ( guild )
    {
      if ( !guild._commandsEnabled )
        guild._commandsEnabled = {}
      guild._commandsEnabled[command.name] = settings[`cmd-${command.name}`]
    }
    else
    {
      command._globalEnabled = settings[`cmd-${command.name}`]
    }
  }

  setupGuildGroup( guild, group, settings )
  {
    if ( typeof settings[`grp-${group.id}`] === 'undefined' )
      return
    if ( guild )
    {
      if ( !guild._groupsEnabled )
        guild._groupsEnabled = {}
      guild._groupsEnabled[group.id] = settings[`grp-${group.id}`]
    }
    else
    {
      group._globalEnabled = settings[`grp-${group.id}`]
    }
  }

  updateOtherShards( key, val )
  {
    if ( !this.client.shard )
      return
    key = JSON.stringify( key )
    val = typeof val !== 'undefined' ? JSON.stringify( val ) : 'undefined'
    this.client.shard.broadcastEval(`
      if ( this.shard.id !== ${this.client.shard.id} && this.provider && this.provider.settings )
      {
        let global = this.provider.settings.get('global');
        if ( !global ) {
          global = {};
          this.provider.settings.set('global', global);
        }
        global[${key}] = ${val};
      }
    `);
  }
}

module.exports = SettingsProvider;