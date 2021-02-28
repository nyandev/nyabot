import * as moment from 'moment'
import { sprintf } from 'sprintf-js'

export const apos = '\u2019'

export function logSprintf( from: string, ...args: any[] ): void
{
  if ( !args.length )
    return
  const timestamp: string = moment().format( "YY-MM-DD HH:mm:ss" )
  args[0] = sprintf( "%s: [%s] %s", timestamp, from, args[0] )
  console.log( sprintf.apply( null, args ) )
}

export function errorSprintf( error: any, ...args: any[] ): void
{
  logSprintf( "error", ...args )
  console.log( error )
}

export function logPrint( from: string, ...args: any[] ): void
{
  if ( !args.length )
    return
  const timestamp: string = moment().format( "YY-MM-DD HH:mm:ss" )
  const line: string = args.join( " " )
  console.log( sprintf( "%s: [%s] %s", timestamp, from, line ) )
}

export function arrayOneOf( arr: any[] ): any
{
  return arr[Math.floor( Math.random() * arr.length )]
}

export function timeout( ms: number ): Promise<void>
{
  return new Promise( resolve => { setTimeout( resolve, ms ) } )
};

export function promiseSerial( funcs: any[] ): void
{
  funcs.reduce( ( promise, func ) =>
    promise.then( ( result: any ) => func().then( Array.prototype.concat.bind( result ) ) ),
    Promise.resolve( [] ) )
}

export function datetimeNow(): string
{
  return moment().format( 'YYYY-MM-DD HH:mm:ss.SSSSSS' )
}

/*  Log for debugging.
 */
export function debug(...args: any[]): void
{
  if ( true /* replace with configuration.debug */ )
    logPrint( "debug", ...args )
    //console.log('[DEBUG]', ...args)
}

/*  Log for end users (intended to be written to a file in production)
 */
export function log(...args: any[]): void
{
  logPrint( "production", ...args )
  //console.log(...args)
}

export function logThrow( error: string ): never
{
  log( error )
  throw new Error( error )
}
