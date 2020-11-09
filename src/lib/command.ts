import * as Commando from 'discord.js-commando'
import { Channel, Message, TextChannel } from 'discord.js'

import { debug } from '../globals'
import { ModuleBase } from '../modules/module'


interface ArgumentSpec {
  key: string
  type: 'string' | 'number' | 'text-channel'
  optional?: boolean
}

export interface Arguments {
  [key: string]: any
}

export interface SubcommandInfo {
  description?: string
  guildOnly?: boolean
  ownerOnly?: boolean
  args?: ArgumentSpec[]
}

export interface SubcommandList {
  [name: string]: {
    command: NyaCommand
    options?: SubcommandInfo
    subcommands?: SubcommandList
  }
}

export interface SubcommandOptions extends SubcommandInfo {
  subcommands?: SubcommandList
}

export interface SubcommandSpec {
  [name: string]: {
    class: new (module: ModuleBase, subcommands?: SubcommandOptions) => NyaCommand
    options?: SubcommandInfo
    subcommands?: SubcommandSpec
  }
}

interface BaseCommandInfo {
  name: string
  group: string
  description: string
  args?: ArgumentSpec[]
  guildOnly?: boolean
  ownerOnly?: boolean
  subcommandSpec?: SubcommandSpec
}


export abstract class NyaBaseCommand extends Commando.Command
{
  protected subcommands: SubcommandList = {}

  constructor( protected module: ModuleBase, protected options: BaseCommandInfo )
  {
    super( module.client, {
      name: options.name,
      memberName: options.name,
      group: options.group,
      description: options.description,
      guildOnly: options.guildOnly,
      ownerOnly: options.ownerOnly,
      argsType: 'multiple'
    } )
    if ( options.subcommandSpec )
      this.subcommands = this.module.buildSubcommands( options.subcommandSpec )
  }

  async run( message: Commando.CommandoMessage, args: string[], fromPattern: boolean, result?: Commando.ArgumentCollectorResult<object>): Promise<Message | Message[] | null>
  {
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) )
      return this.subcommands[args[0]].command.delegate( message, args.slice( 1 ) )

    let parsedArgs = {}
    if ( this.options.args ) {
      parsedArgs = parseArgs( args, this.options.args, message )
      if ( !parsedArgs )
        return message.say( "Usage: ...?" )
    }
    return this.runDefault( message, parsedArgs )
  }

  abstract async runDefault( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
}


export abstract class NyaCommand
{
  protected subcommands: SubcommandList = {}

  constructor( protected module: ModuleBase, protected options: SubcommandOptions = {} )
  {
    if ( options.subcommands )
      this.subcommands = options.subcommands
    delete this.options.subcommands
  }

  async delegate( message: Commando.CommandoMessage, args: string[] ): Promise<Message | Message[] | null>
  {
    debug('options is', this.options)
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) )
      return this.subcommands[args[0]].command.delegate( message, args.slice( 1 ) )

    let parsedArgs = {}
    if ( this.options.args ) {
      parsedArgs = parseArgs( args, this.options.args, message )
      if ( !parsedArgs )
        return message.say( "Usage: ..." )
    }
    return this.run( message, parsedArgs )
  }

  abstract async run( message: Commando.CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
}


function parseArgs( values: string[], args: ArgumentSpec[], message: Commando.CommandoMessage ): Arguments | false
{
  const requiredArgs = args.map( ( arg, i ) => [arg, i] ).filter( ([arg, i]) => !( arg as ArgumentSpec ).optional )
  if ( requiredArgs.length && requiredArgs.length <= requiredArgs[requiredArgs.length - 1][1] )
    throw new Error( "Required arguments must precede optional arguments" )

  const parsed: Arguments = {}
  values.forEach( ( val, i ) => {
    const spec = args[i]
    if ( !spec )
      return
    debug('Now parsing arg', val, 'with spec', spec)
    let parsedValue
    if ( spec.type === 'string' )
      parsedValue = val
    else if ( spec.type === 'number' )
      parsedValue = parseFloat( val )
    else if ( spec.type === 'text-channel' )
      parsedValue = parseTextChannel( val, message )
    else
      throw new Error( `Unknown argument type: ${spec.type}` )

    parsed[spec.key] = parsedValue
  } )
  return parsed
}


function textChannelFilter( search: string )
{
  return ( channel: Channel ) => {
    if ( channel.type !== 'text' )
      return false
   return ( channel as TextChannel ).name.toLowerCase() === search.toLowerCase()
  }
}


export function parseTextChannel( arg: string, message: Commando.CommandoMessage ): TextChannel | null
{
  if ( !arg || !message )
    return null

  const channelMention = arg.match( /^\<#(\d+)>$/ )
  if ( channelMention ) {
    const channel = message.client.channels.resolve( channelMention[1] )
    return ( channel && channel.type === 'text' ) ? ( channel as TextChannel ) : null
  }

  if ( !message.guild )
    return null

  const channels = message.guild.channels.cache.filter( textChannelFilter( arg ) )
  if ( channels.size === 1)
    return ( channels.first() as TextChannel )
  // TODO: return more descriptive help if multiple channels have the same name
  return null
}