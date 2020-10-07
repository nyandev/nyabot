import Commando = require( 'discord.js-commando' )
import { Message, TextChannel } from 'discord.js'
import { ApiClient, HelixStream } from 'twitch'
import { StaticAuthProvider } from 'twitch-auth'
import { ReverseProxyAdapter, Subscription, WebHookListener } from 'twitch-webhooks'

import { NyaInterface, ModuleBase } from '../modules/module'


/*
 * TODO: replace StaticAuthProvider with an auto-refreshing one
 *       (current access token was obtained manually and lasts for 60 days)
 */


class TwitchChannelCommand extends Commando.Command
{
  protected _service: TwitchModule

  constructor( service: TwitchModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitchchannel',
      group: 'twitch',
      memberName: 'twitchchannel',
      description: "Set a channel for posting stream notifications.",
      args: [{
        key: 'channel',
        prompt: "Which channel?",
        type: 'channel',
        default: ''
      }],
      argsPromptLimit: 1
    })
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    if ( !message.guild )
      return null

    const settingKey = 'TwitchChannel'
    const host = this._service.getHost()
    const backend = host.getBackend()
    const client = host.getClient()

    const guild = await backend.getGuildBySnowflake( message.guild.id )

    if ( !args.channel ) {
      const channelSetting = await backend.getGuildSetting( guild.id, settingKey )
      if ( !channelSetting || !channelSetting.value )
        return host.respondTo( message, 'twitchchannel_unset' )

      const channel = await client.channels.fetch( channelSetting.value )
      if ( !channel || channel.type !== 'text' )
        return host.respondTo( message, 'twitchchannel_unset' )

      return host.respondTo( message, 'twitchchannel_show', channel.id )
    }

    const channel = args.channel
    if ( channel.type !== 'text' ) // TODO: check that channel can be posted to?
      return host.respondTo( message, 'twitchchannel_fail' )

    this._service.channels.set( guild.id, channel.id )
    await backend.setGuildSetting( guild.id, settingKey, channel.id )
    return host.respondTo( message, 'twitchchannel_set', channel.id )
  }
}


class TwitchFollowCommand extends Commando.Command
{
  protected _service: TwitchModule

  constructor( service: TwitchModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitchfollow',
      group: 'twitch',
      memberName: 'twitchfollow',
      description: "Add a Twitch account to follow.",
      args: [{
        key: 'username',
        prompt: "Which Twitch account?",
        type: 'string',
        default: ''
      }],
      argsPromptLimit: 1
    } )
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const host = this._service.getHost()
    const backend = host.getBackend()

    const settingKey = 'TwitchSubscriptions'
    const guild = await backend.getGuildBySnowflake( message.guild.id )

    let subsSetting = await backend.getGuildSetting( guild.id, settingKey )
    let subs: string[]
    if ( subsSetting && subsSetting.value )
      subs = JSON.parse( subsSetting.value )
    else
      subs = []

    if ( !args.username ) {
      if ( !subs.length )
        return host.respondTo( message, 'twitchfollow_list_empty' )
      return host.respondTo( message, 'twitchfollow_list', subs.join(', ') )
    }

    const username = args.username

    if ( subs.includes( username ) )
      return host.respondTo( message, 'twitchfollow_already_following', username )

    if ( !/^\w+$/.test( username ) )
      return host.respondTo( message, 'twitchfollow_nonexistent', username )

// TODO: account existence check? not totally necessary
/*
    const config = this._service.getBackend()._config.twitch
    const fetchOpts = {
      headers: {
        Authorization: `Bearer ${config.bearerToken}`
      }
    }
    const accountExists = await fetch( `https://api.twitter.com/2/users/by/username/${username}`, fetchOpts )
      .then( response => response.json() )
      .then( response => !!response.data )

    if ( !accountExists )
      return host.respondTo( message, 'twitchfollow_nonexistent', username )
*/

    subs.push( username )
    const guildSubs = this._service.guildSubscriptions.get( username )
    if ( guildSubs ) {
      guildSubs.push( username )
      if ( guildSubs.length === 1 )
        await this._service.subscribe( username )
    } else {
      this._service.guildSubscriptions.set( username, [guild.id] )
      await this._service.subscribe( username )
    }
    await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( subs ) )
    return host.respondTo( message, 'twitchfollow_success', username )
  }
}


class TwitchUnfollowCommand extends Commando.Command
{
  protected _service: TwitchModule

  constructor( service: TwitchModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitchunfollow',
      group: 'twitch',
      memberName: 'twitchunfollow',
      description: "Stop following a Twitch account.",
      args: [{
        key: 'username',
        prompt: "Which Twitch account?",
        type: 'string'
      }],
      argsPromptLimit: 1
    } )
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] |
null>
  {
    const host = this._service.getHost()
    const backend = host.getBackend()

    const settingKey = 'TwitchSubscriptions'
    const guild = await backend.getGuildBySnowflake( message.guild.id )

    const username = args.username

    const subsSetting = await backend.getGuildSetting( guild.id, settingKey )
    if ( !subsSetting || !subsSetting.value )
      return host.respondTo( message, 'twitchunfollow_not_following', username )

    let subs = JSON.parse( subsSetting.value )
    if ( !subs.includes( username ) )
      return host.respondTo( message, 'twitchunfollow_not_following', username )

    subs = subs.filter( (x: string) => x !== username )
    let guildSubs = this._service.guildSubscriptions.get( username )
    if ( guildSubs ) {
      guildSubs = guildSubs.filter( ( x: number ) => x !== guild.id )
      if ( !guildSubs.length )
        await this._service.unsubscribe( username )
    }
    await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( subs ) )
    return host.respondTo( message, 'twitchunfollow_success', username )
  }
}


export class TwitchModule extends ModuleBase
{
  config: any
  apiClient: ApiClient
  listener: WebHookListener
  channels: Map<number, string>
  guildSubscriptions: Map<string, number[]>
  webhookSubscriptions: Map<string, Subscription>
  currentStates: Map<string, HelixStream | null>

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this.config = this._backend._config.twitch
    if ( !this.config.enabled )
      return

    this.apiClient = new ApiClient({
      authProvider: new StaticAuthProvider( this.config.clientID, this.config.accessToken )
    })
    this.listener = new WebHookListener( this.apiClient, new ReverseProxyAdapter( {
      hostName: this.config.hostname,
      listenerPort: this.config.listenerPort,
      pathPrefix: this.config.path,
      port: this.config.port,
      ssl: this.config.ssl
    } ) )

    this.channels = new Map()
    this.currentStates = new Map()
    this.guildSubscriptions = new Map()
    this.webhookSubscriptions = new Map()

    this.listener.listen().then( async () => {

      await this._backend._models.Guild.findAll( { attributes: ['id'] } ).then( async ( guilds: any[] ) => {
        for ( const guild of guilds ) {
          const guildID = guild.id

          const channelSetting = await this._backend.getGuildSetting( guildID, 'TwitchChannel' )
          if ( channelSetting && channelSetting.value ) {
            this.channels.set( guildID, channelSetting.value )
          }

          const subsSetting = await this._backend.getGuildSetting( guildID, 'TwitchSubscriptions' )
          if ( !subsSetting || !subsSetting.value )
            continue
          const subs = JSON.parse( subsSetting.value )

          subs.forEach( ( username: string ) => {
            if ( this.guildSubscriptions.has( username ) )
              ( this.guildSubscriptions.get( username ) as number[] ).push( guildID )
            else
              this.guildSubscriptions.set( username, [guildID] )
          } )
        }
      } )

      for ( const username of this.guildSubscriptions.keys() )
        this.subscribe( username )
    } )
  }

  async onMessage( msg: Message ): Promise<void>
  {
  }

  getGroups(): Commando.CommandGroup[]
  {
    if ( this.config.enabled ) {
      return [
        new Commando.CommandGroup( this.getClient(), 'twitch', 'Twitch', false )
      ]
    } else {
      return []
    }
  }

  getCommands(): Commando.Command[]
  {
    if ( this.config.enabled ) {
      return [
        new TwitchChannelCommand( this, this.getClient() ),
        new TwitchFollowCommand( this, this.getClient() ),
        new TwitchUnfollowCommand( this, this.getClient() )
      ]
    } else {
      return []
    }
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }

  async subscribe( username: string )
  {
    console.log('DEBUG 0')
    if ( this.webhookSubscriptions.has( username ) )
      return
    console.log('DEBUG 1')
    const user = await this.apiClient.helix.users.getUserByName( username )
    if ( !user )
      return
    console.log('DEBUG', user)
    this.currentStates.set( username, await this.apiClient.helix.streams.getStreamByUserId( user ) )
    const subscription = await this.listener.subscribeToStreamChanges( user, async ( stream?: HelixStream ) => {
      // subscribeToStreamChanges() fires in a number of scenarios, e.g. if the stream title changes,
      // so we identify going-live events by checking that `stream` was previously undefined
      if ( !stream )
        return
      if ( !this.currentStates.get( username ) ) {
        const guilds = this.guildSubscriptions.get( username )
        if ( !guilds )
          return
        for ( const guildID of guilds ) {
          const channelSnowflake = this.channels.get( guildID )
          if ( !channelSnowflake )
            return
          const channel = await this._client.channels.fetch( channelSnowflake )
          if ( !channel || channel.type !== 'text' )
            return
          const message = `**${stream.userDisplayName}** went live! https://www.twitch.tv/${username}`;
          ( channel as TextChannel ).send( message )
        }
      }
      this.currentStates.set( username, stream )
    } )
    this.webhookSubscriptions.set( username, subscription )
    console.log('DEBUG webhookSubscriptions', this.webhookSubscriptions)
  }

  unsubscribe( username: string )
  {
    console.log('DEBUG: unsubscribing from', username)
    const subscription = this.webhookSubscriptions.get( username )
    console.log('DEBUG: subscription:', subscription)
    if ( !subscription )
      return
    subscription.stop()
    this.webhookSubscriptions.delete( username )
    console.log('DEBUG webhookSubscriptions', this.webhookSubscriptions)
  }
}