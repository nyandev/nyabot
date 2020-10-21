import Commando = require( 'discord.js-commando' )
import { Message, MessageEmbed, TextChannel } from 'discord.js'
import { ApiClient, HelixStream, HelixStreamType } from 'twitch'
import { ClientCredentialsAuthProvider } from 'twitch-auth'
import { ReverseProxyAdapter, Subscription, WebHookListener } from 'twitch-webhooks'

import { NyaInterface, ModuleBase } from '../modules/module'


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

    const guilds = this._service.guildsFollowing.get( username )
    if ( !guilds || !guilds.length ) {
      const subscription = await this._service.subscribe( username )
      if ( !subscription )
        return host.respondTo( message, 'twitchfollow_nonexistent', username )
    }

    if ( guilds )
      guilds.push( guild.id )
    else
      this._service.guildsFollowing.set( username, [guild.id] )

    subs.push( username )
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
    let guilds = this._service.guildsFollowing.get( username )
    if ( guilds ) {
      guilds = guilds.filter( ( x: number ) => x !== guild.id )
      if ( !guilds.length )
        await this._service.unsubscribe( username )
    }
    await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( subs ) )
    return host.respondTo( message, 'twitchunfollow_success', username )
  }
}


export class TwitchModule extends ModuleBase
{
  config: any
  authProvider: ClientCredentialsAuthProvider
  apiClient: ApiClient
  listener: WebHookListener
  channels: Map<number, string>
  guildsFollowing: Map<string, number[]>
  webhookSubscriptions: Map<string, Subscription>
  currentStates: Map<string, HelixStream | null>

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this.config = this._backend._config.twitch
    if ( !this.config.enabled )
      return

    this.authProvider = new ClientCredentialsAuthProvider( this.config.clientID, this.config.clientSecret )
    this.apiClient = new ApiClient( { authProvider: this.authProvider } )
    this.listener = new WebHookListener( this.apiClient, new ReverseProxyAdapter( {
      hostName: this.config.hostname,
      listenerPort: this.config.listenerPort,
      pathPrefix: this.config.path,
      port: this.config.port,
      ssl: this.config.ssl
    } ) )

    this.channels = new Map()
    this.currentStates = new Map()
    this.guildsFollowing = new Map()
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
            if ( this.guildsFollowing.has( username ) )
              ( this.guildsFollowing.get( username ) as number[] ).push( guildID )
            else
              this.guildsFollowing.set( username, [guildID] )
          } )
        }
      } )

      setInterval( () => {
        // TODO: ideally we'd refresh in the case of auth failure but this should work
        this.authProvider.refresh()
      }, 24 * 3600 * 1000 )

      for ( const username of this.guildsFollowing.keys() )
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
    if ( this.webhookSubscriptions.has( username ) )
      return
    const user = await this.apiClient.helix.users.getUserByName( username )
    if ( !user )
      return
    const subscription = await this.listener.subscribeToStreamChanges( user, async ( stream?: HelixStream ) => {
      console.log('STREAM:', stream)
      // subscribeToStreamChanges() fires in a number of scenarios, e.g. if the stream title changes,
      // so we identify going-live events by checking that `stream` was previously undefined
      if ( !stream || stream.type !== HelixStreamType.Live )
        return
      if ( !this.currentStates.get( username ) ) {
        const guilds = this.guildsFollowing.get( username )
        if ( !guilds )
          return
        for ( const guildID of guilds ) {
          const channelSnowflake = this.channels.get( guildID )
          if ( !channelSnowflake )
            return
          const channel = await this._client.channels.fetch( channelSnowflake )
          if ( !channel || channel.type !== 'text' )
            return

          console.log('user.name:', user.name)
          console.log('user.displayName:', user.displayName)
          console.log('user.description:', user.description)
          console.log('user type:', user.broadcasterType)
          console.log('user id:', user.id)
          console.log('user pfp:', user.profilePictureUrl)
          console.log(user.offlinePlaceholderUrl)

          const embed = new MessageEmbed()
            .setTitle( stream.title )
            .setURL( `https://www.twitch.tv/${user.name}` )
            .setAuthor( `${user.displayName} went live!`, user.profilePictureUrl )
            .setFooter( 'Twitch', 'https://www.twitch.tv/favicon.ico' )
            .setColor( 0x9147ff )
            .setTimestamp( stream.startDate )
          if ( user.name === 'neonyaparty' ) { // Dirty hardcoding :^)
            embed.setImage( 'https://pbs.twimg.com/profile_banners/1254529247630286848/1589539107/600x200' )
          } else {
            const imageURL = stream.thumbnailUrl.replace('{width}', '1920').replace('{height}', '1080')
          }

          const game = await stream.getGame()
          if ( game )
            embed.addField( 'Playing', game.name );

          ( channel as TextChannel ).send( embed ).catch( error => {
            if ( error.message !== 'Missing Permissions' )
              throw error
          } )
        }
      }
    } )
    if ( subscription ) {
      const stream = await this.apiClient.helix.streams.getStreamByUserId( user )
      this.currentStates.set( username, stream )
      console.log(`DEBUG set current state for ${username} to`, stream)
      this.webhookSubscriptions.set( username, subscription )
    }
    return subscription
  }

  async unsubscribe( username: string )
  {
    const subscription = this.webhookSubscriptions.get( username )
    if ( !subscription )
      return
    await subscription.stop()
    this.webhookSubscriptions.delete( username )
  }
}