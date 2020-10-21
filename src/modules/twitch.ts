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
      const setting = await backend.getGuildSetting( guild.id, settingKey )
      if ( !setting || !setting.value )
        return host.respondTo( message, 'twitchchannel_unset' )

      const channel = await client.channels.fetch( setting.value )
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


class TwitchImageCommand extends Commando.Command
{
  protected _service: TwitchModule

  constructor( service: TwitchModule, client: Commando.CommandoClient )
  {
    super( client, {
      name: 'twitchimage',
      group: 'twitch',
      memberName: 'twitchimage',
      description: "Set a custom image for a Twitch account to use in place of the stream preview.",
      args: [
        {
          key: 'username',
          prompt: "Enter a Twitch username.",
          type: 'string',
          default: ''
        },
        {
          key: 'url',
          prompt: 'Enter an image URL or "clear" to default to the stream preview.',
          type: 'string',
          default: ''
        }
      ],
      argsPromptLimit: 1
    } )
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    if ( !message.guild )
      return null

    const settingKey = 'TwitchImages'
    const host = this._service.getHost()
    const backend = host.getBackend()

    const guild = await backend.getGuildBySnowflake( message.guild.id )

    const setting = await backend.getGuildSetting( guild.id, settingKey )
    const images = ( setting && setting.value ) ? JSON.parse( setting.value ) : {}

    if ( !args.url ) {
      if ( args.username ) {
        if ( !images[args.username] ) {
          console.log(args)
          return host.respondTo( message, 'twitchimage_unset', args.username )
        }
        return host.respondTo( message, 'twitchimage_value', args.username, images[args.username] )
      } else {
        return host.respondTo( message, 'twitchimage_all', JSON.stringify(images) )
      }
    } else if ( args.url === 'clear' ) {
      delete images[args.username]
      await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( images ) )
      return host.respondTo( message, 'twitchimage_clear', args.username )
    } else {
        images[args.username] = args.url
        await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( images ) )
        return host.respondTo( message, 'twitchimage_set', args.username, args.url )
    }
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
      const client = this.getClient()
      return [
        new TwitchChannelCommand( this, client ),
        new TwitchImageCommand( this, client ),
        new TwitchFollowCommand( this, client ),
        new TwitchUnfollowCommand( this, client )
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
    const user = await this.apiClient.helix.users.getUserByName( username )
    if ( !user || this.webhookSubscriptions.has( user.name ) )
      return

    const subscription = await this.listener.subscribeToStreamChanges( user, async ( stream?: HelixStream ) => {
      // subscribeToStreamChanges() fires in a number of scenarios, e.g. if the stream title changes,
      // so we identify going-live events by checking that `stream` was previously undefined
      if ( stream && stream.type === HelixStreamType.Live && !this.currentStates.get( user.name ) ) {
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

          const embed = new MessageEmbed()
            .setTitle( stream.title )
            .setURL( `https://www.twitch.tv/${user.name}` )
            .setAuthor( `${user.displayName} went live!`, user.profilePictureUrl )
            .setFooter( 'Twitch', 'https://static.twitchcdn.net/assets/favicon-32-d6025c14e900565d6177.png' )
            .setColor( 0x9147ff )
            .setTimestamp( stream.startDate )

          let imageURL = null
          const imagesSetting = await this._backend.getGuildSetting( guildID, 'TwitchImages' )
          if ( imagesSetting && imagesSetting.value ) {
            const images = JSON.parse( imagesSetting.value )
            imageURL = images[user.name] || null
          }

          if ( imageURL )
            embed.setImage( imageURL )
          else
            embed.setImage( stream.thumbnailUrl.replace( '{width}', '1920' ).replace( '{height}', '1080' ) )

          const game = await stream.getGame()
          if ( game )
            embed.setDescription( `Playing **${game.name}**` );

          ( channel as TextChannel ).send( embed ).catch( error => {
            if ( error.message !== 'Missing Permissions' )
              throw error
          } )
        }
      }
      this.currentStates.set( user.name, stream || null )
    } )
    if ( subscription ) {
      const stream = await this.apiClient.helix.streams.getStreamByUserId( user )
      this.currentStates.set( user.name, stream )
      console.log(`[twitch] set current state for ${user.name} to`, stream)
      this.webhookSubscriptions.set( user.name, subscription )
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