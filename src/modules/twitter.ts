import fetch from 'node-fetch'
import * as Commando from 'discord.js-commando'
import { Message, TextChannel } from 'discord.js'

import { debug, log } from '../globals'
import { NyaInterface, ModuleBase } from '../modules/module'


function usersQuery( users: string[] ) {
  return users.map( (username: string) => `from:${username}` ).join(' OR ')
}


class TwitterChannelCommand extends Commando.Command
{
  protected _service: TwitterModule

  constructor( service: TwitterModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterchannel',
      group: 'twitter',
      memberName: 'twitterchannel',
      description: "Set a channel for posting tweets.",
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
      const channelSetting = await backend.getGuildSetting( guild.id, settingKey )
      if ( !channelSetting || !channelSetting.value )
        return host.respondTo( message, 'twitterchannel_unset' )

      const channel = await client.channels.fetch( channelSetting.value )
      if ( !channel || channel.type !== 'text' )
        return host.respondTo( message, 'twitterchannel_unset' )

      return host.respondTo( message, 'twitterchannel_show', channel.id )
    }

    const channel = args.channel
    if ( channel.type !== 'text' ) // TODO: check that channel can be posted to?
      return host.respondTo( message, 'twitterchannel_fail' )

    await backend.setGuildSetting( guild.id, settingKey, channel.id )
    return host.respondTo( message, 'twitterchannel_set', channel.id )
  }
}

class TwitterFollowCommand extends Commando.Command
{
  protected _service: TwitterModule

  constructor( service: TwitterModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterfollow',
      group: 'twitter',
      memberName: 'twitterfollow',
      description: "Add a Twitter account to follow.",
      args: [{
        key: 'username',
        prompt: "Which Twitter account?",
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
    const guild = await backend.getGuildBySnowflake( message.guild.id )

    let setting = await backend.getGuildSetting( guild.id, settingKey )
    let subs: string[]
    if ( setting && setting.value ) {
      try {
        subs = JSON.parse( setting.value )
        if ( !Array.isArray( subs ) ) {
          const message = `${settingKey} must be a JSON array.`
          log( message )
          throw new Error( message )
        }
      } catch ( error ) {
        subs = []
        await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( subs ) )
      }
    } else {
      subs = []
    }

    if ( !args.username ) {
      if ( !subs.length )
        return host.respondTo( message, 'twitterfollow_list_empty' )
      return host.respondTo( message, 'twitterfollow_list',
        subs.map( (username: string) => `@${username}` ).join(', ') )
    }

    let username = args.username
    if ( username.startsWith( '@' ) )
      username = username.substr( 1 )

    if ( subs.includes( username ) )
      return host.respondTo( message, 'twitterfollow_already_following', username )

    if ( !/^\w+$/.test( username ) )
      return host.respondTo( message, 'twitterfollow_nonexistent', username )

    const config = this._service.getBackend()._config.twitter
    const fetchOpts = {
      headers: {
        Authorization: `Bearer ${config.bearerToken}`
      }
    }
    const accountExists = await fetch( `https://api.twitter.com/2/users/by/username/${username}`, fetchOpts )
      .then( response => response.json() )
      .then( response => !!response.data )

    if ( !accountExists )
      return host.respondTo( message, 'twitterfollow_nonexistent', username )

    subs.push( username )
    if ( usersQuery( subs ).length > backend._config.twitter.queryLengthMax )
      return host.respondTo( message, 'twitterfollow_query_too_long', username )

    await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( subs ) )
    return host.respondTo( message, 'twitterfollow_success', username )
  }
}

class TwitterUnfollowCommand extends Commando.Command
{
  protected _service: TwitterModule

  constructor( service: TwitterModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterunfollow',
      group: 'twitter',
      memberName: 'twitterunfollow',
      description: "Stop following a Twitter account.",
      args: [{
        key: 'username',
        prompt: "Which Twitter account?",
        type: 'string'
      }],
      argsPromptLimit: 1
    } )
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] |
null>
  {
    if ( !message.guild )
      return null

    const settingKey = this._service.settingKeys.subscriptions
    const host = this._service.getHost()
    const backend = host.getBackend()

    const guild = await backend.getGuildBySnowflake( message.guild.id )
    let username = args.username
    if ( username.startsWith( '@' ) )
      username = username.substr( 1 )

    const setting = await backend.getGuildSetting( guild.id, settingKey )
    if ( !setting || !setting.value )
      return host.respondTo( message, 'twitterunfollow_not_following', username )

    let subs: string[]
    try {
      subs = JSON.parse( setting.value )
      if ( !Array.isArray( subs ) ) {
        const message = `${settingKey} must be a JSON array.`
        log( message )
        throw new Error( message )
      }
    } catch ( error ) {
      subs = []
      await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( subs ) )
    }

    if ( !subs.includes( username ) )
      return host.respondTo( message, 'twitterunfollow_not_following', username )

    subs = subs.filter( (x: string) => x !== username )
    await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( subs ) )
    return host.respondTo( message, 'twitterunfollow_success', username )
  }
}


export class TwitterModule extends ModuleBase
{
  config: any
  settingKeys = {
    channel: 'TwitterChannel',
    subscriptions: 'TwitterSubscriptions'
  }

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this.config = this._backend._config.twitter
    if ( !this.config.enabled )
      return

    const fetchOpts = {
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`
      }
    }
    const redis = this._backend._redis

    this._backend._models.Guild.findAll( { attributes: ['id'] } )
    .then( ( guilds: any[] ) => guilds.forEach( (guild: any) => {
      const guildID = guild.id
      const redisKey = `latesttweet_${guildID}`

      setInterval( async () => {
        const channelSetting = await this._backend.getGuildSetting( guildID, this.settingKeys.channel )
        if ( !channelSetting )
          return
        const channel = await client.channels.fetch( channelSetting.value )
        if ( !channel || channel.type !== 'text' )
          return

        let twitterHandles = await this._backend.getGuildSetting( guildID, this.settingKeys.subscriptions )
        if ( !twitterHandles || !twitterHandles.value )
          return
        twitterHandles = JSON.parse( twitterHandles.value )
        const query = usersQuery( twitterHandles )

        const latestTweet = await redis.get( redisKey )
        const since = latestTweet ? `&since_id=${latestTweet}` : ''
        fetch(
          `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${this.config.maxResults}&tweet.fields=author_id${since}`,
          fetchOpts
        )
        .then( (response: any) => response.json() )
        .then( (response: any) => {
          if ( response.meta.result_count === 0 )
            return

          redis.set( redisKey, response.meta.newest_id )
          const tweetIDs = response.data.map( ( tweet: any ) => tweet.id ).join( ',' )
          fetch(
            `https://api.twitter.com/2/tweets?ids=${tweetIDs}&tweet.fields=referenced_tweets,created_at&expansions=author_id`,
            fetchOpts
          )
          .then( ( response: any ) => response.json() )
          .then( ( response: any ) => {
            const users = response.includes.users

            // Filter out tweets that are retweets, quote tweets or replies
            const tweets = response.data.reverse().filter( ( tweet: any ) => !tweet.referenced_tweets )
            for ( const tweet of tweets ) {
              const user = users.find( (user: any) => user.id === tweet.author_id )
              const username = user ? user.name : tweet.author_id
              const handle = user ? user.username : 'i'
              const message: string = `**${username}** tweeted: https://twitter.com/${handle}/status/${tweet.id}`;
              ( channel as TextChannel ).send( message ).catch( error => {
                if ( error.message !== 'Missing Permissions' )
                  throw error
              } )
            }
          } )
        } )
      }, this.config.interval * 1000 )
    } ) )
  }

  async onMessage( msg: Message ): Promise<void>
  {
  }

  getGroups(): Commando.CommandGroup[]
  {
    if ( this.config.enabled ) {
      return [
        new Commando.CommandGroup( this.getClient(), 'twitter', 'Twitter', false )
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
        new TwitterChannelCommand( this, client ),
        new TwitterFollowCommand( this, client ),
        new TwitterUnfollowCommand( this, client )
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
}