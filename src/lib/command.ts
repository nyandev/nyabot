import { ArgumentCollectorResult, Command, CommandoMessage } from 'discord.js-commando'
import { Channel, Message, Role, TextChannel } from 'discord.js'

import { debug, log } from '../globals'
import { ModuleBase } from '../modules/module'


interface ArgumentSpec {
  key: string
  helpKey?: string
  type: ArgumentType
  optional?: boolean
  catchAll?: boolean
}

type ArgumentType = 'string' | 'number' | 'role' | 'text-channel'
type Argument = string | number | Role | TextChannel | null

export interface Arguments {
  [key: string]: Argument | Argument[]
}

export interface CommandOptions {
  description: string
  dummy?: boolean
  guildOnly?: boolean
  ownerOnly?: boolean
  args?: ArgumentSpec[]
  usageNotes?: string
}

interface CommandInstanceOptions {
  name: string
  description: string
  guildOnly: boolean
  ownerOnly: boolean
  dummy: boolean
  args: ArgumentSpec[]
  usageNotes?: string
}

interface SubcommandConstructor {
  new ( module: ModuleBase, options: {name: string, baseGuildOnly: boolean, baseOwnerOnly: boolean} ): NyaCommand
  options: CommandOptions
  subcommands?: Subcommands
}

export interface Subcommands {
  [name: string]: SubcommandConstructor
}

interface SubcommandInstances {
  [name: string]: NyaCommand
}

interface BaseCommandInfo {
  name: string
  group: string
  description: string
  dummy?: boolean
  args?: ArgumentSpec[]
  guildOnly?: boolean
  ownerOnly?: boolean
  subcommands?: Subcommands
}


const mixins = {
  delegate: async function( message: CommandoMessage, args: string[] )
  {
    if ( args[0] && this.subcommands.hasOwnProperty( args[0] ) )
      return this.subcommands[args[0]].delegate( message, args.slice( 1 ) )

    const usageMsg = async () => message.say( await this.help( message ) )
    if ( this.options.dummy )
      return await usageMsg()

    const parsedArgs = await parseArgs( args, this.options.args || [], message )
    if ( !parsedArgs )
      return await usageMsg()
    return this.execute( message, parsedArgs )
  },
  help: async function( message: CommandoMessage ): Promise<string>
  {
    const subcommands = Object.keys( this.subcommands )
    const subcommandList = subcommands.join( ', ' )
    let prefix
    try {
      if ( message.guild ) {
      const guild = await this.module.backend.getGuildBySnowflake( message.guild.id )
      prefix = await this.module.backend.getSetting( 'Prefix', guild.id )
      } else {
        prefix = await this.module.backend.getSetting( 'Prefix' )
      }
    } catch ( error ) {
      if ( message.guild )
        log( `Failed to fetch prefix for guild ${message.guild.id}:`, error )
      else
        log( `Failed to fetch global prefix:`, error )
      throw new Error( "Failed to fetch prefix" )
    }

    let reply = `**${prefix}${this.options.name}**`
    if ( this.options.description )
      reply += `: ${this.options.description}`

    reply += '\n'
    if ( this.options.dummy ) {
      if ( subcommands.length )
        reply +=`This command is not usable by itself, but through one of its subcommands: ${subcommandList}`
      else
        throw new Error( `Command "${this.options.name}" is marked as dummy but has no specified subcommands.` )
    } else {
      const args = usageArgs( this.options.args || [] )
      reply += `Usage: \`${prefix}${this.options.name}`
      if ( args )
        reply += ` ${args}`
      reply += '`'
      if ( this.options.usageNotes )
        reply += `\n${this.options.usageNotes}`
      if ( subcommands.length )
        reply += `\nSubcommands: ${subcommandList}`
    }
    return reply
  }
}


function buildSubcommands( module: ModuleBase, subcommandList: any = {}, baseOptions: any ): { [name: string]: NyaCommand }
{
  const subcommands: { [name: string]: NyaCommand } = {}

  for ( const [name, command] of Object.entries( subcommandList ) ) {
    const ctor = command as any
    subcommands[name] = new ctor( module, {
      name: `${baseOptions.name} ${name}`,
      baseGuildOnly: baseOptions.guildOnly,
      baseOwnerOnly: baseOptions.ownerOnly
    } )
  }
  return subcommands
}


export abstract class NyaBaseCommand extends Command
{
  subcommands: { [name: string]: NyaCommand } = {}

  constructor( protected module: ModuleBase, private options: BaseCommandInfo )
  {
    super( module.client, {
      name: options.name,
      memberName: options.name,
      group: options.group,
      description: options.description,
      guildOnly: Boolean( options.guildOnly ),
      ownerOnly: Boolean( options.ownerOnly ),
      argsType: 'multiple'
    } )

    if ( options.subcommands )
      this.subcommands = buildSubcommands( module, options.subcommands, {
        name: options.name,
        guildOnly: Boolean( options.guildOnly ),
        ownerOnly: Boolean( options.ownerOnly )
      } )
  }

  delegate = mixins.delegate
  help = mixins.help

  async run( message: CommandoMessage, args: string[], fromPattern: boolean, result?: ArgumentCollectorResult<object>): Promise<Message | Message[] | null>
  {
    return this.delegate( message, args )
  }

  // I'd prefer to call this `run` but Commando uses that method name
  async execute( message: CommandoMessage, args: Arguments): Promise<Message | Message[] | null>
  {
    return null
  }
}


export abstract class NyaCommand
{
  protected options: CommandInstanceOptions
  private subcommands: SubcommandInstances

  constructor( public module: ModuleBase, options: { name: string, baseGuildOnly: boolean, baseOwnerOnly: boolean } )
  {
    const cls = this.constructor as SubcommandConstructor

    this.options = {
      name: options.name,
      description: cls.options.description,
      dummy: Boolean( cls.options.dummy ),
      guildOnly: Boolean( options.baseGuildOnly ),
      ownerOnly: Boolean( options.baseOwnerOnly ),
      args: cls.options.args || []
    }

    if ( cls.options.guildOnly != null )
      this.options.guildOnly = cls.options.guildOnly
    if ( cls.options.ownerOnly != null )
      this.options.ownerOnly = cls.options.ownerOnly
    if ( cls.options.usageNotes )
      this.options.usageNotes = cls.options.usageNotes

    this.subcommands = buildSubcommands( module, cls.subcommands, this.options )
  }

  delegate = mixins.delegate
  help = mixins.help

  async execute( message: CommandoMessage, args: Arguments ): Promise<Message | Message[] | null>
  {
    return null
  }
}


function usageArgs( args: ArgumentSpec[] ): string
{
  const argStrings = []
  for ( const arg of args ) {
    let s = `<${arg.helpKey || arg.key}>`
    if ( arg.optional )
      s = `[${s}]`
    if ( arg.catchAll )
      s = `${s}...`
    argStrings.push( s )
  }
  return argStrings.join( ' ' )
}


async function parseArgs( values: string[], args: ArgumentSpec[], message: CommandoMessage ): Promise<Arguments | false>
{
  const requiredArgs = args.map( ( arg, i ) => [arg, i] ).filter( ([arg, i]) => !( arg as ArgumentSpec ).optional )
  if ( requiredArgs.length && requiredArgs.length <= requiredArgs[requiredArgs.length - 1][1] )
    throw new Error( "Required arguments must precede optional arguments" )

  if ( values.length < requiredArgs.length )
    return false

  const catchAll = args.length && args[args.length - 1].catchAll
  const catchAllKey = catchAll ? args[args.length - 1].key : ''
  const catchAllType = catchAll ? args[args.length - 1].type : null
  const catchAllList: Argument[] = []
  const parsed: Arguments = {}

  for ( const [i, val] of values.entries() ) {
    const spec = args[i]
    let type
    let addToCatchAll

    if ( !spec ) {
      if ( !catchAll )
        return false
      addToCatchAll = true
      type = catchAllType
    } else {
      addToCatchAll = spec.catchAll
      type = spec.type
    }

    if ( !type )
      return false

    let parsedValue
    if ( type === 'string' )
      parsedValue = val
    else if ( type === 'number' )
      parsedValue = parseFloat( val )
    else if ( type === 'role' )
      parsedValue = await parseRole( val, message )
    else if ( type === 'text-channel' )
      parsedValue = await parseTextChannel( val, message )
    else
      throw new Error( `Unknown argument type: ${spec.type}` )
    if ( addToCatchAll )
      catchAllList.push( parsedValue )
    else
      parsed[spec.key] = parsedValue
  }

  if ( catchAll )
    parsed[catchAllKey] = catchAllList
  return parsed
}


async function parseRole( arg: string, message: CommandoMessage ): Promise<Role | string | null>
{
  if ( !arg )
    return null

  const roleMention = arg.match( /^<@&(\d+)>$/ )
  if ( roleMention ) {
    const role = await message.guild.roles.fetch( roleMention[1] )
    return role || null
  }

  const allRoles = await message.guild.roles.fetch()
  const roles = allRoles.filter( ( role: Role ) => role.name.toLowerCase() === arg.toLowerCase() )
  if ( roles.size === 0 )
    return null
  if ( roles.size === 1 )
    return roles.first() as Role
  return 'multiple_roles_same_name'
}


function textChannelFilter( search: string )
{
  return ( channel: Channel ) => {
    if ( channel.type !== 'text' )
      return false
   return ( channel as TextChannel ).name.toLowerCase() === search.toLowerCase()
  }
}


export async function parseTextChannel( arg: string, message: CommandoMessage ): Promise<TextChannel | string | null>
{
  if ( !arg || !message.guild )
    return null

  const channelMention = arg.match( /^<#(\d+)>$/ )
  if ( channelMention ) {
    const channel = await message.client.channels.fetch( channelMention[1] )
    return ( channel && channel.type === 'text' ) ? ( channel as TextChannel ) : null
  }

  const channels = message.guild.channels.cache.filter( textChannelFilter( arg ) )
  if ( channels.size === 0 )
    return null
  if ( channels.size === 1 )
    return ( channels.first() as TextChannel )
  return 'multiple_channels_same_name'
}
