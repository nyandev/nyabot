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
        key: 'target',
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
    const host = this._service.getHost()

    if ( !args.target ) {
      // TODO: show currently set channel
      if ( false ) // TODO: if unset
        return host.respondTo( message, 'twitterchannel_unset' )
      return host.respondTo( message, 'twitterchannel_show', '738183830069837907' )
    }

    console.log("!twitterchannel", args)
    if ( false ) // TODO: if channel is not a text channel or can't be posted to
      return host.respondTo( message, 'twitterchannel_fail' )
    return host.respondTo( message, 'twitterchannel_set', '738183830069837907' )
  }
}

class TwitterAddCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    // TODO: allow following multiple Twitter handles at once?
    super( client,
    {
      name: 'twitteradd',
      group: 'twitter',
      memberName: 'twitteradd',
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
    console.log("!twitteradd", args)
    if ( false ) // TODO: if account is already being followed
      return host.respondTo( message, 'twitteradd_already_following', 'username' )

    let username = args.username
    if ( username.startsWith( '@' ) )
      username = username.substr( 1 )
    if ( !/^\w+$/.test( username ) )
      return host.respondTo( message, 'twitteradd_nonexistent', username )

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
      return host.respondTo( message, 'twitteradd_nonexistent', username )

    // TODO: actually commit changes to DB
    return host.respondTo( message, 'twitteradd_success', username )
  }
}

class TwitterDeleteCommand extends Commando.Command
{
  protected _service: ModuleBase

  constructor( service: ModuleBase, client: Commando.CommandoClient )
  {
    // TODO: allow unfollowing multiple Twitter handles at once?
    super( client,
    {
      name: 'twitterdel',
      group: 'twitter',
      memberName: 'twitterdel',
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
    console.log("!twitterdel", args)
    if ( false ) // TODO: if account wasn't being followed
      return host.respondTo( message, 'twitterdel_notfollowing' )
    return host.respondTo( message, 'twitterdel' )
  }
}


export class TwitterModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )

    const config = this._backend._config.twitter
    const fetchOpts = {
      headers: {
        Authorization: `Bearer ${config.bearerToken}`
      }
    }
    const redis = this._backend._redis

    for ( const guildID of [1] ) { // TODO
      // TODO: get channel from DB
      let channel = client.channels.cache.get( '738183830069837907' )
      if ( !( channel instanceof TextChannel ) )
        continue

      const redisKey = `latesttweet_${guildID}`

      setInterval( async function() {
        // TODO: get accounts from DB
        const accounts = ['ahogeez', 'ahogasm', 'neonyaparty', 'neonyastream']
        const query = accounts.map( (handle: string) => `from:${handle}` ).join(' OR ')

        const latestTweet = await redis.get( redisKey )
        const since = latestTweet ? `&since_id=${latestTweet}` : ''
        fetch(
          `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${config.maxResults}&tweet.fields=author_id${since}`,
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
      }, config.interval * 1000 )
    }
  }

  async onMessage( msg: Message ): Promise<void>
  {
  }

  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.getClient(), 'twitter', 'Twitter', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new TwitterChannelCommand( this, this.getClient() ),
      new TwitterAddCommand( this, this.getClient() ),
      new TwitterDeleteCommand( this, this.getClient() )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}