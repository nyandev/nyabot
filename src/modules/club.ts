import * as Commando from 'discord.js-commando'
import { Message } from 'discord.js'
import { Sequelize } from 'sequelize'

import { datetimeNow, debug, logSprintf } from '../globals'
import { Parser } from '../lib/parser'
import { CommandCallbackType, NyaInterface, ModuleBase } from '../modules/module'


class NewClubCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'newclub',
      group: 'clubs',
      memberName: 'newclub',
      description: "Create a new club.",
      args: [{
        key: 'name',
        prompt: "Enter a name for the club.",
        type: 'string'
      }],
      argsPromptLimit: 1
    })
  }

  async run( message: Commando.CommandoMessage, args: Record<string, string>, fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const host = this._service.host
    const models = this._service.backend._models
    const existing = await models.Club.findAll({
      where: Sequelize.where(
        Sequelize.fn('lower', Sequelize.col('name')),
        Sequelize.fn('lower', args.name)
      )
    })
    if ( existing.length )
      return host.respondTo( message, 'club_create_exists' )

    const user = await this._service.backend.getUserBySnowflake( message.author.id )
    const currentClubs = await models.ClubUser.count({
      where: { userID: user.id }
    })
    if ( currentClubs > 0 )
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
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
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
    const backend = this._service.backend
    const models = backend._models
    const clubs = await models.Club.findAll({
      where: Sequelize.where(
        Sequelize.fn( 'lower', Sequelize.col( 'name' ) ),
        Sequelize.fn( 'lower', args.name )
      )
    })
    const host = this._service.host
    if ( !clubs.length )
      return host.respondTo( message, 'club_join_nonexistent' )
    else if ( clubs.length > 1 )
      return host.respondTo( message, 'club_join_multiple' )
    const [club] = clubs
    const user = await backend.getUserBySnowflake( message.author.id )
    const currentClubs = await models.ClubUser.count({
      where: { userID: user.id }
    })
    if ( currentClubs > 0 )
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


class LeaveClubCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'leaveclub',
      group: 'clubs',
      memberName: 'leaveclub',
      description: "Leave your current club."
    } )
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const host = this._service.host
    const backend = this._service.backend
    const models = backend._models

    const user = await backend.getUserBySnowflake( message.author.id )
    let currentClubs = await models.ClubUser.findAll( { where: { userID: user.id } } )
    if ( currentClubs.length === 0 )
      return host.respondTo( message, 'club_leave_not_in_club' )
    const clubNames = []
    for ( const clubUser of currentClubs ) {
      const club = await models.Club.findOne( {
        where: { id: clubUser.clubID },
        attributes: ['name']
      } )
      debug( club )
      clubNames.push( club.name )
    }

    await models.ClubUser.destroy( { where: { userID: user.id } } )
    return host.respondTo( message, 'club_leave_success', user.name, clubNames )
  }
}


class ListClubsCommand extends Commando.Command
{
  constructor( protected _service: ModuleBase )
  {
    super( _service.client,
    {
      name: 'clubs',
      group: 'clubs',
      memberName: 'clubs',
      description: "List all clubs.",
    })
  }

  async run( message: Commando.CommandoMessage, args: object | string | string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    const models = this._service.backend._models
    const clubs = await models.Club.findAll({
      attributes: ['name'],
      include: [models.ClubUser]
    })
    if ( !clubs.length )
      return this._service.host.respondTo( message, 'club_list_empty' )

    const clubNames = clubs.map( (club: any) => {
      const memberCount = club.clubusers.length
      const plural = memberCount === 1 ? '' : 's'
      return `${club.name} (${memberCount} member${plural})`
    } ).join( '\n' )
    return this._service.host.respondTo( message, 'club_list', clubNames )
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
      const user = await this.backend.getUserBySnowflake( message.author.id )
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
      new Commando.CommandGroup( this.client, 'clubs', 'Clubs', false )
    ]
  }

  getCommands(): Commando.Command[]
  {
    return [
      new JoinClubCommand( this ),
      new LeaveClubCommand( this ),
      new ListClubsCommand( this ),
      new NewClubCommand( this )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}