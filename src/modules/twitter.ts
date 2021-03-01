import fetch from 'node-fetch'
import { Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { Message, TextChannel } from 'discord.js'
import { sprintf } from 'sprintf-js'

import { apos, debug, log } from '../globals'
import { Backend } from '../lib/backend'
import { Arguments, CommandOptions, NyaBaseCommand, NyaCommand, Subcommands } from '../lib/command'
import { NyaInterface, ModuleBase } from './module'

import * as Models from '../models'

// TODO: move this to Backend#getGuildByMessage?
async function fetchGuild( message: CommandoMessage, backend: Backend )
{
  let guild
  try {
    guild = await backend.getGuildBySnowflake( message.guild.id )
    if ( !guild )
      throw new Error( `getGuildBySnowflake returned ${guild}` )
  } catch ( error ) {
    log( `Couldn't fetch guild ${message.guild.id}:`, error )
    throw error
  }
  return guild
}


// TODO: should use moment I guess
function isValidDate( date: Date ): boolean
{
  return !Number.isNaN( date.getTime() )
}


function profileURL( account: string )
{
  return `https://twitter.com/${account}`
}


function queryString( accounts: string[] ) {
  return accounts.map( ( account: string ) => `from:${account}` ).join(' OR ')
}


class TwitterListCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "List all Twitter accounts followed by this guild."
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const host = this.module.host
    const talk = host.talk

    let guild
    try {
      guild = await fetchGuild( message, backend )
    } catch ( _ ) {
      return talk.unexpectedError( message )
    }

    let subscriptions
    try {
      const setting = await backend.getGuildSetting( guild.id, this.module.settingKeys.subscriptions )
      subscriptions = JSON.parse( setting.value || '{}' )
    } catch ( error ) {
      log( `Couldn't fetch Twitter subscriptions for guild ${guild.id}:`, error )
      return talk.unexpectedError( message )
    }
    const sortedSubscriptions: [string, TwitterSubscriptionOptions][] = Object.entries( subscriptions )
    sortedSubscriptions.sort( ( a, b ) => {
      if ( a[0].toLowerCase() < b[0].toLowerCase() ) return -1
      if ( a[0].toLowerCase() > b[0].toLowerCase() ) return 1
      return 0
    } )
    if ( sortedSubscriptions.length === 0 )
      return host.respondTo( message, 'twitter_list_empty' )

    let defaultChannel = null
    try {
      const setting = await backend.getGuildSetting( guild.id, this.module.settingKeys.defaultChannel )
      if ( setting && setting.value != null ) {
        const channel = await backend.getChannelByID( setting.value )
        if ( channel )
          defaultChannel = channel.snowflake
        else
          throw new Error( `getChannelByID(${setting.value}) returned ${channel}` )
      }
    } catch ( error ) {
      log( `Couldn't fetch ${this.module.settingKeys.defaultChannel} setting for guild ${guild.id}:`, error )
    }

    // TODO: get language from a guild/global setting or something
    const language = 'en'
    const lines = []
    for ( const [account, options] of sortedSubscriptions ) {
      const types = [host.messages['tweet_type_tweets']]
      if ( options.retweets )
        types.push( host.messages['tweet_type_retweets'] )
      if ( options.quoteTweets )
        types.push( host.messages['tweet_type_quotetweets'] )
      if ( options.replies )
        types.push( host.messages['tweet_type_replies'] )
      const typesString = host.talk.joinList[language]( types )

      const args = [account, profileURL( account ), typesString]
      if ( options.channel != null ) {
        try {
          const channel = await backend.getChannelByID( options.channel )
          if ( !channel )
            throw new Error( `getChannelByID returned ${channel}` )
          args.push( channel.snowflake )
          lines.push( {
            messageID: 'twitter_list_line',
            args
          } )
        } catch ( error ) {
          log( `Couldn't fetch channel ${options.channel}:`, error )
          lines.push( {
            messageID: 'twitter_list_line_invalid_channel',
            args
          } )
        }
      } else {
        if ( defaultChannel ) {
          args.push( defaultChannel )
          lines.push( {
            messageID: 'twitter_list_line_default_channel',
            args
          } )
        } else {
          lines.push( {
            messageID: 'twitter_list_line_default_channel_unset',
            args
          } )
        }
      }
    }
    return talk.sendMultilineResponse( message, lines )
  }
}


class TwitterChannelDefaultClearCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Clear the default channel for posting Twitter notifications.",
    ownerOnly: true
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const host = this.module.host
    const settingKey = this.module.settingKeys.defaultChannel

    let guild
    try {
      guild = await fetchGuild( message, backend )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
    }

    let oldChannel = null
    try {
      const channelSetting = await backend.getGuildSetting( guild.id, settingKey )
      if ( channelSetting && channelSetting.value != null ) {
        oldChannel = await backend.getChannelByID( channelSetting.value )
      }
    } catch ( error ) {
      log( `Couldn't fetch default Twitter channel of guild ${guild.id}:`, error )
    }

    try {
      // TODO: check return value
      await backend.removeGuildSetting( guild.id, settingKey )
    } catch ( error ) {
      log( `Failed to remove ${settingKey} setting of guild ${guild.id}:`, error )
      if ( oldChannel )
        return host.respondTo( message, 'twitter_channel_default_clear_error_previously_set', oldChannel.snowflake )
      return host.respondTo( message, 'twitter_channel_default_clear_error_previously_unset' )
    }
    if ( oldChannel )
      return host.respondTo( message, 'twitter_channel_default_clear_previously_set', oldChannel.snowflake )
    return host.respondTo( message, 'twitter_channel_default_clear_previously_unset' )
  }
}


class TwitterChannelDefaultSetCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Set the default channel for posting Twitter notifications.",
    ownerOnly: true,
    args: [
      { key: 'channel', type: 'text-channel' }
    ]
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const host = this.module.host
    const settingKey = this.module.settingKeys.defaultChannel

    let guild
    try {
      guild = await fetchGuild( message, backend )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
    }

    // TODO: how do I specify a DB model type
    let oldChannel: any = null
    try {
      const channelSetting = await backend.getGuildSetting( guild.id, settingKey )
      if ( channelSetting && channelSetting.value != null ) {
        oldChannel = await backend.getChannelByID( channelSetting.value )
        if ( !oldChannel ) 
          throw new Error( `Backend#getChannelByID(${channelSetting.value}) returned ${oldChannel}` )
        }
    } catch ( error ) {
      log( `Couldn't fetch ${settingKey} setting for guild ${guild.id}:`, error )
    }

    const error = () => {
      if ( oldChannel )
        return host.talk.sendError( message, ['twitter_channel_default_set_error_previously_set', oldChannel.snowflake] )
      return host.talk.sendError( message, 'twitter_channel_default_set_error_previously_unset' )
    }

    // If args.channel is a string, it contains an error message ID
    if ( typeof args.channel === 'string' )
      return host.talk.sendError( message, args.channel )

    if ( !( args.channel instanceof TextChannel ) )
      return host.talk.sendError( message, 'channel_not_found_by_name' )

    let channel
    try {
      channel = await backend.getChannelBySnowflake( args.channel.id )
      if ( !channel )
        throw new Error( `Backend#getChannelBySnowflake(${args.channel.id}) returned ${channel}` )
    } catch ( error ) {
      log( `Couldn't fetch channel ${args.channel.id}:`, error )
      return error()
    }

    try {
      // TODO: check return value
      await backend.setGuildSetting( guild.id, settingKey, channel.id )
    } catch ( error ) {
      log( `Failed to set ${settingKey} setting for guild ${guild.id} to ${channel.id}:`, error )
      return error()
    }

    if ( oldChannel ) {
      if ( channel.snowflake === oldChannel.snowflake )
        return host.talk.sendSuccess( message, ['twitter_channel_default_set_no_change', channel.snowflake] )
      return host.talk.sendSuccess( message, ['twitter_channel_default_set_previously_set', channel.snowflake, oldChannel.snowflake] )
    }
    return host.talk.sendSuccess( message, ['twitter_channel_default_set_previously_unset', channel.snowflake] )
  }
}


class TwitterChannelDefaultCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Show the default channel for posting Twitter notifications."
  }
  static subcommands = {
    clear: TwitterChannelDefaultClearCommand,
    set: TwitterChannelDefaultSetCommand
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    const host = this.module.host
    const settingKey = this.module.settingKeys.defaultChannel

    let guild
    try {
      guild = await fetchGuild( message, backend )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
    }

    let channel
    try {
      const channelSetting = await backend.getGuildSetting( guild.id, settingKey )
      if ( channelSetting && channelSetting.value != null ) {
        channel = await backend.getChannelByID( channelSetting.value )
        if ( !channel )
          throw new Error( `Backend#getChannelByID(${channelSetting.value}) returned ${channel}` )
      }
    } catch ( error ) {
      log( `Couldn't fetch ${settingKey} setting for guild ${guild.id}:`, error )
    }

    if ( !channel )
      return host.talk.sendText( message, 'twitter_channel_default_get_unset' )
    return host.talk.sendText( message, 'twitter_channel_default_get', channel.snowflake )
  }
}


class TwitterChannelGetCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: `Show which channel a Twitter account${apos}s notifications are being posted to.`,
    args: [
      { key: 'account', type: 'string' }
    ]
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    let accountArg = args.account as string

    const backend = this.module.backend
    const host = this.module.host

    let guild
    try {
      guild = await fetchGuild( message, backend )
    } catch ( error ) {
      return host.talk.unexpectedError( message )
    }

    let subscriptions
    try {
      const setting = await backend.getGuildSetting( guild.id, this.module.settingKeys.subscriptions )
      subscriptions = Object.entries( JSON.parse( setting.value || '{}' ) )
    } catch ( error ) {
      log( `Couldn't fetch Twitter subscriptions for guild ${guild.id}:`, error )
      return host.talk.unexpectedError( message )
    }

    if ( accountArg.startsWith( '@' ) )
      accountArg = accountArg.substring( 1 )

    subscriptions = subscriptions.filter( ( [account, options] ) => {
      return accountArg.toLowerCase() === account.toLowerCase()
    } )

    if ( subscriptions.length === 0 )
      return host.talk.sendText( message, 'twitter_channel_get_not_following', accountArg, profileURL( accountArg ) )

    if ( subscriptions.length > 1 ) {
      log(
        `Twitter account @${accountArg.toLowerCase()} is contained in guild ${guild.id}'s ${this.module.settingKeys.subscriptions} under multiple capitalizations:`,
        subscriptions.map( ( [account, _] ) => account )
      )
      return host.talk.unexpectedError( message )
    }

    const [account, options] = subscriptions[0] as [string, TwitterSubscriptionOptions]
    const linkArgs = [account, profileURL( account )]

    let validChannelSetting = true
    if ( options.channel != null ) {
      let channel
      try {
        channel = await backend.getChannelByID( options.channel )
        if ( !channel )
          throw new Error( `getChannelByID returned ${channel}` )
      } catch ( error ) {
        log( `Couldn't fetch channel ${options.channel}:`, error )
        validChannelSetting = false
      }

      if ( validChannelSetting )
        return host.talk.sendText( message, 'twitter_channel_get', ...linkArgs, channel.snowflake )
    }

    let defaultChannel = null
    let validDefaultChannelSetting = true
    try {
      const setting = await backend.getGuildSetting( guild.id, this.module.settingKeys.defaultChannel )
      if ( setting && setting.value != null ) {
        defaultChannel = await backend.getChannelByID( setting.value )
        if ( !defaultChannel )
          validDefaultChannelSetting = false
      }
    } catch ( error ) {
      log( `Failed to fetch ${this.module.settingKeys.defaultChannel} setting for guild ${guild.id}:`, error )
    }

    if ( !defaultChannel ) {
      if ( !validChannelSetting && !validDefaultChannelSetting )
        return host.talk.sendText( message, 'twitter_channel_get_unset_invalid_both', ...linkArgs )
      if ( !validDefaultChannelSetting )
        return host.talk.sendText( message, 'twitter_channel_get_unset_invalid_default', ...linkArgs )
      return host.talk.sendText( message, 'twitter_channel_get_unset', ...linkArgs )
    }
    if ( !validChannelSetting )
      return host.talk.sendText( message, 'twitter_channel_get_default_invalid_specific', ...linkArgs, defaultChannel.snowflake )
    return host.talk.sendText( message, 'twitter_channel_get_default', ...linkArgs, defaultChannel.snowflake )
  }
}


class TwitterChannelSetCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Set a channel for posting notifications from a Twitter account.",
    ownerOnly: true,
    args: [
      { key: 'account', type: 'string' },
      { key: 'channel', type: 'text-channel' }
    ]
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    let accountArg = args.account as string

    const host = this.module.host

    // If args.channel is a string, it contains an error message ID
    if ( typeof args.channel === 'string' )
      return host.talk.sendError( message, args.channel )

    if ( args.channel instanceof TextChannel )
      return host.respondTo( message, 'twitter_channel_set', accountArg, profileURL( accountArg ), args.channel.id )
    return null
  }
}


class TwitterChannelCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Show or modify the channels used for Twitter notifications.",
    dummy: true
  }
  static subcommands = {
    default: TwitterChannelDefaultCommand,
    get: TwitterChannelGetCommand,
    set: TwitterChannelSetCommand
  }
}


class TwitterFollowCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Follow a Twitter account or change which types of tweets are posted.",
    ownerOnly: true,
    args: [
      { key: 'account', type: 'string' },
      { key: 'tweetTypes', helpKey: 'tweet type', catchAll: true, optional: true, type: 'string' }
    ]
  }

  constructor( public module: ModuleBase, options: { name: string, baseGuildOnly: boolean, baseOwnerOnly: boolean } )
  {
    super( module, options )
    const tweetTypes = Object.keys( ( module as TwitterModule ).tweetTypes ).filter( type => type !== 'tweets' ).join( ', ' )
    this.options.usageNotes = `\`<tweet type>\` can be one of: ${tweetTypes}`
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const module = this.module as TwitterModule
    const backend = module.backend
    const host = module.host

    const language = 'en'
    const tweetTypes = args.tweetTypes as string[]
    const validTweetTypes = Object.keys( module.tweetTypes )
    const validTweetTypesLower = validTweetTypes.map( type => type.toLowerCase() )
    const invalidTweetTypes = []

    for ( const type of tweetTypes ) {
      if ( !validTweetTypesLower.includes( type.toLowerCase() ) )
        invalidTweetTypes.push( type )
    }
    if ( invalidTweetTypes.length > 0 )
      return module.host.talk.sendError( message, ['twitter_follow_invalid_tweet_types', host.talk.joinList[language]( invalidTweetTypes )] )

    let account = args.account as string
    if ( account.startsWith( '@' ) )
      account = account.substring( 1 )

    const tweetTypesString = 'tweets and retweets'
    return module.host.talk.sendSuccess( message, ['twitter_follow_new', tweetTypesString, account, profileURL( account )] )
  }
}


class TwitterCommand extends NyaBaseCommand
{
  constructor( protected module: TwitterModule )
  {
    super( module,
    {
      name: 'twitter',
      group: 'twitter',
      description: `Post this guild${apos}s Twitter link(s).`,
      guildOnly: true,
      subcommands: {
        channel: TwitterChannelCommand,
        follow: TwitterFollowCommand,
        list: TwitterListCommand
      }
    } )
  }

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    let setting
    try {
      const guild = await backend.getGuildBySnowflake( message.guild.id )
      setting = await this.module.backend.getSetting(
        this.module.settingKeys.defaultMessage, guild.id )
      if ( setting == null )
        throw new Error( `getSetting(...) == null` )
    } catch ( error ) {
      log( `Couldn't fetch ${this.module.settingKeys.defaultMessage} setting, globally or for guild ${message.guild.id}:`, error )
      return message.say( "Unexpected error." )
    }

    // An empty string is fine, but we can't send that
    if ( !setting )
      return null
    return message.say( setting )
  }
}


interface IntervalStatus {
  id: NodeJS.Timeout | null
  cleared: boolean
  accounts: string[]
  queryLength: number
  latestTweet?: string
}

interface TwitterSubscriptionOptions {
  channel?: number
  message?: string
  quoteTweets?: boolean
  replies?: boolean
  retweets?: boolean
}

interface TwitterConfigDisabled {
  enabled: false
  [key: string]: any
}

interface TwitterConfigEnabled {
  enabled: true
  bearerToken: string
  interval: number
  maxQueryLength: number
  maxResults: number
}

interface TwitterUser {
  id: string
  name: string
  username: string
}

type TwitterConfig = TwitterConfigDisabled | TwitterConfigEnabled

function getTwitterUserByID( id: string, users: TwitterUser[] ): TwitterUser | null
{
  return users.find( user => user.id === id ) || null
}

export class TwitterModule extends ModuleBase
{
  config: TwitterConfig
  intervals: IntervalStatus[] = []
  settingKeys = {
    defaultChannel: 'TwitterDefaultChannel',
    defaultMessage: 'TwitterDefaultMessage',
    message: 'TwitterMessage',
    subscriptions: 'TwitterSubscriptions'
  }
  subscriptions: Map<string, Map<number, TwitterSubscriptionOptions>> = new Map()
  tweetTypes = {
    quoteTweets: this.host.messages.tweet_type_quotetweets,
    replies: this.host.messages.tweet_type_replies,
    retweets: this.host.messages.tweet_type_retweets,
    tweets: this.host.messages.tweet_type_tweets
  }

  constructor( id: number, host: NyaInterface, client: CommandoClient )
  {
    super( id, host, client )
    this.config = this.backend._config.twitter
    if ( !this.config.enabled )
      return

    this.initializeSubscriptions().then( () => {
      this.refreshIntervals()
    } )
  }

  async onMessage( message: Message ): Promise<void>
  {
  }

  get activeIntervals(): IntervalStatus[]
  {
    return this.intervals.filter( interval => !interval.cleared )
  }

  getGlobalSettingKeys() {
    return [
      this.settingKeys.defaultMessage,
      this.settingKeys.message,
    ]
  }

  getGroups(): CommandGroup[]
  {
    if ( this.config.enabled ) {
      return [
        new CommandGroup( this.client, 'twitter', 'Twitter', false )
      ]
    } else {
      return []
    }
  }

  getCommands(): Command[]
  {
    if ( this.config.enabled ) {
      return [
        new TwitterCommand( this )
      ]
    } else {
      return []
    }
  }

  inActiveInterval( account: string ): boolean
  {
    for ( const interval of this.activeIntervals ) {
      if ( interval.accounts.includes( account ) )
        return true
    }
    return false
  }

  async initializeSubscriptions()
  {
    const redis = this.backend._redis
    const fetchOpts = {
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`
      }
    }

    const guilds = await this.backend._models.Guild.findAll( { attributes: ['id'] } )
    for ( const guild of guilds ) {
      const redisKey = `latesttweet_${guild.id}`
      const subscriptionsSetting = await this.backend.getGuildSetting( guild.id, this.settingKeys.subscriptions )
      if ( !subscriptionsSetting || !subscriptionsSetting.value )
        continue

      let channels
      try {
        channels = JSON.parse( subscriptionsSetting.value )
        if ( typeof channels !== 'object' )
          throw new Error( `The ${this.settingKeys.subscriptions} setting for guild ${guild.id} was not a JSON object.` )
      } catch ( error ) {
        log( `Couldn't parse ${this.settingKeys.subscriptions} setting for guild ${guild.id}:`, error )
        continue
      }

      for ( const [account, options] of Object.entries( channels ) ) {
        let guildOptions = this.subscriptions.get( account )
        if ( !guildOptions )
          guildOptions = new Map()
        guildOptions.set( guild.id, ( options as TwitterSubscriptionOptions ) )
        this.subscriptions.set( account, guildOptions )
      }
    }
  }

  refreshIntervals(): void
  {
    for ( const account of this.subscriptions.keys() ) {
      if ( this.inActiveInterval( account ) )
        continue

      // Add new subscriptions not already in an interval
      let addedToExistingInterval = false
      for ( const interval of this.activeIntervals ) {
        const newLength = interval.queryLength + ( ` OR from:${account}` ).length
        if ( newLength <= this.config.maxQueryLength ) {
          interval.accounts.push( account )
          interval.queryLength = newLength
          addedToExistingInterval = true
          break
        }
      }

      if ( !addedToExistingInterval ) {
        const newAccounts = [account]
        const newStatus: IntervalStatus = {
          id: null,
          cleared: false,
          accounts: newAccounts,
          queryLength: queryString( newAccounts ).length
        }
        const index = this.intervals.push( newStatus ) - 1
        newStatus.id = setInterval( () => {
          this.runInterval( index )
        }, this.config.interval * 1000 )
      }
    }

    // Remove accounts no guild subscribes to anymore
    const emptyIntervals = []
    for ( const interval of this.intervals ) {
      for ( const account of interval.accounts ) {
        if ( !this.subscribedTo( account ) ) {
          let index
          while ( ( index = interval.accounts.indexOf( account ) ) !== -1 )
            interval.accounts.splice( index, 1 )

          if ( interval.accounts.length === 0 )
            emptyIntervals.push( interval )
        }
      }
    }
    for ( const interval of emptyIntervals ) {
      interval.cleared = true
      interval.queryLength = 0
      if ( interval.id !== null )
        clearInterval( interval.id )
    }
  }

  async runInterval( index: number )
  {
    const interval = this.intervals[index]
    if ( !interval )
      return

    const redis = this.backend._redis
    const fetchOptions = {
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`
      }
    }
    const redisKey = ( account: string ) => `latesttweet:${account}`

    const query = queryString( interval.accounts )
    let recentsURL = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${this.config.maxResults}`
    if ( interval.latestTweet )
      recentsURL += `&since_id=${interval.latestTweet}`

    let recentTweets
    try {
      const response = await fetch( recentsURL, fetchOptions )
      recentTweets = await response.json()
      if ( !recentTweets.meta ) {
        // interval.latestTweet might be too old
        delete interval.latestTweet
        throw new Error( "Response for recent tweet lookup has no `meta` field." )
      }
    } catch ( error ) {
      log( `Couldn't fetch tweets in interval ${index}:`, error )
      return
    }

    if ( recentTweets.meta.newest_id )
      interval.latestTweet = recentTweets.meta.newest_id

    if ( recentTweets.meta.result_count === 0 || !recentTweets.data )
      return

    const tweetIDs = recentTweets.data.map( ( tweet: any ) => tweet.id ).join( ',' )
    let tweets, users
    try {
      const response = await fetch(
        `https://api.twitter.com/2/tweets?ids=${tweetIDs}&tweet.fields=referenced_tweets,created_at&expansions=author_id`,
        fetchOptions
      )
      const data = await response.json()
      if ( !data.data || !data.includes || !data.includes.users )
        throw new Error( "Some fields were missing from the response." )
      tweets = data.data
      users = data.includes.users
    } catch ( error ) {
      log( `Couldn't fetch tweet data in interval ${index}:`, error )
      return
    }

    const newestTweets = new Map()
    for ( const tweet of tweets.reverse() ) {
      const author = getTwitterUserByID( tweet.author_id, users )
      if ( !author )
        continue
      const handle = author.username.toLowerCase()
      const date = new Date( tweet.created_at )
      if ( !newestTweets.has( handle ) || newestTweets.get( handle ) < date )
        newestTweets.set( handle, date )

      let newestSeen = new Date()
      try {
        const dateString = await redis.get( redisKey( handle ) )
        if ( dateString ) {
          const date = new Date( dateString )
          if ( isValidDate( date ) )
            newestSeen = date
        }
      } catch ( error ) {
        log( `Couldn't fetch latest posted tweet time for @${handle} from Redis:`, error )
      }
      if ( date <= newestSeen )
        continue

      const subscriptions = this.subscriptions.get( handle )
      if ( !subscriptions )
        continue

      for ( const [guildID, options] of subscriptions ) {
        let verb = 'tweeted'
        const retweet = tweet.referenced_tweets && tweet.referenced_tweets.some( ( ref: any ) => ref.type === 'retweeted' )
        if ( retweet && !options.retweets )
          continue
        if ( retweet )
          verb = 'retweeted'

        const quoteTweet = tweet.referenced_tweets && tweet.referenced_tweets.some( ( ref: any ) => ref.type === 'quoted' )
        if ( quoteTweet && !options.quoteTweets )
          continue
        if ( quoteTweet )
          verb = 'quote tweeted'

        const reply = tweet.referenced_tweets && tweet.referenced_tweets.some( ( ref: any ) => ref.type === 'replied_to' )
        if ( reply && !options.replies )
          continue
        if ( reply )
          verb = 'replied'

        let channelID = options.channel
        if ( channelID == null ) {
          let defaultChannelID
          try {
            defaultChannelID = ( await this.backend.getGuildSetting( guildID, this.settingKeys.defaultChannel ) ).value
          } catch ( error ) {
            continue
          }
          if ( !defaultChannelID != null )
            channelID = defaultChannelID
        }
        if ( channelID == null )
          continue

        let channel = null
        try {
          const dbChannel = await this.backend.getChannelByID( channelID )
          if ( !dbChannel )
            throw new Error( `getChannelByID returned ${dbChannel}` )
          channel = await this.client.channels.fetch( dbChannel.snowflake )
          if ( channel.type !== 'text' )
            throw new Error( `Channel ${channelID} is not a text channel.` )
        } catch ( error ) {
          log( `Failed to fetch channel ${channelID}:`, error )
          continue
        }

        let template = options.message
        if ( !template ) {
          try {
            template = await this.backend.getSetting( this.settingKeys.message, guildID )
            if ( template == null )
              throw new Error( `getSetting(${this.settingKeys.message}, ${guildID}) returned ${template}` )
          } catch ( error ) {
            log( `Couldn't fetch ${this.settingKeys.message} setting for guild ${guildID} or globally:`, error )
            continue
          }
        }

        const url = `https://twitter.com/${author.username}/status/${tweet.id}`
        const message = sprintf( template, { url, username: author.name, verb } )

        try {
          await ( channel as TextChannel ).send( message )
        } catch ( error ) {
          if ( error.message !== 'Missing Permissions' )
            throw error
        }
      }
    }

    for ( const [account, date] of newestTweets ) {
      try {
        await redis.set( redisKey( account ), date.toISOString() )
      } catch ( error ) {
        log( `Failed to set latest tweet time for @${account} in Redis` )
      }
    }
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }

  subscribedTo( account: string )
  {
    const subscriptions = this.subscriptions.get( account )
    return subscriptions && subscriptions.size > 0
  }
}
