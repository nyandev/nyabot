'use strict'

const EventEmitter = require( 'events' )
const Discord = require( 'discord.js' )

const sprintf = require( 'sprintf-js' ).sprintf
const moment = require( 'moment' )

const Parser = require( './parser.js' )

class NyaEmitter extends EventEmitter
{
}

module.exports = class Nya
{
	makePresence()
	{
		return {
			status: 'online',
			afk: false,
			activity: null,
			shardID: 0
		}
	}
	constructor( config, backend )
	{
		this._config = {
			token: config.discord.token
		}
		this._backend = backend
		this._emitter = new NyaEmitter()
		this._parser = new Parser()
	}
	async onDebug( info )
	{
		logSprintf( 'debug', info )
	}
	async onWarning( info )
	{
		logSprintf( 'nya', 'onWarning: %s', info )
	}
	async onError( error )
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
	}
	async onRateLimit( rateLimitInfo )
	{
		logSprintf( 'nya', 'onRateLimit:' )
		console.log( rateLimitInfo )
	}
	async onShardReady( id, unavailableGuilds )
	{
		logSprintf( 'nya', 'onShardReady: %i', id )
	}
	async onGuildCreate( dsGuild )
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
	async onGuildUpdate( dsOldGuild, dsNewGuild )
	{
		let guild = await this._backend.upsertGuild( dsNewGuild )
		this._emitter.emit( 'guildUpdated', guild )
	}
	async onGuildDelete( dsGuild )
	{
		let guild = await this._backend.upsertGuild( dsGuild )
		this._emitter.emit( 'guildDeleted', guild )
	}
	async onChannelCreate( dsChannel )
	{
		let channel = await this._backend.upsertChannel( dsChannel )
		this._emitter.emit( 'channelCreated', channel )
	}
	async onChannelUpdate( dsOldChannel, dsNewChannel )
	{
		let channel = await this._backend.upsertChannel( dsNewChannel )
		this._emitter.emit( 'channelUpdated', channel )
	}
	async onChannelDelete( dsChannel )
	{
		let channel = await this._backend.upsertChannel( dsChannel )
		this._emitter.emit( 'channelDeleted', channel )
	}
	async onUserUpdate( dsOldUser, dsNewUser )
	{
		let user = await this._backend.upsertUser( dsNewUser )
		this._emitter.emit( 'userUpdated', user )
	}
	shouldCareAbout( user )
	{
		// currently we care about everyone that's not a bot
		return ( !user.bot )
	}
	async onMessage( message )
	{
		if ( !this.shouldCareAbout( message.author ) )
			return
			
		const parsed = this._parser.parseMessage( message.content )
		if ( parsed.xp !== false )
		{
			/*logSprintf( 'msg', '[%s] %s: %s (%f XP)',
				message.channel.name,
				message.author ? message.author.username : '',
				message.content,
			xp )*/
			this._backend.userAddXP( message.author, message.member, parsed.xp )
			console.log( parsed )
		}
	}
	async onGuildUnavailable( guild )
	{
		logSprintf( 'nya', 'onGuildUnavailable' )
	}
	initialize()
	{
		return new Promise( ( resolve, reject ) =>
		{
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
				}
			}
			this._inviteLink = null
			this._client = new Discord.Client( this._opts )
			this._client.on( 'debug', this.onDebug )
			this._client.on( 'warn', this.onWarning )
			this._client.on( 'error', this.onError )
			this._client.on( 'invalidated', this.onInvalidated )
			this._client.on( 'ready', this.onReady )
			this._client.on( 'rateLimit', this.onRateLimit )
			this._client.on( 'shardReady', this.onShardReady )
			this._client.on( 'guildCreate', ( this.onGuildCreate ).bind( this ) )
			this._client.on( 'guildUpdate', ( this.onGuildUpdate ).bind( this ) )
			this._client.on( 'guildDelete', ( this.onGuildDelete ).bind( this ) )
			this._client.on( 'channelCreate', ( this.onChannelCreate ).bind( this ) )
			this._client.on( 'channelUpdate', ( this.onChannelUpdate ).bind( this ) )
			this._client.on( 'channelDelete', ( this.onChannelDelete ).bind( this ) )
			this._client.on( 'userUpdate', ( this.onUserUpdate ).bind( this ) )
			this._client.on( 'message', ( this.onMessage ).bind( this ) )
			this._client.on( 'guildUnavailable', this.onGuildUnavailable )
			resolve( true )
		})
	}
	async start()
	{
		let me = this;
		this._stoppedResolve = null
		this.stoppedPromise = new Promise( resolve => {
			me._stoppedResolve = resolve
		})
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