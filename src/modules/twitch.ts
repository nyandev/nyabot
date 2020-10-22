import Commando = require( 'discord.js-commando' )
import { Message, MessageEmbed, TextChannel } from 'discord.js'
import { ApiClient, HelixStream, HelixStreamType, HelixUser } from 'twitch'
import { ClientCredentialsAuthProvider } from 'twitch-auth'
import { ReverseProxyAdapter, Subscription, WebHookListener } from 'twitch-webhooks'

import { debug, log } from '../globals'
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

    const settingKey = this._service.settingKeys.channel
    const host = this._service.getHost()
    const backend = host.getBackend()
    const client = host.getClient()

    const guild = await backend.getGuildBySnowflake( message.guild.id )

    if ( !args.channel ) {
      let setting
      try {
        setting = await backend.getGuildSetting( guild.id, settingKey )
      } catch ( error ) {
        log( `Failed to fetch Twitch channel setting for guild ${guild.id}:`, error )
        return host.respondTo( message, 'unexpected' )
      }
      if ( !setting || !setting.value )
        return host.respondTo( message, 'twitchchannel_unset' )

      let channel
      try {
        channel = await client.channels.fetch( setting.value )
      } catch ( error ) { 
        log( `Failed to fetch channel ${setting.value}:`, error )
        return host.respondTo( message, 'unexpected' )
      }
      if ( !channel || channel.type !== 'text' )
        return host.respondTo( message, 'twitchchannel_unset' )

      return host.respondTo( message, 'twitchchannel_show', channel.id )
    }

    const channel = args.channel
    if ( channel.type !== 'text' )
      return host.respondTo( message, 'twitchchannel_fail' )

    try {
      await backend.setGuildSetting( guild.id, settingKey, channel.id )
    } catch ( error ) {
      log( `Failed to set Twitch channel to ${channel.id} in guild ${guild.id}:`, error )
      return host.respondTo( message, 'unexpected' )
    }
    this._service.channels.set( guild.id, channel.id )
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

    const settingKey = this._service.settingKeys.images
    const host = this._service.getHost()
    const backend = host.getBackend()

    let guild
    try {
      guild = await backend.getGuildBySnowflake( message.guild.id )
    } catch ( error ) {
      log( `Failed to fetch guild ${message.guild.id}:`, error )
      return host.respondTo( message, 'unexpected' )
    }

    let setting
    try {
      setting = await backend.getGuildSetting( guild.id, settingKey )
    } catch ( error ) {
      log( `Failed to fetch ${settingKey} setting for guild ${guild.id}:`, error )
      setting = null
    }

    let images
    if ( setting && setting.value ) {
      try {
        images = JSON.parse( setting.value )
        if ( typeof images !== 'object' )
          throw new Error( `The ${settingKey} setting must be a JSON object.` )
      } catch ( _ ) {
        log( `The ${settingKey} setting of guild ${guild.id} was not a JSON object.` )
        images = {}
        const jsonString = JSON.stringify( images )
        try {
          await backend.setGuildSetting( guild.id, settingKey, jsonString )
        } catch ( error ) {
          log( `Failed to set ${settingKey} for guild ${guild.id} to ${jsonString}:`, error )
          return host.respondTo( message, 'unexpected' )
        }
      }
    } else {
      images = {}
    }

    if ( !args.url ) {
      if ( args.username ) {
        if ( !images[args.username] ) {
          console.log(args)
          return host.respondTo( message, 'twitchimage_unset', args.username )
        }
        return host.respondTo( message, 'twitchimage_value', args.username, images[args.username] )
      } else {
        const entries = Object.entries( images )
        if ( !entries.length )
          return host.respondTo( message, 'twitchimage_none' )
        const imagesList = entries
          .map( ( [username, url] ) => `**${username}**\n${url}` )
          .join( '\n\n' )
        return host.respondTo( message, 'twitchimage_all', imagesList )
      }
    } else if ( args.url === 'clear' ) {
      delete images[args.username]
      const jsonString = JSON.stringify( images )
      try {
        await backend.setGuildSetting( guild.id, settingKey, jsonString )
      } catch ( error ) {
        log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${jsonString}:`, error )
        return host.respondTo( message, 'unexpected' )
      }
      return host.respondTo( message, 'twitchimage_clear', args.username )
    } else {
      images[args.username] = args.url
      const jsonString = JSON.stringify( images )
      try {
        await backend.setGuildSetting( guild.id, settingKey, jsonString )
      } catch ( error ) {
        log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${jsonString}:`, error )
        return host.respondTo( message, 'unexpected' )
      }
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
    if ( !message.guild )
      return null

    const settingKey = this._service.settingKeys.subscriptions
    const host = this._service.getHost()
    const backend = host.getBackend()

    let guild
    try {
      guild = await backend.getGuildBySnowflake( message.guild.id )
    } catch ( error ) {
      log( `Failed to fetch guild ${message.guild.id}:`, error )
      return host.respondTo( message, 'unexpected' )
    }

    let setting
    try {
      setting = await backend.getGuildSetting( guild.id, settingKey )
    } catch ( error ) {
      log( `Failed to fetch ${settingKey} setting for guild ${guild.id}:`, error )
      setting = null
    }

    let subs: string[]
    if ( setting && setting.value ) {
      try {
        subs = JSON.parse( setting.value )
        if ( !Array.isArray( subs ) )
          throw new Error( `${settingKey} must be a JSON array.` )
      } catch ( _ ) {
        log( `The ${settingKey} setting of guild ${guild.id} was not a JSON array.` )
        subs = []
        const jsonString = JSON.stringify( subs )
        try {
          await backend.setGuildSetting( guild.id, settingKey, jsonString )
        } catch ( error ) {
          log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${jsonString}:`, error )
          return host.respondTo( message, 'unexpected' )
        }
      }
    } else {
      subs = []
    }

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

    subs.push( username )
    const jsonString = JSON.stringify( subs )
    try {
      await backend.setGuildSetting( guild.id, settingKey, jsonString )
    } catch ( error ) {
      log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${jsonString}:`, error )
      return host.respondTo( message, 'unexpected' )
    }

    if ( guilds )
      guilds.push( guild.id )
    else
      this._service.guildsFollowing.set( username, [guild.id] )
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
    const settingKey = this._service.settingKeys.subscriptions
    const host = this._service.getHost()
    const backend = host.getBackend()

    let guild: any // TODO: how do I get the model type
    try {
      guild = await backend.getGuildBySnowflake( message.guild.id )
    } catch ( error ) {
      log( `Failed to fetch guild ${message.guild.id}:`, error )
      return host.respondTo( message, 'unexpected' )
    }

    let setting
    try {
      setting = await backend.getGuildSetting( guild.id, settingKey )
    } catch ( error ) {
      log( `Failed to fetch ${settingKey} setting for guild ${guild.id}:`, error )
      setting = null
    }

    const username = args.username
    if ( !setting || !setting.value )
      return host.respondTo( message, 'twitchunfollow_not_following', username )

    let subs: string[]
    try {
      subs = JSON.parse( setting.value )
      if ( !Array.isArray( subs ) )
        throw new Error( `The ${settingKey} setting must be a JSON array.` )
    } catch ( _ ) {
      log( `The ${settingKey} setting for guild ${guild.id} was not a JSON array.` )
      subs = []
      const jsonString = JSON.stringify( subs )
      try {
        await backend.setGuildSetting( guild.id, settingKey, jsonString )
      } catch ( error ) {
        log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${jsonString}:`, error )
        return host.respondTo( message, 'unexpected' )
      }
    }

    if ( !subs.includes( username ) )
      return host.respondTo( message, 'twitchunfollow_not_following', username )

    const guilds = this._service.guildsFollowing.get( username )
    let newGuilds: any[] = []
    if ( guilds ) {
      newGuilds = guilds.filter( ( x: number ) => x !== guild.id )
      if ( !newGuilds.length ) {
        try {
          await this._service.unsubscribe( username )
        } catch ( error ) {
          log( `Failed to unsubscribe from Twitch user ${username}:`, error )
          return host.respondTo( message, 'unexpected' )
        }
      }
    }

    subs = subs.filter( (x: string) => x !== username )
    const jsonString = JSON.stringify( subs )
    try {
      await backend.setGuildSetting( guild.id, settingKey, jsonString )
    } catch ( error ) {
      log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${jsonString}:`, error )
      return host.respondTo( message, 'unexpected' )
    }
    this._service.guildsFollowing.set( username, newGuilds )
    return host.respondTo( message, 'twitchunfollow_success', username )
  }
}


export class TwitchModule extends ModuleBase
{
  config: any
  authProvider: ClientCredentialsAuthProvider
  apiClient: ApiClient
  listener: WebHookListener
  channels: Map<number, string> = new Map()
  guildsFollowing: Map<string, number[]> = new Map()
  webhookSubscriptions: Map<string, Subscription> = new Map()
  currentStates: Map<string, HelixStream | null> = new Map()
  settingKeys = {
    channel: 'TwitchChannel',
    images: 'TwitchImages',
    subscriptions: 'TwitchSubscriptions'
  }

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

    this.listener.listen().then( async () => {
      await this._backend._models.Guild.findAll( { attributes: ['id'] } )
      .then( async ( guilds: any[] ) => {
        for ( const guild of guilds ) {
          let channelSetting
          try {
            channelSetting = await this._backend.getGuildSetting( guild.id, this.settingKeys.channel )
          } catch ( error ) {
            log( `Failed to fetch ${this.settingKeys.channel} setting for guild ${guild.id}:`, error )
            continue
          }

          if ( channelSetting && channelSetting.value ) {
            this.channels.set( guild.id, channelSetting.value )
          }

          let subsSetting
          try {
            subsSetting = await this._backend.getGuildSetting( guild.id, this.settingKeys.subscriptions )
          } catch ( error ) {
            log( `Failed to fetch ${this.settingKeys.subscriptions} setting for guild ${guild.id}:`, error )
            continue
          }
          if ( !subsSetting || !subsSetting.value )
            continue

          let subs: string[]
          try {
            subs = JSON.parse( subsSetting.value )
            if ( !Array.isArray ( subs ) )
              throw new Error( `The ${this.settingKeys.subscriptions} setting must be a JSON array.` )
          } catch ( error ) {
            log( `The ${this.settingKeys.subscriptions} setting for guild ${guild.id} was not a JSON array.` )
            continue
          }

          subs.forEach( ( username: string ) => {
            if ( this.guildsFollowing.has( username ) )
              ( this.guildsFollowing.get( username ) as number[] ).push( guild.id )
            else
              this.guildsFollowing.set( username, [guild.id] )
          } )
        }
      } )
      .catch( (error: any) => {
        log( "Failed to fetch guilds' Twitch subscriptions:", error )
      } )

      setInterval( () => {
        // TODO: ideally we'd refresh in the case of auth failure but this should work
        this.authProvider.refresh()
      }, 24 * 3600 * 1000 )

      const subPromises = [...this.guildsFollowing.keys()].map( this.subscribe )
      Promise.allSettled( subPromises ).then( (outcomes: any[]) => {
        for ( const outcome of outcomes ) {
          if ( outcome.status === 'rejected' )
            log( "A Twitch subscription failed:", outcome.reason )
        }
      } )
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
    let userOrNull: HelixUser | null
    try {
      userOrNull = await this.apiClient.helix.users.getUserByName( username )
    } catch ( error ) {
      log( `Failed to fetch data for Twitch user ${username}:`, error )
      return
    }

    if ( !userOrNull )
      return
    const user = userOrNull
    if ( this.webhookSubscriptions.has( user.name ) )
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
          let channel
          try {
            channel = await this._client.channels.fetch( channelSnowflake )
          } catch ( error ) {
            log( `Failed to fetch channel ${channelSnowflake}`, error )
            return
          }
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
          let imagesSetting
          try {
            imagesSetting = await this._backend.getGuildSetting( guildID, this.settingKeys.images )
          } catch ( error ) {
            log( `Failed to fetch ${this.settingKeys.images} setting for guild ${guildID}:`, error )
          }
          if ( imagesSetting && imagesSetting.value ) {
            const images = JSON.parse( imagesSetting.value )
            imageURL = images[user.name] || null
          }

          if ( imageURL )
            embed.setImage( imageURL )
          else
            embed.setImage( stream.thumbnailUrl.replace( '{width}', '1920' ).replace( '{height}', '1080' ) )

          let game
          try {
            game = await stream.getGame()
          } catch ( error ) {
            log( "Failed to fetch Twitch game:", error )
          }
          if ( game )
            embed.setDescription( `Playing **${game.name}**` );

          ( channel as TextChannel ).send( embed ).catch( error => {
            if ( error.message !== 'Missing Permissions' )
              log( `Failed to send Twitch notification to channel ${channelSnowflake}:`, error )
          } )
        }
      }
      this.currentStates.set( user.name, stream || null )
      debug(`[twitch] set current state for ${user.name} to`, stream || null)
    } )
    .catch( error => {
      log( `Failed to subscribe to Twitch stream changes for ${user.name}:`, error )
    } )

    if ( subscription ) {
      let stream
      try {
        stream = await this.apiClient.helix.streams.getStreamByUserId( user )
      } catch ( error ) {
        log( `Failed to fetch Twitch stream for ${user.name}:`, error )
      }
      this.currentStates.set( user.name, stream || null )
      debug(`[twitch] set current state for ${user.name} to`, stream || null)
      this.webhookSubscriptions.set( user.name, subscription )
    }
    return subscription
  }

  async unsubscribe( username: string )
  {
    const subscription = this.webhookSubscriptions.get( username )
    if ( !subscription )
      return
    try {
      await subscription.stop()
    } catch ( error ) {
      log( `Failed to stop Twitch subscription for ${username}:`, error )
    }
    this.webhookSubscriptions.delete( username )
  }
}
