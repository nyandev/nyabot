import { logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'

import Discord = require( 'discord.js' )
import Commando = require( 'discord.js-commando' )

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from './backend'
import { Parser } from './parser'
import { CommandCallbackType, NyaInterface, ModuleInterface } from '../modules/module'

import { XPModule } from '../modules/xp'

import SettingsProvider = require( './settingsprovider' )

export class Nya implements NyaInterface
{
	_config: any
	_backend: Backend
	_emitter: EventEmitter
	_parser: Parser
	_inviteLink: string
	_opts: Commando.CommandoClientOptions
	_client: Commando.CommandoClient
	stoppedPromise: any
	_stoppedResolve: any
	_modules: ModuleInterface[]
	makePresence(): Discord.PresenceData
	{
		return {
			status: 'online',
			afk: false,
			activity: null,
			shardID: 0
		}
	}
	registerCommand( name: string, cb: CommandCallbackType ): boolean
	{
		return false
	}
	registerModule( mod: ModuleInterface ): void
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
			prefix: config.prefix,
			msgEditableDuration: config.msgEditableDuration,
			longName: config.longName,
			iconURL: config.iconURL
		}
		this._backend = backend
		this._emitter = new EventEmitter()
		this._parser = new Parser( this._config.prefix )

		this.registerModule( new XPModule() )
	}
	getBackend(): Backend
	{
		return this._backend
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
	async onGuildCreate( dsGuild: Discord.Guild )
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
	async onGuildDelete( dsGuild: Discord.Guild )
	{
		let guild = await this._backend.upsertGuild( dsGuild )
		this._emitter.emit( 'guildDeleted', guild )
	}
	async onChannelCreate( dsChannel: Discord.Channel )
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
	async onChannelDelete( dsChannel: Discord.Channel )
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
	shouldCareAbout( user: any )
	{
		// currently we care about everyone that's not a bot
		return ( !user.bot )
	}
	buildEmbedTypical( title: string, description: string, fields: any[], footer: boolean ): Discord.MessageEmbed
	{
		const embed = new Discord.MessageEmbed()
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
	buildEmbedWelcome( user: Discord.User ): Discord.MessageEmbed
	{
		const description = sprintf( 'Welcome to the server, **%s**!\n```fix\nID: %s```', user.tag, user.id )
		const embed = this.buildEmbedTypical( 'New Member', description, [], false )
		embed.setThumbnail( user.displayAvatarURL() )
		return embed
	}
	async onMessage( message: Discord.Message )
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
			// console.log( parsed )
		}
		const cmd = this._parser.parseCommand( parsed )
		if ( cmd )
		{
			logSprintf( 'debug', 'Looks like a command: %s (%i args)', cmd.command, cmd.args.length )
			if ( cmd.command === 'test' && message.author )
			{
				const embed = this.buildEmbedWelcome( message.author )
				message.channel.send( embed )
				const guild = await this._backend.getGuildBySnowflake( message.guild.id )
				if ( guild )
				{
					//this._backend.setGuildSetting( guild.id, 'testsetting', 'cool value bro!' )
					//this._backend.setGuildSetting( guild.id, 'poop', 'yeehaw' )
					let ftch = await this._backend.getGuildSettings( guild.id )
					console.log( ftch )
				}
			}
		}
	}
	async onGuildUnavailable( guild: Discord.Guild )
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
				},
				owner: this._config.owners,
				commandPrefix: this._config.prefix,
				commandEditableDuration: this._config.msgEditableDuration
			}
			this._inviteLink = null
			this._client = new Commando.Client( this._opts )
			this._client
			  .on( 'debug', this.onDebug )
			  .on( 'warn', this.onWarning )
			  .on( 'error', this.onError )
			  .on( 'invalidated', this.onInvalidated )
			  .on( 'ready', this.onReady )
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
			this._client.setProvider( new SettingsProvider( this._backend ) )
			this._client.registry.registerDefaults()
			this._client.registry.registerGroup( 'xp' )
			this._client.registry.registerCommands( this._modules[0].getCommands( this, this._client ) )
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