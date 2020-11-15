import { ArgumentCollectorResult, Command, CommandoMessage } from 'discord.js-commando'
import { Channel, Message, TextChannel } from 'discord.js'

import { debug, log } from '../globals'
import { ModuleBase } from '../modules/module'


interface ArgumentSpec {
  key: string
  type: 'string' | 'number' | 'text-channel'
  optional?: boolean
  catchAll?: boolean
}

interface NamedArguments {
  [key: string]: any
}

export type Arguments = [NamedArguments, any[]]

export interface SubcommandInfo {
  name?: string
  description?: string
  guildOnly?: boolean
  ownerOnly?: boolean
  dummy?: boolean
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
  dummy?: boolean
  args?: ArgumentSpec[]
  guildOnly?: boolean
  ownerOnly?: boolean
  subcommandSpec?: SubcommandSpec
}


export abstract class NyaBaseCommand extends Command
{
  subcommands: SubcommandList = {}

  constructor( public module: ModuleBase, public options: BaseCommandInfo )
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
      this.subcommands = this.module.buildSubcommands( options.name, options.subcommandSpec )
  }

  async run( message: CommandoMessage, args: string[], fromPattern: boolean, result?: ArgumentCollectorResult<object>): Promise<Message | Message[] | null>
  {
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) )
      return this.subcommands[args[0]].command.delegate( message, args.slice( 1 ) )

    if ( this.options.dummy )
      return message.say( await this.help( message ) )

    const parsedArgs = parseArgs( args, this.options.args || [], message )
    if ( !parsedArgs )
      return message.say( await this.help( message ) )

    return this.runDefault( message, parsedArgs )
  }

  abstract async runDefault( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>

  async help( message: CommandoMessage ): Promise<string>
  {
    return help( this, message )
  }
}


export abstract class NyaCommand
{
  subcommands: SubcommandList = {}

  constructor( public module: ModuleBase, public options: SubcommandOptions = {} )
  {
    if ( options.subcommands )
      this.subcommands = options.subcommands
    delete this.options.subcommands
  }

  async delegate( message: CommandoMessage, args: string[] ): Promise<Message | Message[] | null>
  {
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) )
      return this.subcommands[args[0]].command.delegate( message, args.slice( 1 ) )

    if ( this.options.dummy )
      return message.say( await this.help( message ) )

    const parsedArgs = parseArgs( args, this.options.args || [], message )
    if ( !parsedArgs )
      return message.say( await this.help( message ) )
    return this.run( message, parsedArgs )
  }

  abstract async run( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>

  async help( message: CommandoMessage ): Promise<string>
  {
    return help( this, message )
  }
}


function usageArgs( args: ArgumentSpec[] ): string
{
  const argStrings = []
  for ( const arg of args ) {
    let s = arg.key
    if ( arg.optional )
      s = `[${s}]`
    if ( arg.type.startsWith( '...' ) )
      s = `${s}...`
    argStrings.push( s )
  }
  return argStrings.join( ' ' )
}


async function help( self: NyaBaseCommand | NyaCommand, message: CommandoMessage ): Promise<string>
{
  const subcommands = Object.keys( self.subcommands )
  const subcommandList = subcommands.join( ', ' )

  let prefix
  try {
    if ( message.guild ) {
      const guild = await self.module.backend.getGuildBySnowflake( message.guild.id )
      prefix = await self.module.backend.getSetting( 'Prefix', guild.id )
    } else {
      prefix = await self.module.backend.getSetting( 'Prefix' )
    }
  } catch ( error ) {
    if ( message.guild )
      log( `Failed to fetch prefix for guild ${message.guild.id}:`, error )
    else
      log( `Failed to fetch global prefix` )
    throw new Error( "Failed to fetch prefix" )
  }

  let reply = `**${prefix}${self.options.name}**`
  if ( self.options.description )
  reply += `: ${self.options.description}`

  reply += '\n'
  if ( self.options.dummy ) {
    if ( subcommands.length )
      reply += `This command is not usable by itself, but through one of its subcommands: ${subcommandList}`
    else
      throw new Error( `Command "${self.options.name}" is marked as dummy but has no specified subcommands.` )
  } else {
    const args = usageArgs( self.options.args || [] )
    reply += `Usage: \`${prefix}${self.options.name}`
    if ( args )
      reply += ` ${args}`
    reply += '`'
    if ( subcommands.length )
      reply += `\nSubcommands: ${subcommandList}`
  }
  return reply
}


function parseArgs( values: string[], args: ArgumentSpec[], message: CommandoMessage ): Arguments | false
{
  const requiredArgs = args.map( ( arg, i ) => [arg, i] ).filter( ([arg, i]) => !( arg as ArgumentSpec ).optional )
  if ( requiredArgs.length && requiredArgs.length <= requiredArgs[requiredArgs.length - 1][1] )
    throw new Error( "Required arguments must precede optional arguments" )

  if ( values.length < requiredArgs.length )
    return false

  const catchAll = args.length && args[args.length - 1].catchAll
  const catchAllType = catchAll ? args[args.length - 1].type : 'string'
  const rest: any[] = []
  let error = false
  const parsed: NamedArguments = {}

  values.forEach( ( val, i ) => {
    const spec = args[i]
    if ( !spec && !catchAll ) {
      error = true
      return
    }
    let type = spec.type
    let addToRest = false
    if ( !spec || spec.catchAll ) {
      addToRest = true
      type = catchAllType
    }

    let parsedValue
    if ( type === 'string' )
      parsedValue = val
    else if ( type === 'number' )
      parsedValue = parseFloat( val )
    else if ( type === 'text-channel' )
      parsedValue = parseTextChannel( val, message )
    else
      throw new Error( `Unknown argument type: ${spec.type}` )
    if ( addToRest )
      rest.push( parsedValue )
    else
      parsed[spec.key] = parsedValue
  } )
  if ( error )
    return false
  return [parsed, rest]
}


function textChannelFilter( search: string )
{
  return ( channel: Channel ) => {
    if ( channel.type !== 'text' )
      return false
   return ( channel as TextChannel ).name.toLowerCase() === search.toLowerCase()
  }
}


export function parseTextChannel( arg: string, message: CommandoMessage ): TextChannel | string | null
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
  if ( !channels.size )
    return null
  if ( channels.size === 1)
    return ( channels.first() as TextChannel )
  return "Multiple channels with the same name found. Use #channel to discriminate."
}