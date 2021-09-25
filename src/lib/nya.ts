import * as fs from 'fs'
import { EventEmitter } from 'events'

import * as Commando  from 'discord.js-commando'
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, Intents, PresenceData, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook, InviteGenerationOptions } from 'discord.js'

import * as moment from 'moment'
import { sprintf } from 'sprintf-js'

import { Backend } from './backend'
import { SettingsProvider } from './settingsprovider'
import { TalkModule } from './talk'
import { log, debug, logSprintf } from '../globals'
import { CommandCallbackType, NyaInterface, ModuleBase } from '../modules/module'
import { AdministrationModule } from '../modules/administration'
import { ClubModule } from '../modules/club'
import { CurrencyModule } from '../modules/currency'
import { GamesModule } from '../modules/games'
import { RolesModule } from '../modules/roles'
import { TwitchModule } from '../modules/twitch'
import { TwitterModule } from '../modules/twitter'
import { XPModule } from '../modules/xp'
import { ProfileModule } from '../modules/profile'

// Nya is the bot main class.
// Really needs some cleanup to refactor the random junk just crammed in here.
export class Nya implements NyaInterface
{
  _config: any
  _backend: Backend
  _emitter: EventEmitter
  _inviteLink: string | null
  _opts: Commando.CommandoClientOptions
  _client: Commando.CommandoClient
  stoppedPromise: any
  _stoppedResolve: any
  _modules: ModuleBase[]
  talk: TalkModule
  messages: Record<string, string>

  makePresence(): PresenceData
  {
    return {
      status: 'online',
      afk: false,
      shardID: 0
    }
  }

  registerModule( mod: ModuleBase ): void
  {
    const index = this._modules.length
    mod.registerStuff( index, this )
    this._modules.push( mod )
    logSprintf( 'nya', 'Registered module %s', mod.constructor.name );
  }

  constructor( config: any, backend: Backend )
  {
    this._modules = []
    this._config = {
      token: config.discord.token,
      owners: config.discord.owners,
      longName: config.longName,
      iconURL: config.iconURL,
      globalDefaults: ( config.globalDefaults ? config.globalDefaults : null )
    }
    this._backend = backend
    this._emitter = new EventEmitter()
    this.talk = new TalkModule( this )
    this.messages = JSON.parse( fs.readFileSync( 'data/messages.json', 'utf8' ) )
  }

  getBackend(): Backend
  {
    return this._backend
  }

  getEmitter(): EventEmitter
  {
    return this._emitter
  }

  getClient(): Commando.CommandoClient
  {
    return this._client
  }

  getGlobalSettingKeys(): string[]
  {
    const keys = ['MessageEditableDuration', 'Prefix']
    for ( const module of this._modules )
      keys.push( ...module.getGlobalSettingKeys() )
    return keys
  }

  async onDebug( info: string )
  {
    logSprintf( 'debug', info )
  }

  async onWarning( info: string )
  {
    logSprintf( 'nya', 'onWarning: %s', info )
  }

  async onError( error: any )
  {
    logSprintf( 'nya', 'onError:' )
    console.log( error )
  }

  async onInvalidated()
  {
    logSprintf( 'nya', 'onInvalidated' )
  }

  async onReady()
  {
    logSprintf( 'nya', 'onReady' )
    this._client.guilds.cache.each( guild => this.onGuildCreate( guild ) )
  }

  async onRateLimit( rateLimitInfo: any )
  {
    logSprintf( 'nya', 'onRateLimit:' )
    console.log( rateLimitInfo )
  }

  async onShardReady( id: number )
  {
    logSprintf( 'nya', 'onShardReady: %i', id )
  }

  async onGuildCreate( dsGuild: Guild )
  {
    let guild = await this._backend.upsertGuild( dsGuild )
    let dsChannels = dsGuild.channels.cache
    if ( dsChannels )
      dsChannels.each( async c => {
        let channel = await this._backend.upsertChannel( c )
      }, this )
    let dsUsers
    try {
      dsUsers = await dsGuild.members.fetch()
    } catch ( error ) {
      log( `Couldn't fetch members of guild ${dsGuild.id}:`, error )
    }
    if ( dsUsers )
      dsUsers.each( async membership => {
        let fetched = await membership.user.fetch()
        let user = await this._backend.upsertUser( fetched )
        await this._backend.upsertGuildUser( membership )
      }, this )
    this._emitter.emit( 'guildCreated', guild )
  }

  async onGuildUpdate( dsOldGuild: any, dsNewGuild: any )
  {
    let guild = await this._backend.upsertGuild( dsNewGuild )
    this._emitter.emit( 'guildUpdated', guild )
  }

  async onGuildDelete( dsGuild: Guild )
  {
    let guild = await this._backend.upsertGuild( dsGuild )
    this._emitter.emit( 'guildDeleted', guild )
  }

  async onGuildMemberAdd( member: GuildMember ): Promise<void>
  {
    const user = await member.user.fetch()
    await this._backend.upsertUser( user )
    await this._backend.upsertGuildUser( member )

    for ( const module of this._modules )
      module.onGuildMemberAdd( member )
  }

  async onGuildMemberUpdate( oldMember: GuildMember, newMember: GuildMember )
  {
    // Update DB
    await this._backend.upsertGuildUser( newMember )
  }

  async onGuildMemberRemove( member: GuildMember )
  {
    // First let modules react
    for ( const module of this._modules )
      module.onGuildMemberRemove( member )
    // Then update DB
    await this._backend.upsertGuildUser( member )
  }

  async onChannelCreate( dsChannel: Channel )
  {
    if ( dsChannel.type !== 'dm' )
    {
      let channel = await this._backend.upsertChannel( dsChannel )
      this._emitter.emit( 'channelCreated', channel )
    }
  }

  async onChannelUpdate( dsOldChannel: any, dsNewChannel: any )
  {
    if ( dsNewChannel.type !== 'dm' )
    {
      let channel = await this._backend.upsertChannel( dsNewChannel )
      this._emitter.emit( 'channelUpdated', channel )
    }
  }

  async onChannelDelete( dsChannel: Channel )
  {
    if ( dsChannel.type !== 'dm' )
    {
      let channel = await this._backend.upsertChannel( dsChannel )
      this._emitter.emit( 'channelDeleted', channel )
    }
  }

  async onUserUpdate( dsOldUser: any, dsNewUser: any )
  {
    let user = await this._backend.upsertUser( dsNewUser )
    this._emitter.emit( 'userUpdated', user )
  }

  shouldHandle( message: Message ): boolean
  {
    if ( message.partial )
      return false
    if ( !message.author || message.author.bot )
      return false
    if ( !this._client.user || message.author.id === this._client.user.id )
      return false
    if ( ( message as Commando.CommandoMessage ).command )
      return false
    return true
  }

  async onMessage( message: Message )
  {
    if ( message.content === "test test" )
      message.channel.send( "oon tää kissa" )
    if ( this.shouldHandle( message ) )
      for ( const module of this._modules )
        module.onMessage( message )
  }
 
  async onMessageUpdate( oldMessage: Message, newMessage: Message )
  {
    if ( this.shouldHandle( newMessage ) )
      this._emitter.emit( 'messageUpdated', oldMessage, newMessage )
  }
 
  async onMessageDelete( message: Message )
  {
    if ( this.shouldHandle( message ) )
      this._emitter.emit( 'messageDeleted', message )
  }

  async onReactionAdd( reaction: MessageReaction, user: User )
  {
    for ( const module of this._modules )
      module.onReactionAdd( reaction, user )
  }

  async onReactionRemove( reaction: MessageReaction, user: User )
  {
    for ( const module of this._modules )
      module.onReactionRemove( reaction, user )
  }

  // TODO: maybe remove this method entirely and send responses directly via TalkModule methods
  async respondTo( message: Commando.CommandoMessage, replycode: string, ...args: any[] ): Promise<Message | Message[] | null>
  {
    const currencySymbol = this._config.globalDefaults.CurrencySymbol
    const printf = ( template: string, ...args: any[]) => this.talk.sendPrintfResponse( message, template, ...args )

    // oh god
    if ( replycode === 'xp' )
      return this.talk.sendXPResponse( message, args[0], args[1], args[2] )
    else if ( replycode === 'config_badkey' )
      return printf( "Unknown global setting. Available keys are: %s", [args[0]].join( ', ' ) )
    else if ( replycode === 'hangman_start' ) {
      if ( !args[1] )
        return printf( "```%s```", ...args )
      else
        return printf( "**Note**: %s\n```%s```", args[1], args[0] )
    }
    else if ( replycode === 'link' )
      return this.talk.sendAttachmentResponse( message, args[0] )
    else if ( replycode === 'club_leave_success' )
      return printf( args[1].map( (clubName: string) => `${args[0]} left ${clubName}.` ).join('\n') )
    else {
      if ( !this.messages[replycode] ) {
        log( `Unknown message ID ${replycode}` )
        return printf( replycode )
      }
      return printf( this.messages[replycode], ...args )
    }
  }

  async onGuildUnavailable( guild: Guild )
  {
    logSprintf( 'nya', 'onGuildUnavailable' )
  }

  async initialize()
  {
    return new Promise( async ( resolve, reject ) =>
    {
      /* MOVED AFTER MODULE LOADING TO GET KEYS FROM MODULES
      const initval = await this._backend.initGlobalSettings( this._config.globalDefaults, this.getGlobalSettingKeys() )
      if ( !initval )
        return reject( new Error( 'Global settings init failed' ) )
      */

      const owners = await this._backend.ensureOwners( this._config.owners )
      owners.forEach( owner => {
        logSprintf( 'core', 'Owner: %s', owner )
      })

      this._opts = {
        shards: 0,
        shardCount: 1,
        messageCacheMaxSize: 200,
        messageCacheLifetime: 0,
        messageSweepInterval: 0,
        allowedMentions: { repliedUser: false },
        // partials?
        restWsBridgeTimeout: 5000,
        restTimeOffset: 500,
        restRequestTimeout: 10000,
        restSweepInterval: 60,
        retryLimit: 2,
        presence: this.makePresence(),
        intents: Intents.ALL,
        ws: {
          large_threshold: 200
          // compress?, properties?
        },
        http: {
          version: 7 // API version to use
        },
        owner: owners,
        commandPrefix: await this._backend.getGlobalSetting( 'Prefix' ),
        commandEditableDuration: await this._backend.getGlobalSetting( 'MessageEditableDuration' )
        // nonCommandEditable?, invite?
      }
      this._inviteLink = null
      this._client = new Commando.Client( this._opts )
      this._client
        .on( 'debug', this.onDebug )
        .on( 'warn', this.onWarning )
        .on( 'error', this.onError )
        .on( 'invalidated', this.onInvalidated )
        .on( 'ready', this.onReady.bind( this ) )
        .on( 'rateLimit', this.onRateLimit )
        .on( 'shardReady', this.onShardReady )
        .on( 'guildCreate', this.onGuildCreate.bind( this ) )
        .on( 'guildUpdate', this.onGuildUpdate.bind( this ) )
        .on( 'guildDelete', this.onGuildDelete.bind( this ) )
        .on( 'guildMemberAdd', this.onGuildMemberAdd.bind( this ) )
        .on( 'guildMemberUpdate', this.onGuildMemberUpdate.bind( this ) )
        .on( 'guildMemberRemove', this.onGuildMemberRemove.bind( this ) )
        .on( 'channelCreate', this.onChannelCreate.bind( this ) )
        .on( 'channelUpdate', this.onChannelUpdate.bind( this ) )
        .on( 'channelDelete', this.onChannelDelete.bind( this ) )
        .on( 'userUpdate', this.onUserUpdate.bind( this ) )
        .on( 'message', this.onMessage.bind( this ) )
        .on( 'messageReactionAdd', this.onReactionAdd.bind( this ) )
        .on( 'messageReactionRemove', this.onReactionRemove.bind( this ) )
        .on( 'messageUpdate', this.onMessageUpdate.bind( this ) )
        .on( 'messageDelete', this.onMessageDelete.bind( this ) )
        .on( 'guildUnavailable', this.onGuildUnavailable )
        .on( 'commandError', ( cmd, err, ...args ) =>
        {
          if ( err instanceof Commando.FriendlyError )
            return;
          console.error(`Error in command ${cmd.groupID}:${cmd.memberName}`, err);
        })
        .on( 'commandBlock', ( msg: Commando.CommandoMessage, reason: any ) =>
        {
          console.log(`
            Command ${msg.command ? `${msg.command.groupID}:${msg.command.memberName}` : ''}
            blocked; ${reason}
          `);
        })
        .on( 'commandPrefixChange', ( guild: Commando.CommandoGuild, prefix: string ) =>
        {
          console.log(`
            Prefix ${prefix === '' ? 'removed' : `changed to ${prefix || 'the default'}`}
            ${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
          `);
        })
        .on( 'commandStatusChange', ( guild: Commando.CommandoGuild, command: Commando.Command, enabled: boolean ) =>
        {
          console.log(`
            Command ${command.groupID}:${command.memberName}
            ${enabled ? 'enabled' : 'disabled'}
            ${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
          `);
        })
        .on( 'groupStatusChange', ( guild: Commando.CommandoGuild, group: Commando.CommandGroup, enabled: boolean ) =>
        {
          console.log(`
            Group ${group.id}
            ${enabled ? 'enabled' : 'disabled'}
            ${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
          `);
        })
  
      this._client.setProvider( new SettingsProvider( this._backend ) )
      this._client.registry.registerDefaultTypes()

      await this.start()

      for ( const module of [
        AdministrationModule,
        ClubModule,
        CurrencyModule,
        GamesModule,
        RolesModule,
        TwitchModule,
        TwitterModule,
        XPModule,
        ProfileModule
      ])
        this.registerModule( new module( this._modules.length, this, this._client ) )

      const globalKeys = this.getGlobalSettingKeys()
      if ( !await this._backend.initGlobalSettings( this._config.globalDefaults, globalKeys ) )
        return reject( new Error( "Global settings init failed" ) )

      this._client.registry.registerDefaultGroups()
      this._modules.forEach( module => {
        this._client.registry.registerGroups( module.getGroups() )
      })

      this._client.registry.registerDefaultCommands({
        unknownCommand: false
      })
      this._modules.forEach( module => {
        this._client.registry.registerCommands( module.getCommands() )
      })

      await Promise.all( this._modules.map( module => {
        logSprintf( 'nya', 'Initializing module %s', module.constructor.name )
        return module.initialize()
      } ) )

      resolve( true )
    })
  }

  async start() {
    this._stoppedResolve = null
    this.stoppedPromise = new Promise( resolve => {
      this._stoppedResolve = resolve
    } )
    return this._client.login( this._config.token )
  }

  async generateInvite()
  {
    return new Promise( ( resolve, reject ) =>
    {
      const opts: InviteGenerationOptions = {
        permissions: ['ADMINISTRATOR']
        // guild? - Guild to preselect
        // disableGuildSelect? - Whether to disable the guild selection
      }
      this._client.generateInvite( opts ).then( link =>
      {
        this._inviteLink = link
        resolve( this._inviteLink )
      }).catch( error => 
      {
        reject( error )
      })
    })
  }

  async stop()
  {
    this._client.destroy()
    this._stoppedResolve( true )
  }
}
