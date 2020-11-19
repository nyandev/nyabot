import fetch from 'node-fetch'
import { Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { Message, TextChannel } from 'discord.js'
import { sprintf } from 'sprintf-js'

import { debug, log } from '../globals'
import { Arguments, NyaBaseCommand, NyaCommand, parseTextChannel, SubcommandInfo, SubcommandList, SubcommandSpec } from '../lib/command'
import { NyaInterface, ModuleBase } from '../modules/module'


function joinStrings( strings: string[] ): string
{
  const parts = []
  const firstPart = strings.slice( 0, -2 ).join( ', ' )
  const lastPart = strings.slice( -2 ).join( ' and ' )
  if ( firstPart )
    parts.push( firstPart )
  parts.push( lastPart )
  return parts.join( ', ' )
}


function queryString( accounts: string[] ) {
  return accounts.map( ( account: string ) => `from:${account}` ).join(' OR ')
}


class TwitterChannelCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return null // This command should be used through its subcommands.
  }
}


class TwitterListCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const backend = this.module.backend
    let guild
    try {
      guild = await backend.getGuildBySnowflake( message.guild.id )
      if ( !guild )
        throw new Error( `getGuildBySnowflake returned ${guild}` )
    } catch ( error ) {
      log( `Couldn't fetch guild ${message.guild.id}:`, error )
      return null
    }

    let subscriptions
    try {
      const setting = await backend.getGuildSetting( guild.id, this.module.settingKeys.subscriptions )
      subscriptions = JSON.parse( setting.value || '{}' )
    } catch ( error ) {
      log( `Couldn't fetch Twitter subscriptions for guild ${guild.id}:`, error )
      return null
    }
    const sortedSubscriptions: [string, TwitterSubscriptionOptions][] = Object.entries( subscriptions )
    sortedSubscriptions.sort( ( a, b ) => {
      if ( a[0].toLowerCase() < b[0].toLowerCase() ) return -1
      if ( a[0].toLowerCase() > b[0].toLowerCase() ) return 1
      return 0
    } )

    let defaultChannel = null
    try {
      const setting = await backend.getGuildSetting( guild.id, this.module.settingKeys.defaultChannel )
      if ( setting && setting.value != null ) {
        const channel = await backend.getChannelByID( setting.value )
        if ( channel )
          defaultChannel = channel.snowflake
      }
    } catch ( _ ) {
      // Ignore
    }
    const defaultChannelText = defaultChannel
      ? `to <#${defaultChannel}> (default channel)`
      : "(but no channel or default channel has been set)"

    const lines = []
    for ( const [account, options] of sortedSubscriptions ) {
      const types = ['tweets']
      if ( options.retweets )
        types.push( 'retweets' )
      if ( options.quoteTweets )
        types.push( 'quote tweets' )

      let channelText
      if ( options.channel != null ) {
        try {
          const channel = await backend.getChannelByID( options.channel )
          if ( !channel )
            throw new Error( `getChannelByID returned ${channel}` )
          channelText = `to <#${channel.snowflake}>`
        } catch ( error ) {
          log( `Couldn't fetch channel ${options.channel}:`, error )
          channelText = "but the channel setting is invalid"
        }
      } else {
        channelText = defaultChannelText
      }
      lines.push( `**@${account}**: Posting ${joinStrings( types )} ${channelText}` )
    }
    return message.say( lines.join( '\n' ) )
  }
}


class TwitterChannelDefaultCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const namedArgs = args[0]
    if ( namedArgs.channel ) {
      if ( typeof namedArgs.channel === 'string' )
        return message.say( namedArgs.channel )
      return message.say( `got <#${namedArgs.channel.id}>` )
    }
    if ( namedArgs.channel === null )
      return message.say( "Couldn't resolve channel" )
    return message.say( "Default channel is ..." )
  }
}


class TwitterChannelDefaultClearCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "default twitter channel cleared" )
  }
}


class TwitterChannelGetCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( `Twitter notifications for @${args[0].account} are being posted to...` )
  }
}


class TwitterChannelListCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return message.say( "<list of channels>" )
  }
}


class TwitterChannelSetCommand extends NyaCommand
{
  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    const namedArgs = args[0]
    if ( typeof namedArgs.channel === 'string' )
      return message.say( namedArgs.channel )
    return message.say( `Setting Twitter channel with arguments:\n\`${JSON.stringify(namedArgs)}\`` )
  }
}


class TwitterCommand extends NyaBaseCommand
{
  constructor( public module: Twitter2Module )
  {
    super( module,
    {
      name: 'twitter',
      group: 'twitter2',
      description: "Shows this server\u2019s Twitter account(s).",
      guildOnly: true,
      subcommandSpec: {
        list: {
          class: TwitterListCommand,
          options: {
            description: "Lists all Twitter accounts followed on this server."
          }
        },
        channel: {
          class: TwitterChannelCommand,
          options: {
            dummy: true,
            description: "Shows or modifies the channels used for Twitter notifications."
          },
          subcommands: {
            default: {
              class: TwitterChannelDefaultCommand,
              options: {
                description: "Shows or modifies the default channel for Twitter notifications.",
                args: [{
                  key: 'channel',
                  optional: true,
                  type: 'text-channel',
                }]
              },
              subcommands: {
                clear: {
                  class: TwitterChannelDefaultClearCommand,
                  options: {
                    description: "Clears the default channel for Twitter notifications."
                  }
                }
              }
            },
            get: {
              class: TwitterChannelGetCommand,
              options: {
                description: "Shows which channel a Twitter account\u2019s notifications are being posted to.",
                args: [{
                  key: 'account',
                  type: 'string'
                }]
              }
            },
            list: {
              class: TwitterChannelListCommand,
              options: {
                description: "Lists channels that Twitter notifications are being posted to."
              }
            },
            set: {
              class: TwitterChannelSetCommand,
              options: {
                description: "Sets a channel for posting notifications from a particular Twitter user.",
                args: [
                  {
                    key: 'account',
                    type: 'string'
                  },
                  {
                    key: 'channel',
                    type: 'text-channel'
                  }
                ]
              }
            }
          }
        }
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
      return null
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
}

interface TwitterSubscriptionOptions {
  channel?: number
  retweets?: boolean
  quoteTweets?: boolean
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

export class Twitter2Module extends ModuleBase
{
  config: TwitterConfig
  intervals: IntervalStatus[] = []
  settingKeys = {
    defaultChannel: 'TwitterDefaultChannel',
    defaultMessage: 'TwitterDefaultMessage',
    message: 'TwitterMessage',
    retweetMessage: 'TwitterRetweetMessage',
    subscriptions: 'TwitterSubscriptions'
  }
  subscriptions: Map<string, Map<number, TwitterSubscriptionOptions>> = new Map()

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
      this.settingKeys.retweetMessage
    ]
  }

  getGroups(): CommandGroup[]
  {
    if ( this.config.enabled ) {
      return [
        new CommandGroup( this.client, 'twitter2', 'Twitter', false )
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
    const query = queryString( interval.accounts )
    const redisKey = (account: string) => `latesttweet:${account}`

    let recentTweets
    try {
      const response = await fetch(
        `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${this.config.maxResults}`,
        fetchOptions
      )
      recentTweets = await response.json()
      if ( !recentTweets.meta )
        throw new Error( "Response for recent tweet lookup has no `meta` field." )
    } catch ( error ) {
      log( `Couldn't fetch tweets in interval ${index}:`, error )
      return
    }

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
          if ( !Number.isNaN( date.getTime() ) )
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
        const retweet = tweet.referenced_tweets && tweet.referenced_tweets.some( (ref: any) => ref.type === 'retweeted' )
        if ( retweet && !options.retweets )
          continue

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
          const ch = await this.backend.getChannelByID( channelID )
          if ( !ch )
            throw new Error( `getChannelByID returned ${ch}` )
          channel = await this.client.channels.fetch( ch.snowflake )
          if ( channel.type !== 'text' )
            throw new Error( `Channel ${channelID} is not a text channel.` )
        } catch ( error ) {
          log( `Failed to fetch channel ${channelID}:`, error )
          continue
        }

        const messageSetting = retweet ? this.settingKeys.retweetMessage : this.settingKeys.message
        let template
        try {
          template = await this.backend.getSetting( messageSetting, guildID )
          if ( template == null )
            throw new Error( `getSetting(${messageSetting}, ${guildID}) returned ${template}` )
        } catch ( error ) {
          log( `Couldn't fetch ${messageSetting} setting for guild ${guildID} or globally:`, error )
          continue
        }

        const url = `https://twitter.com/${author.username}/status/${tweet.id}`
        const message = sprintf( template, { url, username: author.name } )

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
