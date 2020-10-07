import fetch from 'node-fetch'
import Commando = require( 'discord.js-commando' )
import { Message, TextChannel } from 'discord.js'

import { NyaInterface, ModuleBase } from '../modules/module'


class TwitterChannelCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
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

    const settingKey = 'TwitterChannel'
    const host = this._service.getHost()
    const backend = host.getBackend()
    const client = host.getClient()

    const guild = await backend.getGuildBySnowflake( message.guild.id )

    if ( !args.channel ) {
      const channelSetting = ( await backend.getGuildSetting( guild.id, settingKey ) )
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
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
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
        type: 'string'
      }],
      argsPromptLimit: 1
    } )
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const host = this._service.getHost()

    if ( false ) // TODO: if account is already being followed
      return host.respondTo( message, 'twitterfollow_already_following', 'username' )

    let username = args.username
    if ( username.startsWith( '@' ) )
      username = username.substr( 1 )
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

    // TODO: actually commit changes to DB
    return host.respondTo( message, 'twitterfollow_success', username )
  }
}

class TwitterUnfollowCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterunfollow',
      group: 'twitter',
      memberName: 'twitterunfollow',
      description: "Stop following a Twitter account.",
      args: [{
        key: 'handle',
        prompt: "Which Twitter account?",
        type: 'string'
      }],
      argsPromptLimit: 1
    } )
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] |
null>
  {
    const host = this._service.getHost()
    if ( false ) // TODO: if account wasn't being followed
      return host.respondTo( message, 'twitterunfollow_not_following' )
    return host.respondTo( message, 'twitterunfollow_success' )
  }
}


export class TwitterModule extends ModuleBase
{
  config: any

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

    for ( const guildID of [1] ) { // TODO: iterate over all guilds
      const redisKey = `latesttweet_${guildID}`

      setInterval( async () => {
        const channelSetting = await this._backend.getGuildSetting( guildID, 'TwitterChannel' )
        if ( !channelSetting )
          return
        const channel = await client.channels.fetch( channelSetting.value )
        if ( !channel || channel.type !== 'text' )
          return

        let twitterHandles = await this._backend.getGuildSetting( guildID, 'TwitterSubscriptions' )
        if ( !twitterHandles || !twitterHandles.value )
          return
        twitterHandles = JSON.parse( twitterHandles.value )
        const query = twitterHandles.map( (handle: string) => `from:${handle}` ).join(' OR ')

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
          const tweetIDs = response.data.map( (tweet: any) => tweet.id ).join(',')
          fetch(
            `https://api.twitter.com/2/tweets?ids=${tweetIDs}&tweet.fields=referenced_tweets,created_at&expansions=author_id`,
            fetchOpts
          )
          .then( (response: any) => response.json() )
          .then( (response: any) => {
            const users = response.includes.users

            // Filter out tweets that are retweets, quote tweets or replies
            const tweets = response.data.reverse().filter( (tweet: any) => !tweet.referenced_tweets )
            for ( const tweet of tweets ) {
              const user = users.find( (user: any) => user.id === tweet.author_id )
              const username = user ? user.name : tweet.author_id
              const handle = user ? user.username : 'i'
              const message: string = `**${username}** tweeted: https://twitter.com/${handle}/status/${tweet.id}`;
              ( channel as TextChannel ).send( message )
            }
          } )
        } )
      }, this.config.interval * 1000 )
    }
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
      return [
        new TwitterChannelCommand( this, this.getClient() ),
        new TwitterFollowCommand( this, this.getClient() ),
        new TwitterUnfollowCommand( this, this.getClient() )
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