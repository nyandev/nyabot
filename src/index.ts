// to debug, pass --inspect --inspect-brk
if ( global.v8debug )
{
  global.v8debug.Debug.setBreakOnException()
  global.v8debug.Debug.setBreakOnUncaughtException()
}

import Graceful from 'node-graceful'
import minimist = require( 'minimist' )
import fs = require( 'fs' )

import { logSprintf } from './globals'
import { Backend } from './lib/backend'
import { Nya } from './lib/nya'

// Main run function.
// Uses Graceful and some promise trickery to handle Ctrl+C & exit neatly.
async function run( configuration: any )
{
  const backend = new Backend( configuration.backend )
  await backend.initialize()

  const nya = new Nya( configuration.bot, backend )

  nya.initialize().then( async () =>
  {
    logSprintf( 'core', 'Bot started!' )
    let link = await nya.generateInvite()
    logSprintf( 'core', 'Invite link: %s', link )

    Graceful.on( 'exit', async () =>
    {
      await nya.stop()

      for ( const module of nya._modules )
        await module.destroy()

      await backend.destroy()
      return nya.stoppedPromise
    })
  }).catch( ( error: Error ) =>
  {
    throw error
  })
}

try
{
  // This is the main entrypoint.
  // Load a JSON configuration file and call the runfunc.

  const argv: any = minimist( process.argv.slice( 2 ) )
  const cfgname: string = ( 'c' in argv ) ? argv.c
    : ( 'config' in argv ) ? argv.config
    : ( 'configuration' in argv ) ? argv.configuration
    : null

  if ( !cfgname )
    throw new Error( 'Specify a configuration file to load' )

  const cfgfile = fs.readFileSync( cfgname, 'utf8' )
  const configuration = JSON.parse( cfgfile )

  run( configuration )
}
catch ( error )
{
  logSprintf( 'core', 'Hard error:' )
  console.log( error )
}