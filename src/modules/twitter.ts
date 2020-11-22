import fetch from 'node-fetch'
import * as Commando from 'discord.js-commando'
import { Message, TextChannel } from 'discord.js'
import { sprintf } from 'sprintf-js'

import { debug, log } from '../globals'
import { NyaInterface, ModuleBase } from '../modules/module'


function usersQuery( users: string[] ) {
  return users.map( (username: string) => `from:${username}` ).join(' OR ')
}


class TwitterChannelCommand extends Commando.Command
{
  constructor( protected module: TwitterModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterchannel',
      group: 'twitter',
      memberName: 'twitterchannel',
      description: "Set a channel for posting tweets.",
      guildOnly: true,
      ownerOnly: true,
      args: [{
        key: 'channel',
        prompt: "Which channel?",
        type: 'text-channel',
        default: ''
      }],
      argsPromptLimit: 1
    } )
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const settingKey = this.module.settingKeys.channel
    const host = this.module.host
    const backend = this.module.backend
    const client = this.module.client

    let guild
    try {
      guild = await backend.getGuildBySnowflake( message.guild.id )
    } catch ( error ) {
      log( `Failed to fetch guild ${message.guild.id}:`, error )
      return host.respondTo( message, 'unexpected_error' )
    }

    if ( !args.channel ) {
      let setting
      try {
        setting = await backend.getGuildSetting( guild.id, settingKey )
      } catch ( error ) {
        log( `Failed to fetch ${settingKey} setting for guild ${guild.id}:`, error )
        return host.respondTo( message, 'unexpected_error' )
      }
      if ( !setting || !setting.value )
        return host.respondTo( message, 'twitterchannel_unset' )

      let channel
      try {
        channel = await client.channels.fetch( setting.value )
      } catch ( error ) {
        log( `Failed to fetch channel ${setting.value}:`, error )
        return host.respondTo( message, 'unexpected_error' )
      }
      if ( !channel || channel.type !== 'text' )
        return host.respondTo( message, 'twitterchannel_unset' )

      return host.respondTo( message, 'twitterchannel_show', channel.id )
    }

    const channel = args.channel
    if ( channel.type !== 'text' )  // TODO: redundant check since I found out Commando has a 'text-channel' type
      return host.respondTo( message, 'twitterchannel_fail' )
    // TODO: maybe check that we have permissions to post to this channel

    try {
      await backend.setGuildSetting( guild.id, settingKey, channel.id )
    } catch ( error ) {
      log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${channel.id}:`, error )
      return host.respondTo( message, 'unexpected_error' )
    }
    return host.respondTo( message, 'twitterchannel_set', channel.id )
  }
}


class TwitterChannelExceptionCommand extends Commando.Command
{
  constructor( protected module: TwitterModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterchannelexception',
      group: 'twitter',
      memberName: 'twitterchannelexception',
      description: "Set a channel different from the default for posting a particular user's tweets.",
      guildOnly: true,
      ownerOnly: true,
      args: [{
        key: 'username',
        prompt: "Enter a Twitter username.",
        type: 'string'
      },
      {
        key: 'channel',
        prompt: "Enter a channel.",
        type: 'text-channel'
      }],
      argsPromptLimit: 1
    } )
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const settingKey = this.module.settingKeys.channelExceptions
    const host = this.module.host
    const backend = this.module.backend
    const client = this.module.client

    let guild
    try {
      guild = await backend.getGuildBySnowflake( message.guild.id )
    } catch ( error ) {
      log( `Failed to fetch guild ${message.guild.id}:`, error )
      return host.respondTo( message, 'unexpected_error' )
    }

    let username = args.username
    if ( username.startsWith( '@' ) )
      username = username.substr( 1 )

    if ( !/^\w+$/.test( username ) )
      return host.respondTo( message, 'twitterchannelexception_bad_username' )

    const channel = args.channel

    let setting
    try {
      setting = await backend.getGuildSetting( guild.id, settingKey )
    } catch ( error ) {
      log( `Failed to fetch ${settingKey} setting for guild ${guild.id}:`, error )
      return host.respondTo( message, 'twitterchannelexception_fail' )
    }

    let channels
    if ( setting && setting.value ) {
      try {
        channels = JSON.parse( setting.value )
        if ( typeof channels !== 'object' )
          throw new Error( `${settingKey} must be a JSON object.` )
      } catch ( error ) {
        log( `The ${settingKey} setting of guild ${guild.id} was not a JSON object.` )
        channels = {}
        await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( channels ) )
      }
    } else {
      channels = {}
    }

    channels[username] = channel.id
    const jsonString = JSON.stringify( channels )
    try {
      await backend.setGuildSetting( guild.id, settingKey, jsonString )
    } catch ( error ) {
      log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${jsonString}:`, error )
      return host.respondTo( message, 'twitterchannelexception_fail' )
    }
    return host.respondTo( message, 'twitterchannelexception_set', username, channel.id )
  }
}


class TwitterFollowCommand extends Commando.Command
{
  constructor( protected module: TwitterModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterfollow',
      group: 'twitter',
      memberName: 'twitterfollow',
      description: "Add a Twitter account to follow.",
      guildOnly: true,
      ownerOnly: true,
      args: [{
        key: 'username',
        prompt: "Enter a Twitter account name.",
        type: 'string',
        default: ''
      }],
      argsPromptLimit: 1
    } )
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const settingKey = this.module.settingKeys.subscriptions
    const host = this.module.host
    const backend = this.module.backend
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

    const config = backend._config.twitter
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
    if ( usersQuery( subs ).length > backend._config.twitter.maxQueryLength )
      return host.respondTo( message, 'twitterfollow_query_too_long', username )

    await backend.setGuildSetting( guild.id, settingKey, JSON.stringify( subs ) )
    return host.respondTo( message, 'twitterfollow_success', username )
  }
}

class TwitterUnfollowCommand extends Commando.Command
{
  constructor( protected module: TwitterModule, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'twitterunfollow',
      group: 'twitter',
      memberName: 'twitterunfollow',
      description: "Stop following a Twitter account.",
      guildOnly: true,
      ownerOnly: true,
      args: [{
        key: 'username',
        prompt: "Enter Twitter a account name.",
        type: 'string'
      }],
      argsPromptLimit: 1
    } )
  }

  async run( message: Commando.CommandoMessage, args: any, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] |
null>
  {
    const settingKey = this.module.settingKeys.subscriptions
    const host = this.module.host
    const backend = this.module.backend

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
    channelExceptions: 'TwitterChannelExceptions',
    message: 'TwitterMessage',
    subscriptions: 'TwitterSubscriptions'
  }

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
    this.config = this.backend._config.twitter
    if ( !this.config.enabled )
      return

    const fetchOpts = {
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`
      }
    }
    const redis = this.backend._redis

    this.backend._models.Guild.findAll( { attributes: ['id'] } )
    .then( ( guilds: any[] ) => guilds.forEach( (guild: any) => {
      const guildID = guild.id
      const redisKey = `latesttweet_${guildID}`

      setInterval( async () => {
        const channelSetting = await this.backend.getGuildSetting( guildID, this.settingKeys.channel )
        if ( !channelSetting )
          return
        const channel = await client.channels.fetch( channelSetting.value )
        if ( !channel || channel.type !== 'text' )
          return

        let twitterHandles = await this.backend.getGuildSetting( guildID, this.settingKeys.subscriptions )
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
          if ( !response.meta || response.meta.result_count === 0 )
            return

          redis.set( redisKey, response.meta.newest_id )
          const tweetIDs = response.data.map( ( tweet: any ) => tweet.id ).join( ',' )
          fetch(
            `https://api.twitter.com/2/tweets?ids=${tweetIDs}&tweet.fields=referenced_tweets,created_at&expansions=author_id`,
            fetchOpts
          )
          .then( ( response: any ) => response.json() )
          .then( async ( response: any ) => {
            let exceptions
            try {
              const exceptionsSetting = await this.backend.getGuildSetting( guildID, this.settingKeys.channelExceptions )
              exceptions = JSON.parse( exceptionsSetting.value )
              if ( typeof exceptions !== 'object' )
                exceptions = null
            } catch ( _ ) {
              // ignore errors
            }

            const users = response.includes.users

            // Filter out tweets that are retweets, quote tweets or replies
            const tweets = response.data.reverse().filter( ( tweet: any ) => !tweet.referenced_tweets )
            for ( const tweet of tweets ) {
              const user = users.find( (user: any) => user.id === tweet.author_id )
              const username = user ? user.name : tweet.author_id
              const handle = user ? user.username : 'i'

              // TODO: Rename the old `channel` variable to `defaultChannel`.
              //       Or maybe, rather, have a !twitterdefaultchannel command
              //       instead of the fugly !twitterchannelexception.
              let realChannel = channel
              if ( handle !== 'i' && exceptions && exceptions[handle] ) {
                try {
                  realChannel = await client.channels.fetch( exceptions[handle] )
                } catch ( _ ) {
                  // ignore errors
                }
              }

              const template = await this.backend.getSetting( this.settingKeys.message, guildID )
              if ( !template ) {
                if ( template == null )
                  log( `Couldn't fetch ${this.settingKeys.message} setting, globally or for guild ${guildID}` )
                return
              }
              const url = `https://twitter.com/${handle}/status/${tweet.id}`
              const message = sprintf( template, { url, username } );

              ( realChannel as TextChannel ).send( message ).catch( error => {
                if ( error.message !== 'Missing Permissions' )
                  throw error
              } )
            }
          } )
          .catch( error => {
            log( `Failed to fetch information about guild ${guildID}'s tweets:`, error )
          } )
        } )
        .catch( error => {
          log( `Failed to fetch guild ${guildID}'s Twitter feed:`, error )
        } )
      }, this.config.interval * 1000 )
    } ) )
  }

  async onMessage( message: Message ): Promise<void>
  {
    console.log( message )
  }

  getGlobalSettingKeys() {
    return [this.settingKeys.message]
  }

  getGroups(): Commando.CommandGroup[]
  {
    if ( this.config.enabled ) {
      return [
        new Commando.CommandGroup( this.client, 'twitter', 'Twitter', false )
      ]
    } else {
      return []
    }
  }

  getCommands(): Commando.Command[]
  {
    if ( this.config.enabled ) {
      return [
        new TwitterChannelCommand( this, this.client ),
        new TwitterChannelExceptionCommand( this, this.client ),
        new TwitterFollowCommand( this, this.client ),
        new TwitterUnfollowCommand( this, this.client )
      ]
    } else {
      return []
    }
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}
