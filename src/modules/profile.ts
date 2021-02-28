import { Message, MessageAttachment, User } from 'discord.js'
import { ArgumentCollectorResult, Command, CommandGroup, CommandoClient, CommandoMessage } from 'discord.js-commando'

import * as fs from 'fs'
import * as path from 'path'

import { apos } from '../globals'
import { Backend } from '../lib/backend'
import { NyaInterface, ModuleBase } from '../modules/module'
import { Renderer, Point, Dimensions } from '../lib/renderer'

const g_rootPath: string = '/rep/nyabot'
const g_dimensions: Dimensions = new Dimensions([680, 420])

Renderer.registerFont( path.join( g_rootPath, 'gfx', 'geomgraphic_bold.otf' ), 'geomgraph' )
Renderer.registerFont( path.join( g_rootPath, 'gfx', 'sfhypocrisy_medium.otf' ), 'sfhypo' )

class ProfileCommand extends Command
{
  constructor( protected module: ProfileModule, client: CommandoClient )
  {
    super( client,
    {
      name: 'profile',
      aliases: ['whoami', 'me'],
      group: 'profile',
      memberName: 'profile',
      description: 'Show your user profile card.',
      guildOnly: false,
      ownerOnly: false,
      nsfw: false,
      throttling: { usages: 5, duration: 12 }
    })
  }

  async run( message: CommandoMessage, args: any, fromPattern: boolean, result?: ArgumentCollectorResult ): Promise<Message | Message[] | null>
  {
    try {
      const image = await this.module.generateFor( message.author )
      const attachment = new MessageAttachment( image, 'profile.png' )
      message.channel.send( attachment )
    } catch ( error: any ) {
      message.reply( 'Sorry, failed to generate a profile image.' )
    }
    return null
  }
}

export class ProfileModule extends ModuleBase
{
  public _renderer: Renderer

  constructor( id: number, host: NyaInterface, client: CommandoClient )
  {
    super( id, host, client )
    this._renderer = new Renderer( g_dimensions )
  }

  async initialize(): Promise<void>
  {
    if ( !this._renderer.hasImage( 'bg' ) )
      await this._renderer.loadImageLocalCached( path.join( g_rootPath, 'gfx', 'nyabot-profile_bg-v1.png' ), 'bg' )
  }

  async generateFor( user: User ): Promise<Buffer>
  {
    const profile = {
      name: user.tag,
      color: '#00daee',
      club: 'club name here'
    }

    const avatarURL = user.displayAvatarURL({ format: 'png', dynamic: false, size: 128 })
    const avatar = await this._renderer.loadImage( avatarURL )

    this._renderer.drawImage( [0, 0], g_dimensions, 'bg' )

    this._renderer.drawAvatar( [14,10], 86, avatar, 'rgb(0,0,0)', 4, profile.color )
    this._renderer.drawAvatar( [599,53], 66, avatar, 'rgb(0,0,0)', 4, profile.color )

    this._renderer.drawText( [107,53], 'sfhypo', 27, 'left', 'rgb(255,255,255)', profile.name )
    this._renderer.drawText( [586,91], 'sfhypo', 27, 'right', 'rgb(255,255,255)', profile.club  )

    return await this._renderer.toPNGBuffer()
  }

  getGroups(): CommandGroup[]
  {
    return [
      new CommandGroup( this.client, 'profile', 'Profile', false )
    ]
  }

  getCommands(): Command[]
  {
    return [
      new ProfileCommand( this, this.client )
    ]
  }

  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this.id = id
    return true
  }
}
