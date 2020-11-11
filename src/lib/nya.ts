import { debug, logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'

import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, PresenceData, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from './backend'
import { TalkModule } from './talk'

import { CommandCallbackType, NyaInterface, ModuleBase } from '../modules/module'

import { AdministrationModule } from '../modules/administration'
import { ClubModule } from '../modules/club'
import { CurrencyModule } from '../modules/currency'
import { GamesModule } from '../modules/games'
import { TwitchModule } from '../modules/twitch'
import { TwitterModule } from '../modules/twitter'
import { Twitter2Module } from '../modules/twitter2'
import { XPModule } from '../modules/xp'

import SettingsProvider = require( './settingsprovider' )


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
  _talk: TalkModule
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
    this._talk = new TalkModule( this )
    this.messages = JSON.parse( fs.readFileSync( 'data/messages.json', 'utf8' ) )
  }

  getBackend(): Backend
  {
    return this._backend
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
        console.log( c )
        let channel = await this._backend.upsertChannel( c )
      }, this )
    let dsUsers = await dsGuild.members.fetch()
    if ( dsUsers )
      dsUsers.each( async membership => {
        let fetched = await membership.user.fetch()
        console.log( fetched )
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

  buildEmbedTypical( title: string, description: string, fields: any[], footer: boolean ): MessageEmbed
  {
    const embed = new MessageEmbed()
      .setTitle( title )
      .setDescription( description )
    if ( footer )
    {
      embed.setTimestamp()
      embed.setFooter( this._config.longName, this._config.iconURL )
    }
    fields.forEach( ( field: any ) => {
      embed.addField( field.name, field.value, field.inline )
    })
    return embed
  }

  buildEmbedWelcome( user: User ): MessageEmbed
  {
    const description = sprintf( 'Welcome to the server, **%s**!\n```fix\nID: %s```', user.tag, user.id )
    const embed = this.buildEmbedTypical( 'New Member', description, [], false )
    embed.setThumbnail( user.displayAvatarURL() )
    return embed
  }

  shouldHandle( message: Message ): boolean
  {
    if ( message.partial )
      return false
    if ( !message.author || message.author.bot )
      return false
    if ( !this._client.user || message.author.id === this._client.user.id )
      return false
    return true
  }

  async onMessage( message: Message )
  {
    if ( !this.shouldHandle( message ) )
      return
    this._modules.forEach( module => {
      module.onMessage( message )
    })
  }

  async respondTo( message: Commando.CommandoMessage, replycode: string, ...args: any[] ): Promise<Message | Message[] | null>
  {
    const currencySymbol = this._config.globalDefaults.CurrencySymbol
    const printf = (print: string, ...args: any[]) => this._talk.sendPrintfResponse( message, print, ...args )
    // oh god
    if ( replycode === 'xp' )
      return this._talk.sendXPResponse( message, args[0], args[1], args[2] )
    else if ( replycode === 'config_badkey' )
      return this._talk.sendPrintfResponse( message, 'Unknown global setting. Available keys are: %s', [args[0]].join( ', ' ) )
    else if ( replycode === '8ball' )
      return this._talk.sendPlainResponse( message,  args[0] )
    else if ( replycode === 'hangman_start' ) {
      if ( !args[1] )
        return this._talk.sendPrintfResponse( message, "```%s```", ...args )
      else
        return this._talk.sendPrintfResponse( message, "**Note**: %s\n```%s```", args[1], args[0] )
    }
    else if ( replycode === 'currency_award_user' )
      return this._talk.sendPrintfResponse( message, `%s awarded %d ${currencySymbol} to %s.`, ...args)
    else if ( replycode === 'currency_award_role' )
      return this._talk.sendPrintfResponse( message, `%s awarded %d ${currencySymbol} to everyone with the %s role.`, ...args)
    else if ( replycode === 'currency_show' )
      return this._talk.sendPrintfResponse( message, `%s has %d ${currencySymbol}.`, ...args )
    else if ( replycode === 'slot_win' )
      return this._talk.sendPrintfResponse( message, `%s You won %d ${currencySymbol}!`, ...args )
    else if ( replycode === 'link' )
      return this._talk.sendAttachmentResponse( message, args[0] )
    else if ( replycode === 'club_leave_success' )
      return printf( args[1].map( (clubName: string) => `${args[0]} left ${clubName}.` ).join('\n') )
    else
      return this._talk.sendPrintfResponse( message, this.messages[replycode] || replycode, ...args )
    return null
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
        fetchAllMembers: false,
        // disableMentions, allowedMentions, partials
        restWsBridgeTimeout: 5000,
        restTimeOffset: 500,
        restRequestTimeout: 10000,
        restSweepInterval: 60,
        retryLimit: 2,
        presence: this.makePresence(),
        ws: {
          large_threshold: 200
          // intents: 
        },
        owner: owners,
        commandPrefix: await this._backend.getGlobalSetting( 'Prefix' ),
        commandEditableDuration: await this._backend.getGlobalSetting( 'MessageEditableDuration' )
      }
      this._inviteLink = null
      this._client = new Commando.Client( this._opts )
      this._client
        .on( 'debug', this.onDebug )
        .on( 'warn', this.onWarning )
        .on( 'error', this.onError )
        .on( 'invalidated', this.onInvalidated )
        .on( 'ready', ( this.onReady ).bind( this ) )
        .on( 'rateLimit', this.onRateLimit )
        .on( 'shardReady', this.onShardReady )
        .on( 'guildCreate', ( this.onGuildCreate ).bind( this ) )
        .on( 'guildUpdate', ( this.onGuildUpdate ).bind( this ) )
        .on( 'guildDelete', ( this.onGuildDelete ).bind( this ) )
        .on( 'channelCreate', ( this.onChannelCreate ).bind( this ) )
        .on( 'channelUpdate', ( this.onChannelUpdate ).bind( this ) )
        .on( 'channelDelete', ( this.onChannelDelete ).bind( this ) )
        .on( 'userUpdate', ( this.onUserUpdate ).bind( this ) )
        .on( 'message', ( this.onMessage ).bind( this ) )
        .on( 'guildUnavailable', this.onGuildUnavailable )
        .on('commandError', (cmd, err) => {
          if(err instanceof Commando.FriendlyError) return;
          console.error(`Error in command ${cmd.groupID}:${cmd.memberName}`, err);
        })
        .on('commandBlocked', (msg: any, reason: any) => {
          console.log(`
            Command ${msg.command ? `${msg.command.groupID}:${msg.command.memberName}` : ''}
            blocked; ${reason}
          `);
        })
        .on('commandPrefixChange', (guild: any, prefix: any) => {
          console.log(`
            Prefix ${prefix === '' ? 'removed' : `changed to ${prefix || 'the default'}`}
            ${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
          `);
        })
        .on('commandStatusChange', (guild: any, command: any, enabled: any) => {
          console.log(`
            Command ${command.groupID}:${command.memberName}
            ${enabled ? 'enabled' : 'disabled'}
            ${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
          `);
        })
        .on('groupStatusChange', (guild: any, group: any, enabled: any) => {
          console.log(`
            Group ${group.id}
            ${enabled ? 'enabled' : 'disabled'}
            ${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
          `);
        })

      //this._client.dispatcher.addInhibitor( ( msg: Commando.CommandoMessage ): any =>
      //{
      //  return ( msg.channel && msg.channel.type !== 'dm' && msg.channel.name.indexOf( 'botdev' ) > 0 ) ? false : 'beep boop'
      //})
  
      this._client.setProvider( new SettingsProvider( this._backend ) )
      this._client.registry.registerDefaultTypes()

      await this.start()

      for ( const module of [
          AdministrationModule,
          ClubModule,
          CurrencyModule,
          GamesModule,
          TwitchModule,
          TwitterModule,
          Twitter2Module,
          XPModule
      ] )
        this.registerModule( new module( this._modules.length, this, this._client ) )

      const globalKeys = this.getGlobalSettingKeys()
      if ( !await this._backend.initGlobalSettings( this._config.globalDefaults, this.getGlobalSettingKeys() ) )
        return reject( new Error( "Global settings init failed" ) )

      this._client.registry.registerDefaultGroups()
      this._modules.forEach( module => {
        this._client.registry.registerGroups( module.getGroups() )
      })

      this._client.registry.registerDefaultCommands()
      this._modules.forEach( module => {
        this._client.registry.registerCommands( module.getCommands() )
      })

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
      this._client.generateInvite( ['ADMINISTRATOR'] ).then( link =>
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