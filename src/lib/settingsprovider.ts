import { SettingProvider as SettingProviderBase, CommandoGuild, CommandoClient, Command, CommandGroup } from 'discord.js-commando'
import { Snowflake, Guild, GuildResolvable } from 'discord.js'
import { Backend } from './backend'


export class SettingsProvider extends SettingProviderBase
{
  settings = new Map()
  listeners = new Map()
  client: CommandoClient

  protected _idCache = new Map()
  protected _flakeCache = new Map()

  constructor( protected _backend: Backend )
  {
    super()
  }

  async init( client: CommandoClient )
  {
    this.client = client
    const rows = await this._backend.getAllGuildsSettings( 'commando' )
    for ( const row of rows )
    {
      let settings
      try
      {
        settings = ( row.value ? JSON.parse( row.value ) : {} )
      }
      catch ( err )
      {
        client.emit( 'warn', `SettingsProvider couldn't parse the settings stored for guild ${row.guildID}.` )
        continue
      }
      this.settings.set( row.guildID, settings )
      const flake = await this.idToSnowflake( ( row.guildID !== null && row.guildID !== 0 ) ? row.guildID : 'global' )
      if ( flake && row.guildID && !client.guilds.cache.has( flake ) )
        continue
      if ( flake )
        this.setupGuild( flake, settings )
    }

    this.listeners
      .set( 'commandPrefixChange', ( guild: CommandoGuild, prefix: string ) => this.set( guild, 'prefix', prefix ) )
      .set( 'commandStatusChange', ( guild: CommandoGuild, command: Command, enabled: boolean ) => this.set( guild, 'cmd-' + command.name, enabled ) )
      .set( 'groupStatusChange', ( guild: CommandoGuild, group: CommandGroup, enabled: boolean ) => this.set( guild, 'grp-' + group.id, enabled ) )
      .set( 'guildCreate', async ( guild: CommandoGuild ) =>
      {
        const flake = guild.id
        const gid = await this.snowflakeToID( flake )
        const settings = gid ? this.settings.get( gid ) : null
        if ( !settings )
          return
        this.setupGuild( flake, settings )
      })
      .set( 'commandRegister', async ( command: Command ) =>
      {
        for ( const [guild, settings] of this.settings )
        {
          const gid = guild
          const flake = await this.idToSnowflake( gid )
          if ( !flake || !client.guilds.cache.has( flake ) )
            continue
          this.setupGuildCommand( client.guilds.cache.get( flake ) as CommandoGuild, command, settings )
        }
      })
      .set( 'groupRegister', async ( group: CommandGroup ) =>
      {
        for ( const [guild, settings] of this.settings )
        {
          const gid = guild
          const flake = await this.idToSnowflake( gid )
          if ( !flake || !client.guilds.cache.has( flake ) )
            continue
          this.setupGuildGroup( client.guilds.cache.get( flake ) as CommandoGuild, group, settings )
        }
      })
  
    for ( const [event, listener] of this.listeners.entries() )
      client.on( event, listener )
  }

  async snowflakeToID( flake: any ): Promise<number | 'global' | null>
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
        if ( id )
          this._idCache.set( flake, ( id as number ) )
      }
    }
    return id || null
  }

  async idToSnowflake( gid: any ): Promise<string | null>
  {
    if ( gid === null || gid === undefined || gid === 0 || gid === '0' || gid === 'global' )
      return null
    let flake = this._flakeCache.get( gid )
    if ( !flake )
    {
      flake = await this._backend.getSnowflakeByGuildID( gid )
      if ( flake )
        this._flakeCache.set( gid, flake )
    }
    return ( flake ? flake : null )
  }

  async destroy()
  {
    for ( const [event, listener] of this.listeners.entries() )
      this.client.removeListener( event, listener )
    this.listeners.clear()
  }

  async get( guild: Guild | string, key: string, defVal?: any )
  {
    const gid = await this.snowflakeToID( SettingProviderBase.getGuildID ( guild ) )
    const settings = this.settings.get( gid )
    return settings ? typeof settings[key] !== 'undefined' ? settings[key] : defVal : defVal
  }

  async set( guild: Guild | string, key: string, val: any )
  {
    const gid = await this.snowflakeToID( SettingProviderBase.getGuildID( guild ) )
    let settings = this.settings.get( gid )
    if ( !settings )
    {
      settings = {}
      this.settings.set( gid, settings )
    }
    settings[key] = val
    if ( gid === 'global' ) {
      await this._backend.setGlobalSetting( 'commando', JSON.stringify( settings ) )
      this.updateOtherShards( key, val )
    } else {
      await this._backend.setGuildSetting( gid as number, 'commando', JSON.stringify( settings ) )
    }
    return val
  }

  async remove( guild: Guild | string, key: string )
  {
    const gid = await this.snowflakeToID( SettingProviderBase.getGuildID( guild ) )
    const settings = this.settings.get( gid )
    if ( !settings || typeof settings[key] === 'undefined' )
      return undefined
    const val = settings[key]
    settings[key] = undefined
    if ( gid === 'global' ) {
      await this._backend.setGlobalSetting( 'commando', JSON.stringify( settings ) )
      this.updateOtherShards( key, undefined )
    } else {
      await this._backend.setGuildSetting( gid as number, 'commando', JSON.stringify( settings ) )
    }
    return val
  }

  async clear( guild: Guild | string )
  {
    const gid = await this.snowflakeToID( SettingProviderBase.getGuildID( guild ) )
    if ( !this.settings.has( gid ) )
      return
    this.settings.delete( gid )
    await this._backend.clearGuildSettings( gid !== 'global' ? ( gid as number ) : null )
  }

  setupGuild( guildId: string, settings: any )
  {
    if ( typeof guildId !== 'string' )
      throw new TypeError( 'The guild must be a guild ID or "global".' )
    const guild = this.client!.guilds.cache.get( guildId ) as CommandoGuild || null
    if ( typeof settings.prefix !== 'undefined' )
    {
      if ( guild )
        guild.commandPrefix = settings.prefix
      else
        this.client!.commandPrefix = settings.prefix
    }
    for ( const command of this.client!.registry.commands.values() )
      this.setupGuildCommand( guild, command, settings )
    for ( const group of this.client!.registry.groups.values() )
      this.setupGuildGroup( guild, group, settings )
  }

  setupGuildCommand( guild: GuildResolvable, command: Command, settings: any )
  {
    const key: string = 'cmd-' + command.name

    if ( typeof settings[key] === 'undefined' )
      return

    command.setEnabledIn( guild, settings[key] )
  }

  setupGuildGroup( guild: GuildResolvable, group: CommandGroup, settings: any )
  {
    const key: string = 'grp-' + group.id

    if ( typeof settings[key] === 'undefined' )
      return
  
    group.setEnabledIn( guild, settings[key] )
  }

  updateOtherShards( key: any, val: any )
  {
    if ( !this.client!.shard )
      return
    key = JSON.stringify( key )
    val = typeof val !== 'undefined' ? JSON.stringify( val ) : 'undefined'
    this.client.shard.broadcastEval(`
      const ids = [${this.client!.shard.ids.join(',')}];
      if ( !this.shard.ids.some( id => ids.includes( id ) ) && this.provider && this.provider.settings )
      {
        let global = this.provider.settings.get( 'global' );
        if ( !global ) {
          global = {};
          this.provider.settings.set( 'global', global );
        }
        global[${key}] = ${val};
      }
    `);
  }
}
