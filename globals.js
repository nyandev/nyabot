'use strict'

const moment = require( 'moment' );
const sprintf = require( 'sprintf-js' ).sprintf;

global.logSprintf = ( from, ...args ) =>
{
  if ( !args.length )
    return;
  const timestamp = moment().format( "YY-MM-DD HH:mm:ss" );
  args[0] = sprintf( "%s: [%s] %s", timestamp, from, args[0] );
  console.log( sprintf( ...args ) );
};

global.arrayOneOf = ( arr ) =>
{
  return arr[Math.floor( Math.random() * arr.length )];
};

global.timeout = ( ms ) =>
{
  return new Promise( resolve => { setTimeout( resolve, ms ) } );
};

global.promiseSerial = funcs =>
  funcs.reduce( ( promise, func ) =>
    promise.then( result => func().then( Array.prototype.concat.bind( result ) ) ),
    Promise.resolve( [] ) );
