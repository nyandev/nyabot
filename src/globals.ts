import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

export function logSprintf( from: string, ...args: any[] ): void
{
  if ( !args.length )
    return
  const timestamp: string = moment().format( "YY-MM-DD HH:mm:ss" )
  args[0] = sprintf( "%s: [%s] %s", timestamp, from, args[0] )
  console.log( sprintf.apply( null, args ) )
}

export function arrayOneOf( arr: any[] ): any
{
  return arr[Math.floor( Math.random() * arr.length )]
}

export function timeout( ms: number ): any
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