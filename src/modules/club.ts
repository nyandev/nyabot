import { Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { Message } from 'discord.js'
import { Sequelize } from 'sequelize'

import { datetimeNow, debug, logSprintf } from '../globals'
import { sprintf } from 'sprintf-js'
import { CommandCallbackType, NyaInterface, ModuleBase } from '../modules/module'
import { Arguments, CommandOptions, NyaBaseCommand, NyaCommand, Subcommands } from '../lib/command'

import * as Models from '../models'

class ClubCreateCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Create a new club.",
    usageNotes: "Usage notes for club create.",
    dummy: false,
    guildOnly: false,
    ownerOnly: false,
    args: [{ key: "name", type: "string" }]
  }

  async execute( message: CommandoMessage, args: any ): Promise<Message | Message[] | null>
  {
    const module = this.module as ClubModule
    const host = module.host

    const existing = await Models.Club.findAll({
      where: Sequelize.where(
        Sequelize.fn( 'lower', Sequelize.col( 'name' ) ),
        Sequelize.fn( 'lower', args.name )
      )
    })
    if ( existing.length )
      return host.respondTo( message, 'club_create_exists' )

    const user = await module.backend.getUserBySnowflake( message.author.id )
    if ( !user )
      return host.respondTo( message, 'error_user_resolve_failed' )

    const currentClubs = await Models.ClubUser.count({
      where: { userID: user.id }
    })
    if ( currentClubs > 0 )
      return host.respondTo( message, 'club_already_in_club' )

    const clubData = {
      name: args.name,
      owner: user.id,
      created: datetimeNow()
    }
    const club: Models.Club = await Models.Club.create( clubData )
    if ( !club )
      return host.respondTo( message, 'club_create_fail' )

    const clubUserData = {
      userID: user.id,
      clubID: club.id,
      joined: datetimeNow()
    }
    // should probably have a transaction here
    // if user add fails, roll back club creation
    await Models.ClubUser.create( clubUserData )

    return host.respondTo( message, 'club_create_success' )
  }
}

class ClubListCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "List clubs.",
    usageNotes: "Usage notes for club list.",
    dummy: false,
    guildOnly: false,
    ownerOnly: false,
    args: []
  }

  async execute( message: CommandoMessage, args: any ): Promise<Message | Message[] | null>
  {
    const module = this.module as ClubModule

    const clubs = await Models.Club.findAll({
      attributes: ['name'],
      include: [Models.Club.associations.clubusers]
    })

    if ( !clubs.length )
      return module.host.respondTo( message, 'club_list_empty' )

    const clubNames = clubs.map( ( club: any ) => {
      const memberCount = club.clubusers.length
      return sprintf( "%s (%i member%s)", club.name, memberCount > 1 ? 's' : '' )
    } ).join( '\n' )

    return module.host.respondTo( message, 'club_list', clubNames )
  }
}

class ClubJoinCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Join an existing club.",
    usageNotes: "Usage notes for club join.",
    dummy: false,
    guildOnly: false,
    ownerOnly: false,
    args: [{ key: "name", type: "string" }]
  }

  async execute( message: CommandoMessage, args: any ): Promise<Message | Message[] | null>
  {
    const module = this.module as ClubModule
    const host = module.host
    const backend = module.backend
    
    const clubs = await Models.Club.findAll({
      where: Sequelize.where(
        Sequelize.fn( 'lower', Sequelize.col( 'name' ) ),
        Sequelize.fn( 'lower', args.name )
      )
    })

    if ( !clubs.length )
      return host.respondTo( message, 'club_join_nonexistent' )
    else if ( clubs.length > 1 )
      return host.respondTo( message, 'club_join_multiple' )
      
    const [club] = clubs

    const user = await backend.getUserBySnowflake( message.author.id )
    if ( !user )
      return host.respondTo( message, 'error_user_resolve_failed' )

    const currentClubs = await Models.ClubUser.count({
      where: { userID: user.id }
    })
  
    if ( currentClubs > 0 )
      return host.respondTo( message, 'club_already_in_club' )

    const clubUserData = {
      userID: user.id,
      clubID: club.id,
      joined: datetimeNow()
    }

    await Models.ClubUser.create( clubUserData )

    return host.respondTo( message, 'club_join_success', user.name, club.name )
  }
}

class ClubLeaveCommand extends NyaCommand
{
  static options: CommandOptions = {
    description: "Leave an existing club.",
    usageNotes: "Usage notes for club leave.",
    dummy: false,
    guildOnly: false,
    ownerOnly: false,
    args: [{ key: "name", type: "string" }]
  }

  async execute( message: CommandoMessage, args: any ): Promise<Message | Message[] | null>
  {
    const module = this.module as ClubModule
    const host = module.host
    const backend = module.backend

    const user = await backend.getUserBySnowflake( message.author.id )
    if ( !user )
      return host.respondTo( message, 'error_user_resolve_failed' )

    let currentClubs = await Models.ClubUser.findAll( { where: { userID: user.id } } )
    if ( currentClubs.length === 0 )
      return host.respondTo( message, 'club_leave_not_in_club' )

    const clubNames = []
    for ( const clubUser of currentClubs )
    {
      const club = await Models.Club.findOne({
        where: { id: clubUser.clubID },
        attributes: ['name']
      })
      if ( !club )
        continue
      debug( club )
      clubNames.push( club.name )
    }

    await Models.ClubUser.destroy( { where: { userID: user.id } } )

    return host.respondTo( message, 'club_leave_success', user.name, clubNames )
  }
}

class ClubCommand extends NyaBaseCommand
{
  constructor( protected module: ClubModule )
  {
    super( module,
    {
      name: 'club',
      group: 'clubs',
      description: 'Club base command.',
      dummy: true,
      guildOnly: false,
      subcommands: {
        create: ClubCreateCommand,
        list: ClubListCommand,
        join: ClubJoinCommand,
        leave: ClubLeaveCommand
      }
    })
  }
}

export class ClubModule extends ModuleBase
{
  constructor( id: number, host: NyaInterface, client: CommandoClient )
  {
    super( id, host, client )
  }

  getGroups(): CommandGroup[]
  {
    return [
      new CommandGroup( this.client, 'clubs', 'Clubs', false )
    ]
  }

  getCommands(): Command[]
  {
    return [
      new ClubCommand( this )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}