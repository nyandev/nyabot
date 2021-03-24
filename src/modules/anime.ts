import { Message, MessageAttachment, MessageEmbed, TextChannel } from 'discord.js'
import { ArgumentCollectorResult, Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { Arguments, CommandOptions, NyaBaseCommand, NyaCommand, Subcommands } from '../lib/command'
import axios, { AxiosInstance, AxiosResponse } from 'axios'
import * as moment from 'moment'
import { sprintf } from 'sprintf-js'

import { apos, arrayOneOf, markdownEscape } from '../globals'
import { Backend } from '../lib/backend'
import { NyaInterface, ModuleBase } from '../modules/module'

const c_mediaWhatQuery = `
query ($page: Int, $perPage: Int) {
  Page (page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    media (status_in: [RELEASING],type: ANIME,format_in: [TV,TV_SHORT],sort: TRENDING_DESC,isAdult: false) {
      id
      title {
        romaji
        english
        native
      }
      genres
      episodes
      nextAiringEpisode {
        id
        episode
        timeUntilAiring
      }
    }
  }
}`

class Anilist
{
  _axios: AxiosInstance

  constructor()
  {
    const config = {
      baseURL: 'https://graphql.anilist.co/',
      respondType: 'json',
      maxRedirects: 3,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }

    this._axios = axios.create( config )
  }

  private async postQuery( query: string )
  {
    const result: AxiosResponse = await this._axios.post( '', query )
    if ( result.status != 200 || !result.data || !result.data.data )
      return null
    return result.data.data
  }

  async whatQuery( page: number, perPage: number ): Promise<any>
  {
    const query = JSON.stringify({ query: c_mediaWhatQuery, variables: { page: page, perPage: perPage } })
    const data: any = await this.postQuery( query )
    return ( data.Page ? data.Page : data )
  }
}

class AnimeFormatter
{
  _anilist: Anilist = new Anilist()

  async getNext(): Promise<any>
  {
    const page = await this._anilist.whatQuery( 1, 10 )
    if ( !page || !page.media || !Array.isArray( page.media ) )
      return null
    let entries: any[] = []
    for ( let entry of page.media )
    {
      if ( !entry.nextAiringEpisode || !entry.nextAiringEpisode.timeUntilAiring )
        continue
      entries.push( entry )
    }
    entries.sort( ( a: any, b: any ): number => {
      return ( ( a.nextAiringEpisode.timeUntilAiring < b.nextAiringEpisode.timeUntilAiring ) ? -1 : 1 )
    })
    return entries
  }
}

const c_themeColor: string = '#02a9ff'

class AnimeNextCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "List the next airing trending anime.",
    ownerOnly: false
  }

  async execute( message: CommandoMessage, args: any ): Promise<Message | Message[] | null>
  {
    const module = this.module as AnimeModule
    const host: NyaInterface = module.host
    const backend: Backend = module.backend

    const entries = await module._anime.getNext()

    const user = message.author
    const channel = ( message.channel as TextChannel )
    const embed = new MessageEmbed()
      .setTitle( "__Next Airing Trending Anime__" )
      .setColor( c_themeColor )
      .setTimestamp()

    let i: number = 0
    for ( let entry of entries )
    {
      const timeUntil = moment.duration( entry.nextAiringEpisode.timeUntilAiring * 1000 )
      const hours = timeUntil.days() * 24 + timeUntil.hours()
      const intime: string = ( ( timeUntil.asDays() < 2 ) ? ( hours > 0 ? sprintf( "%i hours, %i minutes", hours, timeUntil.minutes() ) : sprintf( "%i minutes", timeUntil.asMinutes() ) ) : timeUntil.humanize() )
      const enTitle = markdownEscape( entry.title.english ? entry.title.english : ( entry.title.romaji ? entry.title.romaji : entry.title.native ) )
      embed.addField(
        sprintf( "**%s**", enTitle ),
        sprintf(
          "**[%s](https://anilist.co/anime/%s/)**\nEpisode **%s%s** airs in **%s**\n`%s`",
          markdownEscape( entry.title.native ),
          entry.id,
          entry.nextAiringEpisode.episode ? entry.nextAiringEpisode.episode : '?',
          entry.episodes ? "/" + entry.episodes : '',
          intime,
          entry.genres ? entry.genres.slice( 0, 5 ).join( ', ' ) : 'Unknown genre'
        )
      )
      if ( ++i >= 10 )
        break
    }

    return channel.send( embed )
  }
}

class AnimeSuggestCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Suggest an anime",
    usageNotes: "Usage notes for anime suggest.",
    dummy: false,
    guildOnly: false,
    ownerOnly: false,
    args: [{key: "query", type: "string", catchAll: true}]
  }

  async execute( message: CommandoMessage, args: any ): Promise<Message | Message[] | null>
  {
    const module = this.module as AnimeModule
    const host: NyaInterface = module.host
    const backend: Backend = module.backend
    
    // yeah whatever

    return null
  }
}

class AnimeCommand extends NyaBaseCommand
{
  constructor( protected module: AnimeModule )
  {
    super( module,
    {
      name: 'anime',
      group: 'anime',
      description: 'Anime base command.',
      dummy: true,
      guildOnly: false,
      subcommands: {
        next: AnimeNextCommand,
        suggest: AnimeSuggestCommand
      }
    })
  }
}

export class AnimeModule extends ModuleBase
{
  _anime: AnimeFormatter = new AnimeFormatter()

  constructor( id: number, host: NyaInterface, client: CommandoClient )
  {
    super( id, host, client )
  }

  getGroups(): CommandGroup[]
  {
    return [
      new CommandGroup( this.client, 'anime', 'Anime', false )
    ]
  }

  getCommands(): Command[]
  {
    return [
      new AnimeCommand( this )
    ]
  }

  async onMessage( msg: Message ): Promise<void>
  {
    //
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}
