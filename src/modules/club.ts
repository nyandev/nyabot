import { datetimeNow, debug, logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )
import { Channel, Client, ClientOptions, Collection, DMChannel, Emoji, Guild, GuildChannel, GuildMember, GuildResolvable, Message, MessageAttachment, MessageEmbed, MessageMentions, MessageOptions, MessageAdditions, MessageReaction, PermissionResolvable, PermissionString, ReactionEmoji, Role, Snowflake, StringResolvable, TextChannel, User, UserResolvable, VoiceState, Webhook } from 'discord.js'
import { Sequelize } from 'sequelize'
import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Backend } from '../lib/backend'
import { Parser } from '../lib/parser'

import { CommandCallbackType, NyaInterface, ModuleBase } from '../modules/module'


class NewClubCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'newclub',
      group: 'clubs',
      memberName: 'newclub',
      description: "Create a new club.",
      args: [{
        key: 'name',
        prompt: 'Pick a name for the club.',
        type: 'string'
      }],
      argsPromptLimit: 1
    })
  }

  async run( message: Commando.CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const host = this._service.getHost()
    const models = this._service.getBackend()._models
    const existing = await models.Club.findAll({
      where: Sequelize.where(
        Sequelize.fn('lower', Sequelize.col('name')),
        Sequelize.fn('lower', args.name)
      )
    })
    if ( existing.length )
      return host.respondTo( message, 'club_create_exists' )

    const user = await this._service.getBackend().getUserBySnowflake( message.author.id )
    const currentClub = models.ClubUser.count({
      where: { userID: user.id }
    })
    if ( currentClub )
      return host.respondTo( message, 'club_already_in_club' )

    const clubData = {
      name: args.name,
      owner: user.id,
      created: datetimeNow()
    }
    const club: any = await models.Club.create( clubData )
    if ( !club )
      return host.respondTo( message, 'club_create_fail' )

    const clubUserData = {
      userID: user.id,
      clubID: club.id,
      joined: datetimeNow()
    }
    await models.ClubUser.create( clubUserData )
    return host.respondTo( message, 'club_create_success' )
  }
}


class JoinClubCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'joinclub',
      group: 'clubs',
      memberName: 'joinclub',
      description: "Join a club.",
      args: [{
        key: 'name',
        prompt: "Which club?",
        type: 'string'
      }]
    })
  }

  async run( message: Commando.CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const backend = this._service.getBackend()
    const models = backend._models
    const clubs = await models.Club.findAll({
      where: Sequelize.where(
        Sequelize.fn( 'lower', Sequelize.col( 'name' ) ),
        Sequelize.fn( 'lower', args.name )
      )
    })
    const host = this._service.getHost()
    if ( !clubs.length )
      return host.respondTo( message, 'club_join_nonexistent' )
    else if ( clubs.length > 1 )
      return host.respondTo( message, 'club_join_multiple' )
    const [club] = clubs
    const user = await backend.getUserBySnowflake( message.author.id )
    const currentClub = await models.ClubUser.count({
      where: { userID: user.id }
    })
    if ( currentClub )
      return host.respondTo( message, 'club_already_in_club' )
    const clubUserData = {
      userID: user.id,
      clubID: club.id,
      joined: datetimeNow()
    }
    await models.ClubUser.create( clubUserData )
    return host.respondTo( message, 'club_join_success', user.name, club.name )
  }
}


class ListClubsCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase, client: Commando.CommandoClient )
  {
    super( client,
    {
      name: 'clubs',
      group: 'clubs',
      memberName: 'clubs',
      description: "List all clubs.",
    })
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const models = this._service.getBackend()._models
    const clubs = await models.Club.findAll({
      attributes: ['name'],
      include: [models.ClubUser]
    })
    if ( !clubs.length )
      return this._service.getHost().respondTo( message, 'club_list_empty' )

    const clubNames = clubs.map( (club: any) => {
      const memberCount = club.clubusers.length
      const plural = memberCount === 1 ? '' : 's'
      return `${club.name} (${memberCount} member${plural})`
    } ).join( '\n' )
    return this._service.getHost().respondTo( message, 'club_list', clubNames )
  }
}

export class ClubModule extends ModuleBase
{
  _parser: Parser

  constructor( id: number, host: NyaInterface, client: Commando.CommandoClient )
  {
    super( id, host, client )
  }

  async onMessage( message: Message ): Promise<void>
  {
    const parsed = Parser.parseMessage( message.content )
    if ( parsed.xp !== false )
    {
      const user = await this._backend.getUserBySnowflake( message.author.id )
      if ( user )
      {
        // do things and stuff
      }
    }
    /*const cmd = this._parser.parseCommand( parsed )
    if ( cmd )
    {
      logSprintf( 'debug', 'Looks like a command: %s (%i args)', cmd.command, cmd.args.length )
      if ( cmd.command === 'test' && msg.author )
      {
        const embed = this.buildEmbedWelcome( message.author )
        message.channel.send( embed )
        const guild = await this._backend.getGuildBySnowflake( message.guild.id )
        if ( guild )
        {
          //this._backend.setGuildSetting( guild.id, 'testsetting', 'cool value bro!' )
          //this._backend.setGuildSetting( guild.id, 'poop', 'yeehaw' )
          let ftch = await this._backend.getGuildSettings( guild.id )
          console.log( ftch )
        }
      }
    }*/
  }

  getGroups(): Commando.CommandGroup[]
  {
    return [
      new Commando.CommandGroup( this.getClient(), 'clubs', 'Clubs', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new JoinClubCommand( this, this.getClient() ),
      new ListClubsCommand( this, this.getClient() ),
      new NewClubCommand( this, this.getClient() )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    return true
  }
}