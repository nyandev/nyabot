import fetch from 'node-fetch'

import { logSprintf } from '../globals'
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'

import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from '../lib/backend'
import { Parser } from '../lib/parser'
import { Redis } from '../lib/redis'

import { CommandCallbackType, NyaInterface, ModuleBase } from '../modules/module'

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
      description: 'Set a channel for posting tweets.',
      args: [{
        key: 'target',
        prompt: "Which channel?",
        type: 'channel'
      }],
      argsPromptLimit: 1
    })
    this._service = service
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    console.log("!twitterchannel", message, args)

    if ( false /* TODO: if can't post to channel etc. */ )
      return this._service.getHost().respondTo( message, 'twitterchannel_fail' )
    return this._service.getHost().respondTo( message, 'twitterchannel_set' )
  }
}

export class TwitterModule extends ModuleBase
{
  _parser: Parser

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
      const redisKey = `latesttweet_${guildID}`

      setInterval( async function() {
        const query = 'from:ahogasm'

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
              const message = `**${username}** tweeted: https://twitter.com/${handle}/status/${tweet.id}`
              console.log('CHANNEL', client.channels.cache.get('738183830069837907'))
              const channel = client.channels.cache.get( '738183830069837907' )
              if ( channel )
                (channel as TextChannel).send( message )
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
      new TwitterChannelCommand( this, this.getClient() )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}